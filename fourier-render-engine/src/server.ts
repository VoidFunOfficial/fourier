import { createHash, timingSafeEqual } from "node:crypto";
import { lstat, mkdir, mkdtemp, realpath, rm, stat } from "node:fs/promises";
import { lstatSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { isIP } from "node:net";
import { chromium } from "playwright";
import { RenderEngineError, toErrorResponse } from "./errors.ts";
import type { RenderProgress, RenderResult, TtsOptions } from "./types.ts";

type JobStatus = "queued" | "running" | "cancelling" | "completed" | "failed" | "cancelled";

interface RenderJob {
  id: string;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  progress: RenderProgress;
  controller: AbortController;
  result?: RenderResult;
  error?: ReturnType<typeof toErrorResponse>["error"];
}

export interface ServerLimits {
  readonly bodyBytes?: number;
  readonly renderConcurrency?: number;
  readonly renderQueue?: number;
  readonly validateConcurrency?: number;
  readonly validateQueue?: number;
  readonly validateTimeoutMs?: number;
  readonly renderTimeoutMs?: number;
  readonly completedJobs?: number;
  readonly jobTtlMs?: number;
}

export interface ServerOptions {
  port?: number;
  hostname?: string;
  ffmpegPath?: string;
  ffprobePath?: string;
  tts?: TtsOptions;
  projectRoots?: readonly string[];
  outputRoots?: readonly string[];
  remote?: {
    readonly enabled: boolean;
    readonly bearerToken: string;
    readonly tls: { readonly cert: string; readonly key: string };
  };
  limits?: ServerLimits;
  allowOverwrite?: boolean;
  allowedOrigins?: readonly string[];
}

interface RenderRequest {
  project: string;
  output: string;
  overwrite: boolean;
  crf?: number;
  preset?: string;
  frameConcurrency?: number;
  validateMedia?: boolean;
}

class HttpError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) {
    super(message);
  }
}

class Scheduler {
  readonly #concurrency: number;
  readonly #maxQueued: number;
  readonly #queue: Array<{
    task: () => Promise<unknown>;
    resolve: (value: unknown) => void;
    reject: (error: unknown) => void;
    signal?: AbortSignal;
  }> = [];
  #running = 0;

  constructor(concurrency: number, maxQueued: number) {
    this.#concurrency = concurrency;
    this.#maxQueued = maxQueued;
  }

  submit<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(new RenderEngineError("RENDER_CANCELLED", "任务已取消"));
    if (this.#running >= this.#concurrency && this.#queue.length >= this.#maxQueued) {
      throw new HttpError("SERVER_BUSY", "Server scheduler 已饱和", 429);
    }
    return new Promise<T>((resolve, reject) => {
      const item = { task, resolve: resolve as (value: unknown) => void, reject, ...(signal === undefined ? {} : { signal }) };
      if (signal !== undefined) {
        signal.addEventListener("abort", () => {
          const index = this.#queue.indexOf(item);
          if (index >= 0) {
            this.#queue.splice(index, 1);
            reject(new RenderEngineError("RENDER_CANCELLED", "排队任务已取消"));
          }
        }, { once: true });
      }
      this.#queue.push(item);
      this.#drain();
    });
  }

  #drain(): void {
    while (this.#running < this.#concurrency) {
      const item = this.#queue.shift();
      if (item === undefined) return;
      if (item.signal?.aborted) {
        item.reject(new RenderEngineError("RENDER_CANCELLED", "排队任务已取消"));
        continue;
      }
      this.#running += 1;
      void item.task().then(item.resolve, item.reject).finally(() => {
        this.#running -= 1;
        this.#drain();
      });
    }
  }
}

const DEFAULT_LIMITS = Object.freeze({
  bodyBytes: 64 * 1024,
  renderConcurrency: 1,
  renderQueue: 8,
  validateConcurrency: 1,
  validateQueue: 8,
  validateTimeoutMs: 30 * 60 * 1_000,
  renderTimeoutMs: 2 * 60 * 60 * 1_000,
  completedJobs: 100,
  jobTtlMs: 60 * 60 * 1_000,
});

function loopback(hostname: string): boolean {
  return hostname === "::1" || (isIP(hostname) === 4 && hostname.startsWith("127."));
}

function within(root: string, path: string): boolean {
  const value = relative(root, path);
  return value === "" || (value !== ".." && !value.startsWith(`..${sep}`) && !isAbsolute(value));
}

