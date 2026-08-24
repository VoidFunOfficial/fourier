import { execFile } from "node:child_process";
import { access, chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";
import { chromium, type Browser, type BrowserContext, type CDPSession, type Page } from "playwright";
import { BoundedWorkerRunner } from "./bounded-worker-runner.ts";
import { CoreError } from "./errors.ts";

export type SecureExecutionProfile = "artifact-inspect" | "project-materialize";

export interface SecureExecutionRequest {
  readonly profile: SecureExecutionProfile;
  readonly workerJavascript: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly signal?: AbortSignal;
}

interface SecureWireEnvelope {
  readonly revision: 1;
  readonly profile: SecureExecutionProfile;
  readonly ok: boolean;
  readonly value?: unknown;
  readonly error?: {
    readonly code: string;
    readonly message: string;
    readonly details?: Readonly<Record<string, unknown>>;
  };
}

const DOCUMENT_ORIGIN = "https://fourier-secure.invalid";
const MAX_DESCRIPTOR_BYTES = 4 * 1024 * 1024;
const MAX_PROJECT_WIRE_BYTES = 16 * 1024 * 1024;
const MAX_WORKER_SOURCE_BYTES = 16 * 1024 * 1024;
const MAX_CPU_SECONDS = 20;
const MAX_PROCESS_TREE_RSS_KIB = 1_500 * 1024;
const execFileAsync = promisify(execFile);

const secureRunner = new BoundedWorkerRunner({
  concurrency: 2,
  maxQueued: 16,
  timeoutMs: 30_000,
});

function protocolError(message: string, details?: Record<string, unknown>): CoreError {
  return new CoreError("SECURE_EXECUTION_PROTOCOL_INVALID", message, details);
}

function jsonText(value: unknown, label: string, maxBytes: number): string {
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch (error) {
    throw protocolError(`${label} 不是 JSON-safe 数据`, {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (serialized === undefined) throw protocolError(`${label} 不能序列化`);
  if (Buffer.byteLength(serialized) > maxBytes) {
    throw new CoreError("SECURE_EXECUTION_LIMIT", `${label} 超过大小限制`, {
      maxBytes,
      actualBytes: Buffer.byteLength(serialized),
    });
  }
  return serialized;
}

function parseEnvelope(
  serialized: string,
  expectedProfile: SecureExecutionProfile,
): SecureWireEnvelope {
  const maxBytes = expectedProfile === "project-materialize"
    ? MAX_PROJECT_WIRE_BYTES
    : MAX_DESCRIPTOR_BYTES;
  if (Buffer.byteLength(serialized) > maxBytes) {
    throw new CoreError("SECURE_EXECUTION_LIMIT", `安全执行响应超过 ${maxBytes} bytes`);
  }
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    throw protocolError("安全执行响应不是有效 JSON");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw protocolError("安全执行响应必须是对象");
  }
  const record = value as Record<string, unknown>;
  if (
    record.revision !== 1 ||
    record.profile !== expectedProfile ||
    typeof record.ok !== "boolean"
  ) {
    throw protocolError("安全执行协议 revision/profile 无效");
  }
  if (record.ok) {
    if (!("value" in record) || "error" in record) {
      throw protocolError("安全执行成功响应结构无效");
    }
  } else {
    const error = record.error;
    if (
      typeof error !== "object" || error === null || Array.isArray(error) ||
      typeof (error as Record<string, unknown>).code !== "string" ||
      typeof (error as Record<string, unknown>).message !== "string"
    ) {
      throw protocolError("安全执行失败响应结构无效");
    }
  }
  return value as SecureWireEnvelope;
}

function cleanBrowserEnvironment(temporaryHome: string): Record<string, string> {
  return {
    HOME: temporaryHome,
    TMPDIR: join(temporaryHome, "tmp"),
    TMP: join(temporaryHome, "tmp"),
    TEMP: join(temporaryHome, "tmp"),
    LANG: "C.UTF-8",
    LC_ALL: "C.UTF-8",
  };
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

async function launchSandboxedBrowser(temporaryHome: string): Promise<Browser> {
  const browserExecutable = chromium.executablePath();
  const base = {
    headless: true as const,
    executablePath: browserExecutable,
    env: cleanBrowserEnvironment(temporaryHome),
    args: [
      "--disable-background-networking",
      "--disable-breakpad",
      "--disable-component-update",
      "--disable-default-apps",
      "--disable-domain-reliability",
      "--disable-features=MediaRouter,OptimizationHints,AutofillServerCommunication",
      "--disable-sync",
      "--metrics-recording-only",
      "--no-first-run",
    ],
  };
  try {
    return await chromium.launch({ ...base, chromiumSandbox: true });
  } catch (nativeError) {
    if (process.platform !== "linux") throw nativeError;
    const bwrapCandidates = ["/usr/bin/bwrap", "/bin/bwrap", "/usr/local/bin/bwrap"];
    const bwrap = await Promise.all(bwrapCandidates.map(async (candidate) =>
      await access(candidate).then(() => candidate, () => undefined)
    )).then((candidates) => candidates.find((candidate) => candidate !== undefined));
    if (bwrap === undefined) throw nativeError;
    const browserRoot = dirname(await realpath(browserExecutable));
    const systemRoots = await Promise.all([
      "/usr",
      "/bin",
      "/lib",
      "/lib64",
      "/etc/fonts",
      "/etc/ssl/certs",
      "/etc/ld.so.cache",
      "/etc/localtime",
      "/etc/nsswitch.conf",
      "/etc/passwd",
      "/etc/group",
      "/var/cache/fontconfig",
      "/sys/devices/system/cpu",
    ].map(async (path) => await access(path).then(() => path, () => undefined)));
    const bubblewrapArguments = [
      "--die-with-parent",
      "--new-session",
      "--unshare-all",
      "--unshare-net",
      ...systemRoots.flatMap((path) => path === undefined ? [] : ["--ro-bind", path, path]),
      "--ro-bind", browserRoot, "/fourier-browser",
      "--dev", "/dev",
      "--proc", "/proc",
      "--tmpfs", "/tmp",
      "--bind", temporaryHome, temporaryHome,
      "--chdir", temporaryHome,
      "--",
      `/fourier-browser/${basename(browserExecutable)}`,
    ];
    const wrapper = join(temporaryHome, "chromium-bwrap");
    await writeFile(wrapper, `#!/bin/sh\nexec ${[bwrap, ...bubblewrapArguments].map(shellQuote).join(" ")} "$@"\n`, { mode: 0o700 });
    await chmod(wrapper, 0o700);
    return chromium.launch({
      ...base,
      executablePath: wrapper,
      chromiumSandbox: false,
    });
  }
}

interface SecureBrowserSlot {
  busy: boolean;
  closing: boolean;
  temporaryHome: string | undefined;
  browser: Browser | undefined;
  idleTimer: ReturnType<typeof setTimeout> | undefined;
}

interface SecureBrowserLease {
  readonly browser: Browser;
  release(discard?: boolean): void;
}

/** Two isolated sandbox browser slots mirror the evaluator concurrency limit. */
class SecureBrowserPool {
  readonly #slots: SecureBrowserSlot[] = [];
  readonly #waiters: Array<() => void> = [];

  async acquire(): Promise<SecureBrowserLease> {
    for (;;) {
      let slot = this.#slots.find((candidate) => !candidate.busy && !candidate.closing);
      if (slot === undefined && this.#slots.length < 2) {
        slot = {
          busy: false,
          closing: false,
          temporaryHome: undefined,
          browser: undefined,
          idleTimer: undefined,
        };
        this.#slots.push(slot);
      }
      if (slot === undefined) {
        await new Promise<void>((resolve) => this.#waiters.push(resolve));
        continue;
      }
      slot.busy = true;
      if (slot.idleTimer !== undefined) {
        clearTimeout(slot.idleTimer);
        slot.idleTimer = undefined;
      }
      try {
        const browser = await this.#browser(slot);
        let released = false;
        return Object.freeze({
          browser,
          release: (discard = false) => {
            if (released) return;
            released = true;
            slot!.busy = false;
            if (discard || !browser.isConnected()) {
              void this.#close(slot!);
            } else {
              slot!.idleTimer = setTimeout(() => void this.#close(slot!), 1_000);
            }
            this.#waiters.shift()?.();
          },
        });
      } catch (error) {
        slot.busy = false;
        await this.#close(slot);
        throw error;
      }
    }
  }

  async #browser(slot: SecureBrowserSlot): Promise<Browser> {
    if (slot.browser?.isConnected()) return slot.browser;
    const temporaryHome = await mkdtemp(join(tmpdir(), "fourier-secure-execution-"));
    await mkdir(join(temporaryHome, "tmp"), { recursive: true, mode: 0o700 });
    slot.temporaryHome = temporaryHome;
    try {
      slot.browser = await launchSandboxedBrowser(temporaryHome);
      return slot.browser;
    } catch (error) {
      await rm(temporaryHome, { recursive: true, force: true });
      slot.temporaryHome = undefined;
      throw error;
    }
  }

  async #close(slot: SecureBrowserSlot): Promise<void> {
    if (slot.busy || slot.closing) return;
    slot.closing = true;
    if (slot.idleTimer !== undefined) clearTimeout(slot.idleTimer);
    slot.idleTimer = undefined;
    const browser = slot.browser;
    const temporaryHome = slot.temporaryHome;
    slot.browser = undefined;
    slot.temporaryHome = undefined;
    await browser?.close().catch(() => undefined);
    if (temporaryHome !== undefined) await rm(temporaryHome, { recursive: true, force: true });
    const index = this.#slots.indexOf(slot);
    if (index >= 0) this.#slots.splice(index, 1);
    slot.closing = false;
    this.#waiters.shift()?.();
  }
}

const secureBrowserPool = new SecureBrowserPool();

async function sampleChromiumProcesses(cdp: CDPSession, page: Page): Promise<{
  readonly heapBytes: number;
  readonly cpuSeconds: number;
  readonly rssKiB: number;
}> {
  const processes = await chromiumProcessInfo(cdp);
  const processIds = processes
    .map((entry) => entry.id)
    .filter((id): id is number => typeof id === "number" && Number.isSafeInteger(id) && id > 0);
  const heapBytes = await page.evaluate(() => {
    const memory = (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory;
    return memory?.usedJSHeapSize ?? 0;
  });
  return {
    heapBytes,
    cpuSeconds: processes.reduce((total, process) => total + (process.cpuTime ?? 0), 0),
    rssKiB: await processTreeRssKiB(processIds),
  };
}

async function chromiumProcessInfo(cdp: CDPSession): Promise<readonly { id?: number; cpuTime?: number }[]> {
  const response = await cdp.send("SystemInfo.getProcessInfo") as {
    processInfo: readonly { id?: number; cpuTime?: number }[];
  };
  return response.processInfo;
}

async function processTreeRssKiB(processIds: readonly number[]): Promise<number> {
  if (processIds.length === 0) return 0;
  if (process.platform === "linux") {
    const values = await Promise.all(processIds.map(async (pid) => {
      const status = await readFile(`/proc/${pid}/status`, "utf8").catch(() => "");
      const match = /^VmRSS:\s+(\d+)\s+kB$/m.exec(status);
      return match?.[1] === undefined ? 0 : Number(match[1]);
    }));
    return values.reduce((total, value) => total + value, 0);
  }
  if (process.platform === "darwin") {
    const { stdout } = await execFileAsync(
      "/bin/ps",
      ["-o", "rss=", "-p", processIds.join(",")],
      { env: { LANG: "C", LC_ALL: "C" }, maxBuffer: 64 * 1024 },
    );
    return stdout.split(/\s+/).reduce((total, value) => total + (Number(value) || 0), 0);
  }
  if (process.platform === "win32") {
    const script = `(Get-Process -Id ${processIds.join(",")} -ErrorAction SilentlyContinue | Measure-Object WorkingSet64 -Sum).Sum`;
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script],
      { env: { SystemRoot: process.env.SystemRoot ?? "C:\\Windows" }, maxBuffer: 64 * 1024 },
    );
    return Math.ceil((Number(stdout.trim()) || 0) / 1024);
  }
  return 0;
}

function workerPrelude(): string {
  return `
"use strict";
for (const name of ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "RTCPeerConnection", "webkitRTCPeerConnection", "Worker", "SharedWorker", "WebAssembly"]) {
  try { Object.defineProperty(globalThis, name, { value: undefined, configurable: false, writable: false }); } catch {}
}
try { Object.defineProperty(globalThis, "importScripts", { value: () => { throw new Error("network disabled"); }, configurable: false, writable: false }); } catch {}
try { Object.defineProperty(globalThis, "open", { value: undefined, configurable: false, writable: false }); } catch {}
`;
}

async function stopWorker(page: Page | undefined): Promise<void> {
  if (page === undefined || page.isClosed()) return;
  await page.evaluate(() => {
    const state = (globalThis as typeof globalThis & {
      __fourierSecure?: { worker?: Worker };
    }).__fourierSecure;
    state?.worker?.terminate();
  }).catch(() => undefined);
}

/** Executes fixed evaluator profiles; callers can provide data and a browser bundle, never launch policy. */
export class SecureExecutionHost {
  execute(request: SecureExecutionRequest): Promise<unknown> {
    if (Buffer.byteLength(request.workerJavascript) > MAX_WORKER_SOURCE_BYTES) {
      return Promise.reject(new CoreError(
        "SECURE_EXECUTION_LIMIT",
        "安全执行 Worker bundle 超过 16 MiB",
      ));
    }
    const inputJson = jsonText(
      request.input,
      "安全执行输入",
      request.profile === "project-materialize" ? MAX_PROJECT_WIRE_BYTES : MAX_DESCRIPTOR_BYTES,
    );
    return secureRunner.run(
      (signal) => this.#executeAdmitted(request.profile, request.workerJavascript, inputJson, signal),
      request.signal,
    );
  }

  async #executeAdmitted(
    profile: SecureExecutionProfile,
    workerJavascript: string,
    inputJson: string,
    signal: AbortSignal,
  ): Promise<unknown> {
    let lease: SecureBrowserLease | undefined;
    let browser: Browser | undefined;
    let context: BrowserContext | undefined;
    let page: Page | undefined;
    let cdp: CDPSession | undefined;
    let monitor: ReturnType<typeof setInterval> | undefined;
    let monitorSampling = false;
    let limitFailure: CoreError | undefined;
    let cpuBaselineSeconds = 0;
    const abort = () => void stopWorker(page);
    signal.addEventListener("abort", abort, { once: true });
    try {
      try {
        lease = await secureBrowserPool.acquire();
        browser = lease.browser;
      } catch (error) {
        throw new CoreError(
          "SECURE_EXECUTION_UNAVAILABLE",
          "无法启动启用原生 sandbox 的独立 Chromium evaluator",
          { platform: process.platform, cause: error instanceof Error ? error.message : String(error) },
        );
      }
      context = await browser.newContext({
        acceptDownloads: false,
        serviceWorkers: "block",
      });
      const documentUrl = `${DOCUMENT_ORIGIN}/${profile}`;
      await context.route("**/*", async (route) => {
        const request = route.request();
        if (request.isNavigationRequest() && request.url() === documentUrl) {
          await route.fulfill({
            status: 200,
            contentType: "text/html; charset=utf-8",
            headers: {
              "content-security-policy": "default-src 'none'; script-src 'unsafe-inline' blob:; worker-src blob:; connect-src 'none'; img-src 'none'; media-src 'none'; font-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'",
            },
            body: "<!doctype html><meta charset=utf-8><title>Fourier Secure Execution</title>",
          });
        } else {
          await route.abort("blockedbyclient");
        }
      });
      page = await context.newPage();
      context.on("page", (candidate) => {
        if (candidate !== page) void candidate.close();
      });
      cdp = await browser.newBrowserCDPSession();
      await page.goto(documentUrl, { waitUntil: "domcontentloaded" });
      page.on("download", (download) => void download.cancel());
      page.on("popup", (popup) => void popup.close());
      cpuBaselineSeconds = (await chromiumProcessInfo(cdp))
        .reduce((total, process) => total + (process.cpuTime ?? 0), 0);

      const workerSource = `${workerPrelude()}\n${workerJavascript}`;
      await page.evaluate(({ source, input }) => {
        const workerUrl = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
        const worker = new Worker(workerUrl, { name: "fourier-secure-evaluator" });
        URL.revokeObjectURL(workerUrl);
        const state: { worker: Worker; done: boolean; response?: string; error?: string } = {
          worker,
          done: false,
        };
        (globalThis as typeof globalThis & { __fourierSecure?: typeof state }).__fourierSecure = state;
        worker.onmessage = (event) => {
          if (typeof event.data !== "string") {
            state.error = "Worker response must be a JSON string";
          } else {
            state.response = event.data;
          }
          state.done = true;
          worker.terminate();
        };
        worker.onerror = (event) => {
          state.error = event.message || "Worker execution failed";
          state.done = true;
          worker.terminate();
        };
        worker.postMessage(input);
      }, { source: workerSource, input: inputJson });

      monitor = setInterval(() => {
        if (cdp === undefined || page === undefined || monitorSampling) return;
        monitorSampling = true;
        void sampleChromiumProcesses(cdp, page).then((sample) => {
          const jobCpuSeconds = Math.max(0, sample.cpuSeconds - cpuBaselineSeconds);
          if (jobCpuSeconds > MAX_CPU_SECONDS || sample.rssKiB > MAX_PROCESS_TREE_RSS_KIB) {
            limitFailure = new CoreError("SECURE_EXECUTION_LIMIT", "安全执行超过 CPU 或内存限制", {
              cpuSeconds: jobCpuSeconds,
              observedHeapBytes: sample.heapBytes,
              processTreeRssKiB: sample.rssKiB,
            });
            void stopWorker(page);
          }
        }).catch(() => undefined).finally(() => {
          monitorSampling = false;
        });
      }, 250);

      for (;;) {
        if (signal.aborted) throw signal.reason;
        if (limitFailure !== undefined) throw limitFailure;
        const result = await page.evaluate(() => {
          const state = (globalThis as typeof globalThis & {
            __fourierSecure?: { done: boolean; response?: string; error?: string };
          }).__fourierSecure;
          return state === undefined ? undefined : {
            done: state.done,
            response: state.response,
            error: state.error,
          };
        });
        if (result?.done) {
          if (result.error !== undefined) {
            throw new CoreError("ARTIFACT_EXECUTION_FAILED", result.error);
          }
          if (result.response === undefined) throw protocolError("Worker 未返回响应");
          const envelope = parseEnvelope(result.response, profile);
          if (!envelope.ok) {
            throw new CoreError(
              envelope.error!.code || "ARTIFACT_EXECUTION_FAILED",
              envelope.error!.message,
              envelope.error!.details === undefined ? undefined : { ...envelope.error!.details },
            );
          }
          return envelope.value;
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    } finally {
      if (monitor !== undefined) clearInterval(monitor);
      signal.removeEventListener("abort", abort);
      await stopWorker(page);
      await context?.close().catch(() => undefined);
      lease?.release(browser?.isConnected() !== true);
    }
  }
}
