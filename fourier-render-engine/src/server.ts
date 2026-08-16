import { dirname, join, resolve } from "node:path";
import { toErrorResponse } from "./errors.ts";
import { summarizeProject } from "./project-summary.ts";
import { renderProject, validateProject } from "./renderer.ts";
import type {
  RenderProgress,
  RenderResult,
  TtsOptions,
} from "./types.ts";

type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

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

export interface ServerOptions {
  port?: number;
  hostname?: string;
  ffmpegPath?: string;
  ffprobePath?: string;
  tts?: TtsOptions;
}

interface RenderRequest {
  project: string;
  output?: string;
  overwrite?: boolean;
  crf?: number;
  preset?: string;
  frameConcurrency?: number;
  validateMedia?: boolean;
}

const jobs = new Map<string, RenderJob>();

function json(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new TypeError("Content-Type 必须是 application/json");
  }
  const body = (await request.json()) as unknown;
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new TypeError("请求体必须是 JSON 对象");
  }
  return body as Record<string, unknown>;
}

function requiredString(
  body: Record<string, unknown>,
  field: string,
): string {
  const value = body[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${field} 必须是非空字符串`);
  }
  return value;
}

function optionalString(
  body: Record<string, unknown>,
  field: string,
): string | undefined {
  const value = body[field];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${field} 必须是非空字符串`);
  }
  return value;
}

function optionalBoolean(
  body: Record<string, unknown>,
  field: string,
): boolean | undefined {
  const value = body[field];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new TypeError(`${field} 必须是布尔值`);
  return value;
}