function configuredRoots(
  paths: readonly string[] | undefined,
  code: "PROJECT_PATH_NOT_ALLOWED" | "OUTPUT_PATH_NOT_ALLOWED",
): readonly string[] {
  const candidates = paths ?? [process.cwd()];
  if (candidates.length === 0) throw new HttpError(code, "roots 不能为空", 403);
  return Object.freeze([...new Set(candidates.map((path) => {
    const canonical = realpathSync(resolve(path));
    if (!statSync(canonical).isDirectory()) throw new HttpError(code, `root 不是目录: ${path}`, 403);
    return canonical;
  }))]);
}

function boundedLimit(
  value: number,
  field: keyof ServerLimits,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RenderEngineError(
      "SECURE_EXECUTION_LIMIT",
      `Server limit ${field} 必须在 ${minimum}—${maximum} 之间`,
      { field, value, minimum, maximum },
    );
  }
  return value;
}

function configuredLimits(input: ServerLimits = {}): Required<ServerLimits> {
  return Object.freeze({
    bodyBytes: boundedLimit(input.bodyBytes ?? DEFAULT_LIMITS.bodyBytes, "bodyBytes", 1, DEFAULT_LIMITS.bodyBytes),
    renderConcurrency: boundedLimit(input.renderConcurrency ?? DEFAULT_LIMITS.renderConcurrency, "renderConcurrency", 1, DEFAULT_LIMITS.renderConcurrency),
    renderQueue: boundedLimit(input.renderQueue ?? DEFAULT_LIMITS.renderQueue, "renderQueue", 0, DEFAULT_LIMITS.renderQueue),
    validateConcurrency: boundedLimit(input.validateConcurrency ?? DEFAULT_LIMITS.validateConcurrency, "validateConcurrency", 1, DEFAULT_LIMITS.validateConcurrency),
    validateQueue: boundedLimit(input.validateQueue ?? DEFAULT_LIMITS.validateQueue, "validateQueue", 0, DEFAULT_LIMITS.validateQueue),
    validateTimeoutMs: boundedLimit(input.validateTimeoutMs ?? DEFAULT_LIMITS.validateTimeoutMs, "validateTimeoutMs", 1, DEFAULT_LIMITS.validateTimeoutMs),
    renderTimeoutMs: boundedLimit(input.renderTimeoutMs ?? DEFAULT_LIMITS.renderTimeoutMs, "renderTimeoutMs", 1, DEFAULT_LIMITS.renderTimeoutMs),
    completedJobs: boundedLimit(input.completedJobs ?? DEFAULT_LIMITS.completedJobs, "completedJobs", 1, DEFAULT_LIMITS.completedJobs),
    jobTtlMs: boundedLimit(input.jobTtlMs ?? DEFAULT_LIMITS.jobTtlMs, "jobTtlMs", 1, DEFAULT_LIMITS.jobTtlMs),
  });
}

function configuredExecutable(explicit: string | undefined, fallback: "ffmpeg" | "ffprobe"): string | undefined {
  const candidate = explicit === undefined
    ? Bun.which(fallback)
    : isAbsolute(explicit)
      ? explicit
      : Bun.which(explicit);
  if (candidate === null || candidate === undefined) {
    if (explicit === undefined) return undefined;
    throw new RenderEngineError("SECURE_EXECUTION_UNAVAILABLE", `找不到配置的 ${fallback}: ${explicit}`);
  }
  const canonical = realpathSync(resolve(candidate));
  if (!statSync(canonical).isFile()) {
    throw new RenderEngineError("SECURE_EXECUTION_UNAVAILABLE", `${fallback} 不是普通文件: ${canonical}`);
  }
  return canonical;
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { "cache-control": "no-store" } });
}

async function readJsonObject(request: Request, maxBytes: number): Promise<Record<string, unknown>> {
  const encoding = request.headers.get("content-encoding");
  if (encoding !== null && encoding.toLowerCase() !== "identity") throw new HttpError("BAD_REQUEST", "不接受压缩请求体", 400);
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) throw new HttpError("BAD_REQUEST", "Content-Type 必须是 application/json", 400);
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) throw new HttpError("PAYLOAD_TOO_LARGE", "请求体超过 64 KiB", 413);
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader !== undefined) {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new HttpError("PAYLOAD_TOO_LARGE", "请求体超过 64 KiB", 413);
      }
      chunks.push(chunk.value);
    }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let value: unknown;
  try { value = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new HttpError("BAD_REQUEST", "请求体不是有效 JSON", 400); }
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new HttpError("BAD_REQUEST", "请求体必须是对象", 400);
  return value as Record<string, unknown>;
}

function onlyFields(body: Record<string, unknown>, allowed: readonly string[]): void {
  const known = new Set(allowed);
  const unknown = Object.keys(body).filter((field) => !known.has(field));
  if (unknown.length > 0) throw new HttpError("BAD_REQUEST", `未知字段: ${unknown.join(", ")}`, 400);
}

function requiredString(body: Record<string, unknown>, field: string): string {
  const value = body[field];
  if (typeof value !== "string" || value.length === 0 || value.length > 4096) throw new HttpError("BAD_REQUEST", `${field} 必须是有效路径字符串`, 400);
  return value;
}

function optionalString(body: Record<string, unknown>, field: string): string | undefined {
  if (body[field] === undefined) return undefined;
  return requiredString(body, field);
}

function optionalBoolean(body: Record<string, unknown>, field: string): boolean | undefined {
  const value = body[field];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new HttpError("BAD_REQUEST", `${field} 必须是 boolean`, 400);
  return value;
}

function optionalNumber(body: Record<string, unknown>, field: string): number | undefined {
  const value = body[field];
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new HttpError("BAD_REQUEST", `${field} 必须是有限数值`, 400);
  return value;
}

async function allowedProjectPath(source: string, roots: readonly string[]): Promise<string> {
  const canonical = await realpath(resolve(source)).catch(() => undefined);
  if (canonical === undefined || !(await stat(canonical)).isFile() || !roots.some((root) => within(root, canonical))) {
    throw new HttpError("PROJECT_PATH_NOT_ALLOWED", "project 不在允许 roots 内", 403);
  }
  return canonical;
}

async function allowedOutputPath(source: string, roots: readonly string[], allowOverwrite: boolean): Promise<string> {
  const target = resolve(source);
  const parent = await realpath(dirname(target)).catch(() => undefined);
  if (parent === undefined || !(await stat(parent)).isDirectory()) throw new HttpError("OUTPUT_PATH_NOT_ALLOWED", "output 父目录必须已存在", 403);
  const canonical = join(parent, basename(target));
  if (!roots.some((root) => within(root, canonical))) throw new HttpError("OUTPUT_PATH_NOT_ALLOWED", "output 不在允许 roots 内", 403);
  const existing = await lstat(canonical).catch(() => undefined);
  if (existing !== undefined && (existing.isSymbolicLink() || !existing.isFile() || !allowOverwrite)) {
    throw new HttpError("OUTPUT_PATH_NOT_ALLOWED", "现有 output 必须是允许覆盖的普通文件", 403);
  }
  return canonical;
}

function authenticate(request: Request, remote: ServerOptions["remote"]): void {
  if (remote?.enabled !== true) return;
  const header = request.headers.get("authorization");
  if (header === null || !header.startsWith("Bearer ")) throw new HttpError("AUTH_REQUIRED", "需要 Bearer token", 401);
  const actual = createHash("sha256").update(header.slice(7)).digest();
  const expected = createHash("sha256").update(remote.bearerToken).digest();
  if (!timingSafeEqual(actual, expected)) throw new HttpError("AUTH_INVALID", "Bearer token 无效", 403);
}