function optionalNumber(
  body: Record<string, unknown>,
  field: string,
): number | undefined {
  const value = body[field];
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${field} 必须是有限数值`);
  }
  return value;
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

function trimFinishedJobs(): void {
  const finished = [...jobs.values()]
    .filter((job) =>
      ["completed", "failed", "cancelled"].includes(job.status)
    )
    .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));
  for (const job of finished.slice(0, Math.max(0, finished.length - 100))) {
    jobs.delete(job.id);
  }
}

function startRenderJob(
  body: Record<string, unknown>,
  options: ServerOptions,
): RenderJob {
  const project = resolve(requiredString(body, "project"));
  const outputSource = optionalString(body, "output");
  const output =
    outputSource === undefined
      ? join(dirname(project), "output.mp4")
      : resolve(outputSource);
  const controller = new AbortController();
  const now = new Date().toISOString();
  const job: RenderJob = {
    id: crypto.randomUUID(),
    status: "queued",
    createdAt: now,
    updatedAt: now,
    progress: {
      phase: "validating",
      progress: 0,
      totalFrames: 0,
      message: "等待执行",
    },
    controller,
  };
  jobs.set(job.id, job);
  const overwrite = optionalBoolean(body, "overwrite");
  const crf = optionalNumber(body, "crf");
  const preset = optionalString(body, "preset");
  const frameConcurrency = optionalNumber(body, "frameConcurrency");
  const validateMedia = optionalBoolean(body, "validateMedia");
  const request: RenderRequest = {
    project,
    output,
    ...(overwrite === undefined ? {} : { overwrite }),
    ...(crf === undefined ? {} : { crf }),
    ...(preset === undefined ? {} : { preset }),
    ...(frameConcurrency === undefined ? {} : { frameConcurrency }),
    ...(validateMedia === undefined ? {} : { validateMedia }),
  };

  void (async () => {
    job.status = "running";
    job.updatedAt = new Date().toISOString();
    try {
      job.result = await renderProject(request.project, {
        output: request.output ?? output,
        ...(request.overwrite === undefined
          ? {}
          : { overwrite: request.overwrite }),
        ...(request.crf === undefined ? {} : { crf: request.crf }),
        ...(request.preset === undefined ? {} : { preset: request.preset }),
        ...(request.frameConcurrency === undefined
          ? {}
          : { frameConcurrency: request.frameConcurrency }),
        ...(request.validateMedia === undefined
          ? {}
          : { validateMedia: request.validateMedia }),
        ...(options.ffmpegPath === undefined
          ? {}
          : { ffmpegPath: options.ffmpegPath }),
        ...(options.ffprobePath === undefined
          ? {}
          : { ffprobePath: options.ffprobePath }),
        ...(options.tts === undefined ? {} : { tts: options.tts }),
        signal: controller.signal,
        onProgress(progress) {
          job.progress = progress;
          job.updatedAt = new Date().toISOString();
        },
      });
      job.status = "completed";
    } catch (error) {
      const response = toErrorResponse(error);
      job.error = response.error;
      job.status =
        controller.signal.aborted ? "cancelled" : "failed";
    } finally {
      job.updatedAt = new Date().toISOString();
      trimFinishedJobs();
    }
  })();
  return job;
}

export function createRequestHandler(
  options: ServerOptions = {},
): (request: Request) => Promise<Response> {
  return async (request) => {
    const url = new URL(request.url);
    try {
      if (request.method === "GET" && url.pathname === "/health") {
        return json({
          status: "ok",
          service: "render-engine",
          version: "1.0.0",
        });
      }
      if (request.method === "POST" && url.pathname === "/v1/validate") {
        const body = await readJsonObject(request);
        const validateMedia = optionalBoolean(body, "validateMedia");
        const project = await validateProject(
          resolve(requiredString(body, "project")),
          {
            ...(options.ffmpegPath === undefined
              ? {}
              : { ffmpegPath: options.ffmpegPath }),
            ...(options.ffprobePath === undefined
              ? {}
              : { ffprobePath: options.ffprobePath }),
            ...(options.tts === undefined ? {} : { tts: options.tts }),
            ...(validateMedia === undefined ? {} : { validateMedia }),
          },
        );
        return json({ valid: true, ir: summarizeProject(project) });
      }
      if (request.method === "POST" && url.pathname === "/v1/render") {
        const body = await readJsonObject(request);
        const job = startRenderJob(body, options);
        return json(publicJob(job), 202);
      }
      const jobMatch = /^\/v1\/jobs\/([0-9a-f-]+)$/.exec(url.pathname);
      if (jobMatch !== null) {
        const jobId = jobMatch[1] ?? "";
        const job = jobs.get(jobId);
        if (job === undefined) return json({ error: "job_not_found" }, 404);
        if (request.method === "GET") return json(publicJob(job));
        if (request.method === "DELETE") {
          if (job.status === "queued" || job.status === "running") {
            job.controller.abort();
            job.status = "cancelled";
            job.updatedAt = new Date().toISOString();
          }
          return json(publicJob(job));
        }
      }
      return json({ error: "not_found" }, 404);
    } catch (error) {
      if (error instanceof TypeError) {
        return json(
          { error: { code: "BAD_REQUEST", message: error.message } },
          400,
        );
      }
      return json(toErrorResponse(error), 422);
    }
  };
}

export function startServer(options: ServerOptions = {}): Bun.Server<unknown> {
  return Bun.serve({
    port: options.port ?? 3210,
    hostname: options.hostname ?? "127.0.0.1",
    fetch: createRequestHandler(options),
  });
}

if (import.meta.main) {
  const port = Number(Bun.env.PORT ?? "3210");
  const hostname = Bun.env.HOST ?? "127.0.0.1";
  const tts: TtsOptions = {
    ...(Bun.env.TTS_HTTP_URL === undefined
      ? {}
      : { baseUrl: Bun.env.TTS_HTTP_URL }),
    ...(Bun.env.TTS_MODEL === undefined
      ? {}
      : { modelPath: Bun.env.TTS_MODEL }),
    ...(Bun.env.TTS_CACHE === undefined
      ? {}
      : { cacheDirectory: Bun.env.TTS_CACHE }),
    ...(Bun.env.TTS_HTTP_TIMEOUT_MS === undefined
      ? {}
      : { requestTimeoutMs: Number(Bun.env.TTS_HTTP_TIMEOUT_MS) }),
  };
  const server = startServer({
    port,
    hostname,
    ...(Bun.env.FFMPEG_PATH === undefined
      ? {}
      : { ffmpegPath: Bun.env.FFMPEG_PATH }),
    ...(Bun.env.FFPROBE_PATH === undefined
      ? {}
      : { ffprobePath: Bun.env.FFPROBE_PATH }),
    ...(Object.keys(tts).length === 0 ? {} : { tts }),
  });
  console.log(`render-engine listening on http://${server.hostname}:${server.port}`);
}