async function runSupervisedJob(
  request: Record<string, unknown>,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<unknown> {
  if (signal.aborted) throw new RenderEngineError("RENDER_CANCELLED", "job worker 已取消");
  const temporaryHome = await mkdtemp(join(tmpdir(), "fourier-render-job-"));
  await mkdir(join(temporaryHome, "tmp"), { recursive: true, mode: 0o700 });
  const workerPath = fileURLToPath(new URL("./server-job-worker.ts", import.meta.url));
  const executableParts = chromium.executablePath().split(sep);
  const registryIndex = executableParts.lastIndexOf("ms-playwright");
  const playwrightBrowsersPath = registryIndex < 0
    ? dirname(dirname(dirname(chromium.executablePath())))
    : executableParts.slice(0, registryIndex + 1).join(sep) || sep;
  const child = Bun.spawn([process.execPath, workerPath], {
    cwd: import.meta.dir,
    env: {
      HOME: temporaryHome,
      TMPDIR: join(temporaryHome, "tmp"),
      TMP: join(temporaryHome, "tmp"),
      TEMP: join(temporaryHome, "tmp"),
      LANG: "C.UTF-8",
      LC_ALL: "C.UTF-8",
      PLAYWRIGHT_BROWSERS_PATH: playwrightBrowsersPath,
    },
    stdin: new Blob([JSON.stringify(request)]),
    stdout: "pipe",
    stderr: "pipe",
    detached: process.platform !== "win32",
  });
  let timedOut = false;
  let forceKillTimer: ReturnType<typeof setTimeout> | undefined;
  const signalTree = (signalName: "SIGTERM" | "SIGKILL") => {
    if (process.platform !== "win32") {
      try {
        process.kill(-child.pid, signalName);
        return;
      } catch {
        // Fall through if the child exited before its process group formed.
      }
    }
    child.kill(signalName);
  };
  const terminate = () => {
    signalTree("SIGTERM");
    if (forceKillTimer === undefined) {
      forceKillTimer = setTimeout(() => {
        if (child.exitCode === null) signalTree("SIGKILL");
      }, 750);
    }
  };
  const onAbort = () => terminate();
  signal.addEventListener("abort", onAbort, { once: true });
  if (signal.aborted) terminate();
  const timeout = setTimeout(() => { timedOut = true; terminate(); }, timeoutMs);
  try {
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      readBoundedWorkerOutput(child.stdout, 32 * 1024 * 1024, "stdout", terminate),
      readBoundedWorkerOutput(child.stderr, 1024 * 1024, "stderr", terminate),
    ]);
    if (timedOut) throw new RenderEngineError("RENDER_TIMEOUT", "job worker 超时", { timeoutMs });
    if (signal.aborted) throw new RenderEngineError("RENDER_CANCELLED", "job worker 已取消");
    let envelope: unknown;
    try { envelope = JSON.parse(new TextDecoder().decode(stdout)); } catch { throw new RenderEngineError("SECURE_EXECUTION_PROTOCOL_INVALID", "job worker wire 无效"); }
    if (typeof envelope !== "object" || envelope === null || Array.isArray(envelope) || (envelope as Record<string, unknown>).revision !== 1) {
      throw new RenderEngineError("SECURE_EXECUTION_PROTOCOL_INVALID", "job worker revision 无效");
    }
    const record = envelope as Record<string, unknown>;
    if (exitCode !== 0 || record.ok !== true) {
      const error = record.error as Record<string, unknown> | undefined;
      throw new RenderEngineError(typeof error?.code === "string" ? error.code : "ARTIFACT_EXECUTION_FAILED", typeof error?.message === "string" ? error.message : "job worker 失败");
    }
    return record.value;
  } finally {
    clearTimeout(timeout);
    if (forceKillTimer !== undefined) {
      clearTimeout(forceKillTimer);
      forceKillTimer = undefined;
    }
    signal.removeEventListener("abort", onAbort);
    if (child.exitCode === null) {
      terminate();
      await child.exited.catch(() => undefined);
    }
    await rm(temporaryHome, { recursive: true, force: true });
  }
}

async function readBoundedWorkerOutput(
  stream: ReadableStream<Uint8Array>,
  limit: number,
  label: "stdout" | "stderr",
  terminate: () => void,
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > limit) {
        terminate();
        throw new RenderEngineError("SECURE_EXECUTION_LIMIT", `job worker ${label} 输出超限`, {
          limit,
          observedBytes: size,
        });
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function publicJob(job: RenderJob): Record<string, unknown> {
  return {
    id: job.id,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    progress: job.progress,
    ...(job.result === undefined ? {} : { result: job.result }),
    ...(job.error === undefined ? {} : { error: job.error }),
  };
}

export function createRequestHandler(options: ServerOptions = {}): (request: Request) => Promise<Response> {
  const limits = configuredLimits(options.limits);
  const projectRoots = configuredRoots(options.projectRoots, "PROJECT_PATH_NOT_ALLOWED");
  const outputRoots = configuredRoots(options.outputRoots, "OUTPUT_PATH_NOT_ALLOWED");
  const ffmpegPath = configuredExecutable(options.ffmpegPath, "ffmpeg");
  const ffprobePath = configuredExecutable(options.ffprobePath, "ffprobe");
  const jobs = new Map<string, RenderJob>();
  const renderScheduler = new Scheduler(limits.renderConcurrency, limits.renderQueue);
  const validateScheduler = new Scheduler(limits.validateConcurrency, limits.validateQueue);
  const prune = () => {
    const cutoff = Date.now() - limits.jobTtlMs;
    const finished = [...jobs.values()].filter((job) => ["completed", "failed", "cancelled"].includes(job.status));
    for (const job of finished.filter((job) => Date.parse(job.updatedAt) < cutoff)) jobs.delete(job.id);
    for (const job of finished.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(limits.completedJobs)) jobs.delete(job.id);
  };

  return async (request) => {
    const url = new URL(request.url);
    try {
      if (request.method === "GET" && url.pathname === "/health") return json({ status: "ok", service: "render-engine", version: "2.0.0" });
      if (!url.pathname.startsWith("/v1/")) return json({ error: "not_found" }, 404);
      const origin = request.headers.get("origin");
      if (origin !== null && !(options.allowedOrigins ?? []).includes(origin)) throw new HttpError("AUTH_INVALID", "Origin 未显式允许", 403);
      authenticate(request, options.remote);
      prune();

      if (request.method === "POST" && url.pathname === "/v1/validate") {
        const body = await readJsonObject(request, limits.bodyBytes);
        onlyFields(body, ["project", "validateMedia"]);
        const project = await allowedProjectPath(requiredString(body, "project"), projectRoots);
        const validateMedia = optionalBoolean(body, "validateMedia");
        const controller = new AbortController();
        const value = await validateScheduler.submit(() => runSupervisedJob({
          revision: 1,
          kind: "validate",
          project,
          options: {
            ...(ffmpegPath === undefined ? {} : { ffmpegPath }),
            ...(ffprobePath === undefined ? {} : { ffprobePath }),
            ...(options.tts === undefined ? {} : { tts: options.tts }),
            ...(validateMedia === undefined ? {} : { validateMedia }),
          },
        }, controller.signal, limits.validateTimeoutMs), controller.signal);
        return json(value);
      }

      if (request.method === "POST" && url.pathname === "/v1/render") {
        const body = await readJsonObject(request, limits.bodyBytes);
        onlyFields(body, ["project", "output", "overwrite", "crf", "preset", "frameConcurrency", "validateMedia"]);
        const id = crypto.randomUUID();
        const project = await allowedProjectPath(requiredString(body, "project"), projectRoots);
        const requestedOverwrite = optionalBoolean(body, "overwrite") ?? false;
        const overwrite = options.allowOverwrite === true && requestedOverwrite;
        if (requestedOverwrite && options.allowOverwrite !== true) throw new HttpError("OUTPUT_PATH_NOT_ALLOWED", "Server 不允许 overwrite", 403);
        const output = await allowedOutputPath(optionalString(body, "output") ?? join(outputRoots[0]!, `${id}.mp4`), outputRoots, overwrite);
        const now = new Date().toISOString();
        const job: RenderJob = {
          id,
          status: "queued",
          createdAt: now,
          updatedAt: now,
          progress: { phase: "validating", progress: 0, totalFrames: 0, message: "等待执行" },
          controller: new AbortController(),
        };
        const crf = optionalNumber(body, "crf");
        const preset = optionalString(body, "preset");
        const frameConcurrency = optionalNumber(body, "frameConcurrency");
        const validateMedia = optionalBoolean(body, "validateMedia");
        const renderRequest: RenderRequest = { project, output, overwrite, ...(crf === undefined ? {} : { crf }), ...(preset === undefined ? {} : { preset }), ...(frameConcurrency === undefined ? {} : { frameConcurrency }), ...(validateMedia === undefined ? {} : { validateMedia }) };
        const promise = renderScheduler.submit(async () => {
          job.status = "running";
          job.updatedAt = new Date().toISOString();
          return runSupervisedJob({
            revision: 1,
            kind: "render",
            project: renderRequest.project,
            options: {
              output: renderRequest.output,
              overwrite: renderRequest.overwrite,
              ...(renderRequest.crf === undefined ? {} : { crf: renderRequest.crf }),
              ...(renderRequest.preset === undefined ? {} : { preset: renderRequest.preset }),
              ...(renderRequest.frameConcurrency === undefined ? {} : { frameConcurrency: renderRequest.frameConcurrency }),
              ...(renderRequest.validateMedia === undefined ? {} : { validateMedia: renderRequest.validateMedia }),
              ...(ffmpegPath === undefined ? {} : { ffmpegPath }),
              ...(ffprobePath === undefined ? {} : { ffprobePath }),
              ...(options.tts === undefined ? {} : { tts: options.tts }),
            },
          }, job.controller.signal, limits.renderTimeoutMs);
        }, job.controller.signal);
        jobs.set(id, job);
        void promise.then((value) => {
          job.result = value as RenderResult;
          job.status = "completed";
        }, (error) => {
          job.error = toErrorResponse(error).error;
          job.status = job.controller.signal.aborted ? "cancelled" : "failed";
        }).finally(() => { job.updatedAt = new Date().toISOString(); prune(); });
        return json(publicJob(job), 202);
      }

      const match = /^\/v1\/jobs\/([0-9a-f-]+)$/.exec(url.pathname);
      if (match !== null) {
        const job = jobs.get(match[1]!);
        if (job === undefined) return json({ error: "job_not_found" }, 404);
        if (request.method === "GET") return json(publicJob(job));
        if (request.method === "DELETE") {
          if (job.status === "queued" || job.status === "running") {
            job.status = "cancelling";
            job.updatedAt = new Date().toISOString();
            job.controller.abort();
          }
          return json(publicJob(job));
        }
      }
      return json({ error: "not_found" }, 404);
    } catch (error) {
      if (error instanceof HttpError) return json({ error: { code: error.code, message: error.message } }, error.status);
      const response = toErrorResponse(error);
      const code = response.error.code;
      const status = code === "PAYLOAD_TOO_LARGE" ? 413 : code === "SERVER_BUSY" ? 429 : code === "RENDER_TIMEOUT" ? 504 : 422;
      return json(response, status);
    }
  };
}

function validateServerOptions(options: ServerOptions): void {
  const hostname = options.hostname ?? "127.0.0.1";
  if (loopback(hostname)) return;
  const remote = options.remote;
  if (
    remote?.enabled !== true || Buffer.byteLength(remote.bearerToken) < 32 ||
    remote.tls.cert.length === 0 || remote.tls.key.length === 0 ||
    options.projectRoots === undefined || options.projectRoots.length === 0 ||
    options.outputRoots === undefined || options.outputRoots.length === 0
  ) {
    throw new RenderEngineError("SECURE_EXECUTION_UNAVAILABLE", "非 loopback Server 必须配置 remote、TLS、32-byte token 与显式 roots");
  }
  for (const path of [remote.tls.cert, remote.tls.key]) {
    if (!lstatSync(resolve(path)).isFile()) throw new RenderEngineError("SECURE_EXECUTION_UNAVAILABLE", `TLS 文件无效: ${path}`);
  }
}

export function startServer(options: ServerOptions = {}): Bun.Server<unknown> {
  validateServerOptions(options);
  const hostname = options.hostname ?? "127.0.0.1";
  const remote = options.remote;
  return Bun.serve({
    port: options.port ?? 3210,
    hostname,
    fetch: createRequestHandler(options),
    ...(remote?.enabled === true ? { tls: { cert: Bun.file(resolve(remote.tls.cert)), key: Bun.file(resolve(remote.tls.key)) } } : {}),
  });
}

function envRoots(value: string | undefined): readonly string[] | undefined {
  if (value === undefined) return undefined;
  const roots = value.split(sep === "\\" ? ";" : ":").map((item) => item.trim()).filter(Boolean);
  return roots.length === 0 ? undefined : roots;
}

if (import.meta.main) {
  const hostname = Bun.env.HOST ?? "127.0.0.1";
  const projectRoots = envRoots(Bun.env.FOURIER_PROJECT_ROOTS);
  const outputRoots = envRoots(Bun.env.FOURIER_OUTPUT_ROOTS);
  const remoteEnabled = Bun.env.FOURIER_REMOTE_ENABLED === "1";
  const server = startServer({
    port: Number(Bun.env.PORT ?? "3210"),
    hostname,
    ...(projectRoots === undefined ? {} : { projectRoots }),
    ...(outputRoots === undefined ? {} : { outputRoots }),
    ...(remoteEnabled ? {
      remote: {
        enabled: true,
        bearerToken: Bun.env.FOURIER_BEARER_TOKEN ?? "",
        tls: { cert: Bun.env.FOURIER_TLS_CERT ?? "", key: Bun.env.FOURIER_TLS_KEY ?? "" },
      },
    } : {}),
    ...(Bun.env.FOURIER_ALLOW_OVERWRITE === "1" ? { allowOverwrite: true } : {}),
    ...(Bun.env.FFMPEG_PATH === undefined ? {} : { ffmpegPath: Bun.env.FFMPEG_PATH }),
    ...(Bun.env.FFPROBE_PATH === undefined ? {} : { ffprobePath: Bun.env.FFPROBE_PATH }),
  });
  console.log(`render-engine listening on ${remoteEnabled ? "https" : "http"}://${server.hostname}:${server.port}`);
}
