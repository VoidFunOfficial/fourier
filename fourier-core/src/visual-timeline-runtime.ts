import { createHash } from "node:crypto";
import { availableParallelism } from "node:os";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type CDPSession,
  type Page,
} from "playwright";
import {
  compileVisualArtifact,
  type CompiledVisualArtifact,
  type CompileVisualArtifactOptions,
} from "./artifact-compiler.ts";
import { isSupportedSdkAbiVersion } from "./artifact-protocol.ts";
import {
  BROWSER_COMMIT_MODE,
  browserOperationTimeout,
  captureCommittedViewport,
  chromiumLaunchOptions,
  configureTransparentViewport,
  initializeHeadlessFrameControl,
  synchronizeHeadlessFrameControl,
  type HeadlessFrameControl,
  type LinuxHeadlessProcessMode,
} from "./browser-platform.ts";
import { CoreError, fail } from "./errors.ts";
import {
  FOURIER_ASSET_ORIGIN,
  FOURIER_IMAGE_ASSET_ROUTE,
} from "./image-assets.ts";
import {
  rationalTime,
  rationalTimeKey,
  SampleClock,
  type RationalTime,
  type RationalTimeInput,
} from "./time.ts";
import { FOURIER_RENDERING_STATUS_URL } from "./rendering-status-page.ts";
import type { ResolveAuthorImport } from "./integration-types.ts";

export interface TimelineSampleRequest {
  time: RationalTimeInput;
  signal?: AbortSignal;
}

export interface TimelineSampleResult {
  readonly png: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly time: RationalTime;
  readonly snapshotId: string;
  readonly sha256: string;
  readonly videoSurfaces: readonly TimelineVideoSurface[];
}

export interface TimelineVideoSurface {
  readonly videoId: string;
  readonly corners: readonly [
    Readonly<{ x: number; y: number }>,
    Readonly<{ x: number; y: number }>,
    Readonly<{ x: number; y: number }>,
    Readonly<{ x: number; y: number }>,
  ];
  readonly cornerRadiusRatio: number;
}

interface TimelineStateSnapshot {
  readonly animations: readonly unknown[];
  readonly videoSurfaces: readonly TimelineVideoSurface[];
}

export interface TimelineInstance {
  readonly snapshotId: string;
  /** True when every sample time produces the same pixels for this instance. */
  readonly isStatic: boolean;
  sample(request: TimelineSampleRequest): Promise<TimelineSampleResult>;
  close(): Promise<void>;
}

interface TimelineAdapter {
  open(artifact: CompiledVisualArtifact): Promise<TimelineInstance>;
  close(): Promise<void>;
}

function cancelled(signal?: AbortSignal): void {
  if (signal?.aborted) fail("RENDER_CANCELLED", "timeline sample 已取消");
}

function withTimeout<T>(
  operation: string,
  promise: Promise<T>,
  milliseconds = browserOperationTimeout(),
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new CoreError(
        "DOM_RUNTIME_TIMEOUT",
        `${operation} 超过 ${milliseconds}ms`,
        { operation, timeoutMs: milliseconds },
      )),
      milliseconds,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

class AtomicFrameCache {
  readonly #completed = new Map<string, TimelineSampleResult>();
  readonly #pending = new Map<string, Promise<TimelineSampleResult>>();

  async get(
    key: string,
    producer: () => Promise<TimelineSampleResult>,
  ): Promise<TimelineSampleResult> {
    const completed = this.#completed.get(key);
    if (completed !== undefined) return completed;
    const pending = this.#pending.get(key);
    if (pending !== undefined) return pending;
    const next = producer().then(
      (result) => {
        this.#completed.set(key, result);
        this.#pending.delete(key);
        return result;
      },
      (error) => {
        this.#pending.delete(key);
        throw error;
      },
    );
    this.#pending.set(key, next);
    return next;
  }

  clear(): void {
    this.#completed.clear();
    this.#pending.clear();
  }
}

interface PooledPage {
  page: Page;
  cdp: CDPSession;
  context: BrowserContext;
  width: number;
  height: number;
  headlessFrameControl?: HeadlessFrameControl;
  crashed: boolean;
  destroyed: boolean;
}

function recoverableBrowserFailure(error: unknown): boolean {
  if (error instanceof CoreError && error.code === "DOM_RUNTIME_TIMEOUT") return true;
  const message = error instanceof Error ? error.message : String(error);
  return /(?:Target|page|context|browser|session|connection).*(?:closed|crash|disconnect)|Protocol error/i
    .test(message);
}

function recycleLinuxBrowser(error: unknown): boolean {
  return process.platform === "linux" && recoverableBrowserFailure(error);
}

async function terminateTimedOutExecution(
  resource: PooledPage,
  error: unknown,
): Promise<void> {
  if (!(error instanceof CoreError) || error.code !== "DOM_RUNTIME_TIMEOUT") return;
  await withTimeout(
    "Chromium timed out JavaScript termination",
    resource.cdp.send("Runtime.terminateExecution"),
    2_000,
  ).catch(() => undefined);
}

class SharedBrowserHost {
  #browserPromise: Promise<Browser> | undefined;
  #closing: Promise<void> | undefined;
  #keepAliveContext: BrowserContext | undefined;
  #keepAlivePage: Page | undefined;
  #keepAlivePromise: Promise<void> | undefined;
  #keepAliveClaimed = false;
  #browserLaunchMode: LinuxHeadlessProcessMode | undefined;
  #preferredLinuxLaunchMode: LinuxHeadlessProcessMode = "single-process";
  #clients = 0;

  retain(): void {
    this.#clients += 1;
  }

  async #ensureKeepAlive(browser: Browser): Promise<void> {
    if (
      this.#keepAlivePage !== undefined &&
      !this.#keepAlivePage.isClosed() &&
      this.#keepAliveContext !== undefined &&
      !this.#keepAliveContext.isClosed()
    ) return;
    if (this.#keepAlivePromise !== undefined) return this.#keepAlivePromise;

    const creating = (async () => {
      const staleContext = this.#keepAliveContext;
      this.#keepAliveContext = undefined;
      this.#keepAlivePage = undefined;
      await withTimeout(
        "Chromium stale keepAlive context close",
        staleContext?.close() ?? Promise.resolve(),
        5_000,
      ).catch(() => undefined);

      const context = await withTimeout(
        "Chromium keepAlive context initialization",
        browser.newContext({
          viewport: { width: 320, height: 180 },
          deviceScaleFactor: 1,
          locale: "en-US",
          timezoneId: "UTC",
          colorScheme: "light",
          reducedMotion: "no-preference",
          serviceWorkers: "block",
        }),
      );
      try {
        const page = await withTimeout(
          "Chromium keepAlive page initialization",
          context.newPage(),
        );
        await withTimeout(
          "Chromium keepAlive document initialization",
          page.goto(
            "data:text/html,%3Ctitle%3EFourier%20DOM%20Runtime%3C%2Ftitle%3E%3Cbody%3EFourier%20DOM%20Runtime%3C%2Fbody%3E",
            { waitUntil: "load" },
          ),
        );
        this.#keepAliveContext = context;
        this.#keepAlivePage = page;
        page.once("close", () => {
          if (this.#keepAlivePage !== page) return;
          this.#keepAlivePage = undefined;
          if (
            !this.#keepAliveClaimed &&
            this.#clients > 0 &&
            this.#browserPromise !== undefined &&
            browser.isConnected()
          ) {
            void this.#ensureKeepAlive(browser).catch(() => undefined);
          }
        });
      } catch (error) {
        await withTimeout(
          "Chromium failed keepAlive context close",
          context.close(),
          5_000,
        ).catch(() => undefined);
        throw error;
      }
    })();
    this.#keepAlivePromise = creating;
    try {
      await creating;
    } finally {
      if (this.#keepAlivePromise === creating) this.#keepAlivePromise = undefined;
    }
  }

  claimHeadlessKeepAlive(): {
    readonly context: BrowserContext;
    readonly page: Page;
  } | undefined {
    if (
      BROWSER_COMMIT_MODE !== "headless-begin-frame" ||
      this.#keepAliveClaimed ||
      this.#keepAliveContext === undefined ||
      this.#keepAlivePage === undefined ||
      this.#keepAliveContext.isClosed() ||
      this.#keepAlivePage.isClosed()
    ) return undefined;
    this.#keepAliveClaimed = true;
    return {
      context: this.#keepAliveContext,
      page: this.#keepAlivePage,
    };
  }

  #forgetKeepAlive(): void {
    this.#keepAliveContext = undefined;
    this.#keepAlivePage = undefined;
    this.#keepAlivePromise = undefined;
    this.#keepAliveClaimed = false;
  }

  async browser(): Promise<Browser> {
    await this.#closing;
    while (true) {
      let current = this.#browserPromise;
      if (current === undefined) {
        // Playwright owns the browser process and must be allowed to run its
        // timeout cleanup. Racing launch with our generic timeout can orphan a
        // browser process after the wrapper rejects.
        current = chromium.launch({
          ...chromiumLaunchOptions(process.platform, this.#preferredLinuxLaunchMode),
          timeout: browserOperationTimeout(),
        });
        this.#browserPromise = current;
        this.#browserLaunchMode = this.#preferredLinuxLaunchMode;
      }
      const launchMode = this.#browserLaunchMode ?? this.#preferredLinuxLaunchMode;
      let browser: Browser | undefined;
      try {
        browser = await current;
        if (browser.isConnected()) {
          await this.#ensureKeepAlive(browser);
          return browser;
        }
        if (this.#browserPromise === current) {
          this.#browserPromise = undefined;
          this.#browserLaunchMode = undefined;
        }
        throw new Error("Chromium browser disconnected immediately after launch");
      } catch (error) {
        if (this.#browserPromise === current) {
          this.#browserPromise = undefined;
          this.#browserLaunchMode = undefined;
        }
        if (
          process.platform === "linux" &&
          launchMode === "single-process" &&
          recoverableBrowserFailure(error)
        ) {
          // Some chrome-headless-shell/container combinations launch with
          // --single-process but terminate as soon as the first target is
          // created. Keep the one-target/one-renderer invariant, but retry the
          // browser without --single-process and --no-zygote.
          this.#preferredLinuxLaunchMode = "single-renderer";
          this.#forgetKeepAlive();
          await withTimeout(
            "Chromium incompatible single-process browser close",
            browser?.close({ reason: "Retrying Fourier DOM runtime in single-renderer mode" }) ??
              Promise.resolve(),
            5_000,
          ).catch(() => undefined);
          continue;
        }
        const message = error instanceof Error ? error.message : String(error);
        throw new CoreError(
          message.includes("Executable doesn't exist")
            ? "CHROMIUM_NOT_INSTALLED"
            : "CHROMIUM_LAUNCH_FAILED",
          `无法启动 Playwright Chromium: ${message}`,
          {
            executablePath: chromium.executablePath(),
            linuxProcessMode: launchMode,
            installCommand: process.platform === "linux"
              ? "bunx playwright install --with-deps chromium"
              : "bunx playwright install chromium",
          },
        );
      }
    }
  }

  async release(): Promise<void> {
    this.#clients = Math.max(0, this.#clients - 1);
    if (this.#clients !== 0) return;

    const pending = this.#browserPromise;
    this.#browserPromise = undefined;
    this.#browserLaunchMode = undefined;
    if (pending === undefined) return;
    this.#forgetKeepAlive();

    const closing = (async () => {
      const browser = await pending.catch(() => undefined);
      await withTimeout(
        "Chromium shared browser close",
        browser?.close() ?? Promise.resolve(),
        5_000,
      ).catch(() => undefined);
    })();
    this.#closing = closing;
    await closing;
    if (this.#closing === closing) this.#closing = undefined;
  }

  async recycle(): Promise<void> {
    await this.#closing;
    const pending = this.#browserPromise;
    this.#browserPromise = undefined;
    this.#browserLaunchMode = undefined;
    if (pending === undefined) return;
    this.#forgetKeepAlive();

    const closing = (async () => {
      const browser = await pending.catch(() => undefined);
      await withTimeout(
        "Chromium unhealthy browser close",
        browser?.close({ reason: "Fourier DOM runtime recovery" }) ?? Promise.resolve(),
        5_000,
      ).catch(() => undefined);
    })();
    this.#closing = closing;
    await closing;
    if (this.#closing === closing) this.#closing = undefined;
  }
}

const sharedBrowserHost = new SharedBrowserHost();

class BrowserPagePool {
  readonly #maximumPages: number;
  #contextPromise: Promise<BrowserContext> | undefined;
  readonly #contexts = new Set<BrowserContext>();
  readonly #retiredContexts = new Set<BrowserContext>();
  readonly #contextResourceCounts = new Map<BrowserContext, number>();
  readonly #renderingStatusPages = new Map<BrowserContext, Page>();
  readonly #renderingStatusUpdates = new Map<BrowserContext, Promise<void>>();
  readonly #idlePages: PooledPage[] = [];
  #initialKeepAlivePage: Page | undefined;
  #activePages = 0;
  #waiters: Array<{ resolve: () => void; reject: (error: unknown) => void }> = [];
  #closed = false;

  constructor(maximumPages = defaultDomPageCount()) {
    this.#maximumPages = effectiveDomPageCount(maximumPages);
    sharedBrowserHost.retain();
  }

  async #contextInstance(): Promise<BrowserContext> {
    const current = this.#contextPromise;
    if (current !== undefined) {
      const context = await current;
      if (!context.isClosed()) return context;
      if (this.#contextPromise === current) this.#contextPromise = undefined;
      this.#contexts.delete(context);
      this.#contextResourceCounts.delete(context);
    }

    const pending = (async () => {
      const browser = await sharedBrowserHost.browser();
      const keepAlive = sharedBrowserHost.claimHeadlessKeepAlive();
      const context = keepAlive?.context ?? await withTimeout(
        "Chromium context initialization",
        browser.newContext({
          viewport: { width: 1, height: 1 },
          deviceScaleFactor: 1,
          locale: "en-US",
          timezoneId: "UTC",
          colorScheme: "light",
          reducedMotion: "no-preference",
          serviceWorkers: "block",
        }),
      );
      this.#initialKeepAlivePage = keepAlive?.page;
      try {
        await withTimeout(
          "Chromium network policy",
          context.route("**/*", (route) => route.abort("blockedbyclient")),
        );
        this.#contexts.add(context);
        this.#contextResourceCounts.set(context, 0);
        return context;
      } catch (error) {
        await withTimeout("Chromium failed context close", context.close(), 5_000)
          .catch(() => undefined);
        throw error;
      }
    })();
    this.#contextPromise = pending;
    try {
      return await pending;
    } catch (error) {
      if (this.#contextPromise === pending) this.#contextPromise = undefined;
      throw error;
    }
  }

  async #placeRenderingStatusPageLast(context: BrowserContext): Promise<void> {
    if (BROWSER_COMMIT_MODE !== "headed-page-capture") return;
    const previousUpdate = this.#renderingStatusUpdates.get(context) ?? Promise.resolve();
    const update = previousUpdate.catch(() => undefined).then(async () => {
      const previousPage = this.#renderingStatusPages.get(context);
      this.#renderingStatusPages.delete(context);
      await withTimeout(
        "Chromium previous rendering status page close",
        previousPage?.close() ?? Promise.resolve(),
        5_000,
      ).catch(() => undefined);
      if (this.#closed || context.isClosed()) return;

      const statusPage = await withTimeout(
        "Chromium rendering status page initialization",
        context.newPage(),
      );
      try {
        await withTimeout(
          "Chromium rendering status page viewport",
          statusPage.setViewportSize({ width: 460, height: 240 }),
        );
        await withTimeout(
          "Chromium rendering status document initialization",
          statusPage.goto(FOURIER_RENDERING_STATUS_URL, { waitUntil: "load" }),
        );
        this.#renderingStatusPages.set(context, statusPage);
        statusPage.once("close", () => {
          if (this.#renderingStatusPages.get(context) === statusPage) {
            this.#renderingStatusPages.delete(context);
          }
        });
      } catch (error) {
        await withTimeout(
          "Chromium failed rendering status page close",
          statusPage.close(),
          5_000,
        ).catch(() => undefined);
        throw error;
      }
    });
    this.#renderingStatusUpdates.set(context, update);
    try {
      await update;
    } finally {
      if (this.#renderingStatusUpdates.get(context) === update) {
        this.#renderingStatusUpdates.delete(context);
      }
    }
  }

  async #createResource(width: number, height: number): Promise<PooledPage> {
    let page: Page | undefined;
    let context: BrowserContext | undefined;
    let resource: PooledPage | undefined;
    try {
      context = await this.#contextInstance();
      page = this.#initialKeepAlivePage;
      this.#initialKeepAlivePage = undefined;
      page ??= await withTimeout("Chromium page initialization", context.newPage());
      await withTimeout("Chromium page viewport", page.setViewportSize({ width, height }));
      const cdp = await withTimeout("Chromium CDP initialization", context.newCDPSession(page));
      resource = {
        page,
        cdp,
        context,
        width,
        height,
        crashed: false,
        destroyed: false,
      };
      const createdResource = resource;
      page.once("crash", () => {
        createdResource.crashed = true;
      });
      this.#contextResourceCounts.set(
        context,
        (this.#contextResourceCounts.get(context) ?? 0) + 1,
      );
      await withTimeout(
        "Chromium transparent background",
        configureTransparentViewport(cdp),
      );
      if (BROWSER_COMMIT_MODE === "headless-begin-frame") {
        resource.headlessFrameControl = await withTimeout(
          "Linux BeginFrame control initialization",
          initializeHeadlessFrameControl(cdp),
        );
      } else {
        await withTimeout(
          "Chromium virtual time initialization",
          cdp.send("Emulation.setVirtualTimePolicy", {
            policy: "pause",
            initialVirtualTime: 0,
          }),
        );
      }
      await this.#placeRenderingStatusPageLast(context);
      return resource;
    } catch (error) {
      if (context !== undefined && recoverableBrowserFailure(error)) {
        await this.#retireContext(context);
      }
      if (resource !== undefined) {
        await this.#destroyResource(resource);
      } else if (page !== undefined) {
        await withTimeout("Chromium failed page close", page.close(), 5_000)
          .catch(() => undefined);
      }
      throw error;
    }
  }

  async #takeIdleResource(): Promise<PooledPage | undefined> {
    while (this.#idlePages.length > 0) {
      const resource = this.#idlePages.pop()!;
      if (
        resource.destroyed ||
        resource.crashed ||
        resource.page.isClosed() ||
        resource.context.isClosed() ||
        this.#retiredContexts.has(resource.context)
      ) {
        await this.#destroyResource(resource);
        continue;
      }
      return resource;
    }
    return undefined;
  }

  async acquire(width: number, height: number): Promise<PooledPage> {
    if (this.#closed) fail("TIMELINE_INSTANCE_CLOSED", "DOM page pool 已关闭");
    while (this.#activePages >= this.#maximumPages) {
      await new Promise<void>((resolve, reject) => this.#waiters.push({ resolve, reject }));
      if (this.#closed) fail("TIMELINE_INSTANCE_CLOSED", "DOM page pool 已关闭");
    }
    this.#activePages += 1;
    let resource: PooledPage | undefined;
    try {
      resource = await this.#takeIdleResource() ?? await this.#createResource(width, height);
      if (resource.width !== width || resource.height !== height) {
        await withTimeout(
          "Chromium page viewport",
          resource.page.setViewportSize({ width, height }),
        );
        resource.width = width;
        resource.height = height;
      }
      return resource;
    } catch (error) {
      if (resource !== undefined) {
        if (recoverableBrowserFailure(error)) await this.#retireContext(resource.context);
        await this.#destroyResource(resource);
      }
      this.#releaseSlot();
      throw error;
    }
  }

  async release(resource: PooledPage, discardContext = false): Promise<void> {
    try {
      const reusable =
        !discardContext &&
        !this.#closed &&
        !resource.destroyed &&
        !resource.crashed &&
        !resource.page.isClosed() &&
        !resource.context.isClosed() &&
        !this.#retiredContexts.has(resource.context);
      if (reusable) {
        this.#idlePages.push(resource);
      } else {
        if (discardContext) await this.#retireContext(resource.context);
        await this.#destroyResource(resource);
      }
    } finally {
      this.#releaseSlot();
    }
  }

  async #retireContext(context: BrowserContext): Promise<void> {
    if (this.#retiredContexts.has(context)) return;
    this.#retiredContexts.add(context);
    const current = await this.#contextPromise?.catch(() => undefined);
    if (current === context) this.#contextPromise = undefined;
    const idle = this.#idlePages.filter((resource) => resource.context === context);
    for (const resource of idle) {
      const index = this.#idlePages.indexOf(resource);
      if (index !== -1) this.#idlePages.splice(index, 1);
      await this.#destroyResource(resource);
    }
    await this.#closeRetiredContextIfUnused(context);
  }

  async #destroyResource(resource: PooledPage): Promise<void> {
    if (resource.destroyed) return;
    resource.destroyed = true;
    await withTimeout("Chromium CDP detach", resource.cdp.detach(), 2_000)
      .catch(() => undefined);
    await withTimeout("Chromium page close", resource.page.close(), 5_000)
      .catch(() => undefined);
    const remaining = Math.max(
      0,
      (this.#contextResourceCounts.get(resource.context) ?? 1) - 1,
    );
    this.#contextResourceCounts.set(resource.context, remaining);
    await this.#closeRetiredContextIfUnused(resource.context);
  }

  async #closeRetiredContextIfUnused(context: BrowserContext): Promise<void> {
    if (
      !this.#retiredContexts.has(context) ||
      (this.#contextResourceCounts.get(context) ?? 0) !== 0
    ) return;
    this.#contexts.delete(context);
    this.#retiredContexts.delete(context);
    this.#contextResourceCounts.delete(context);
    this.#renderingStatusPages.delete(context);
    this.#renderingStatusUpdates.delete(context);
    await withTimeout("Chromium retired context close", context.close(), 5_000)
      .catch(() => undefined);
  }

  #releaseSlot(): void {
    this.#activePages = Math.max(0, this.#activePages - 1);
    this.#waiters.shift()?.resolve();
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    const closedError = new CoreError("TIMELINE_INSTANCE_CLOSED", "DOM page pool 已关闭");
    for (const waiter of this.#waiters.splice(0)) waiter.reject(closedError);
    const pending = this.#contextPromise;
    this.#contextPromise = undefined;
    const context = await pending?.catch(() => undefined);
    if (context !== undefined) this.#contexts.add(context);
    for (const resource of this.#idlePages.splice(0)) {
      await this.#destroyResource(resource);
    }
    await Promise.allSettled([...this.#contexts].map((candidate) => withTimeout(
      "Chromium page context close",
      candidate.close(),
      5_000,
    )));
    this.#contexts.clear();
    this.#retiredContexts.clear();
    this.#contextResourceCounts.clear();
    this.#renderingStatusPages.clear();
    this.#renderingStatusUpdates.clear();
    await sharedBrowserHost.release();
  }
}

export function defaultDomPageCount(
  platform: NodeJS.Platform = process.platform,
  parallelism = availableParallelism(),
): number {
  if (platform === "linux") return 1;
  const configured = Number(Bun.env.FOURIER_DOM_PAGES ?? "");
  if (Number.isSafeInteger(configured) && configured > 0) return configured;
  return Math.max(1, Math.min(platform === "darwin" ? 3 : 4, parallelism));
}

export function effectiveDomPageCount(
  requested?: number,
  platform: NodeJS.Platform = process.platform,
): number {
  if (platform === "linux") return 1;
  return requested ?? defaultDomPageCount(platform);
}

interface BrowserCallResult<T> {
  ok: boolean;
  value?: T;
  error?: { code?: string; message: string; details?: Record<string, unknown> };
}

async function browserCall<T>(
  page: Page,
  method: "initialize" | "setTime" | "setSubject" | "snapshot",
  argument?: unknown,
): Promise<T> {
  const result = await withTimeout(`DOM ${method}`, page.evaluate(async (input) => {
    try {
      const runtime = (globalThis as any).__fourierDomTimeline;
      if (runtime === undefined || typeof runtime[input.method] !== "function") {
        throw Object.assign(new Error(`DOM runtime method 不存在: ${input.method}`), {
          code: "DOM_RUNTIME_BOOTSTRAP_MISSING",
        });
      }
      const value = await runtime[input.method](input.argument);
      return { ok: true, value };
    } catch (error) {
      const source = error as { code?: string; message?: string; details?: Record<string, unknown> };
      return {
        ok: false,
        error: {
          code: source?.code,
          message: source?.message ?? String(error),
          details: source?.details,
        },
      };
    }
  }, { method, argument }) as Promise<BrowserCallResult<T>>);
  if (!result.ok) {
    throw new CoreError(
      result.error?.code ?? "DOM_RUNTIME_FAILED",
      result.error?.message ?? `DOM ${method} failed`,
      result.error?.details,
    );
  }
  return result.value as T;
}

const transparentSubject = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1' height='1'/%3E";
const FOURIER_DOM_DOCUMENT_URL = `${FOURIER_ASSET_ORIGIN}/__fourier_dom_runtime__/index.html`;
const blankDomDocument = "<!doctype html><html><head></head><body><div id=\"fourier-root\"></div></body></html>";

export class DomTimelineAdapter implements TimelineAdapter {
  readonly #pool: BrowserPagePool;

  constructor(maximumPages?: number) {
    this.#pool = new BrowserPagePool(maximumPages);
  }

  async open(artifact: CompiledVisualArtifact): Promise<TimelineInstance> {
    if (
      !isSupportedSdkAbiVersion(artifact.sdkAbiVersion) ||
      !["dom-timeline", "dom-timeline-ffmpeg-video"].includes(artifact.renderer) ||
      artifact.bundleSnapshot === undefined
    ) {
      fail("ARTIFACT_RUNTIME_MISMATCH", "DomTimelineAdapter 只接受已编译的受支持 SDK ABI artifact");
    }
    const bundleSnapshot = artifact.bundleSnapshot;
    let state: "initializing" | "ready" | "sampling" | "failed" | "closed" = "initializing";
    let staticArtifact = false;
    let hasMedia = false;
    let headlessFrameControl: HeadlessFrameControl | undefined;
    let serial = Promise.resolve();
    const cache = new AtomicFrameCache();

    const initializeResource = async (resource: PooledPage) => {
      // A reused page has virtual time paused. Temporarily advance it while a
      // real navigation creates a fresh execution context; setContent() on the
      // old paused document can wait forever for its second load event.
      await withTimeout(
        "Chromium document virtual time resume",
        resource.cdp.send("Emulation.setVirtualTimePolicy", { policy: "advance" }),
      );
      await resource.page.unroute(FOURIER_DOM_DOCUMENT_URL);
      await resource.page.route(FOURIER_DOM_DOCUMENT_URL, async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "text/html; charset=utf-8",
          body: blankDomDocument,
        });
      });
      await withTimeout(
        "Chromium document initialization",
        resource.page.goto(FOURIER_DOM_DOCUMENT_URL, { waitUntil: "load" }),
      );
      await resource.page.unroute(FOURIER_IMAGE_ASSET_ROUTE);
      await resource.page.route(FOURIER_IMAGE_ASSET_ROUTE, async (route) => {
        const asset = bundleSnapshot.imageAssets?.find(
          (candidate) => candidate.url === route.request().url(),
        );
        if (asset === undefined) {
          await route.abort("failed");
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: asset.mimeType,
          body: Buffer.from(asset.base64, "base64"),
        });
      });
      await withTimeout("DOM stylesheet initialization", resource.page.addStyleTag({ content: `
        html,body,#fourier-root{width:${artifact.composition.width}px;height:${artifact.composition.height}px;margin:0;padding:0;background:transparent;overflow:hidden}
        *{box-sizing:border-box}
        ${bundleSnapshot.css}
      ` }));
      for (const font of artifact.fonts) {
        if (font.dataUrl !== undefined) {
          await withTimeout(
            `DOM font stylesheet ${font.family}`,
            resource.page.addStyleTag({ content: `@font-face{font-family:${JSON.stringify(font.family)};src:url(${JSON.stringify(font.dataUrl)})}` }),
          );
        }
      }
      await withTimeout(
        "DOM bootstrap script initialization",
        resource.page.addScriptTag({ content: bundleSnapshot.javascript }),
      );
      const durationMilliseconds =
        (artifact.kind === "motion" && artifact.motion !== undefined
          ? artifact.motion.durationInFrames
          : artifact.composition.durationInFrames) /
        artifact.composition.fps * 1000;
      const descriptor = await browserCall<{
        static: boolean;
        animationCount: number;
        mediaCount: number;
      }>(resource.page, "initialize", {
        width: artifact.composition.width,
        height: artifact.composition.height,
        fps: artifact.composition.fps,
        durationInFrames:
          artifact.kind === "motion" && artifact.motion !== undefined
            ? artifact.motion.durationInFrames
            : artifact.composition.durationInFrames,
        seed: artifact.seed,
        durationMilliseconds,
        props: artifact.props,
        ...(artifact.textSubject === undefined
          ? {}
          : { textSubject: artifact.textSubject }),
        ...(artifact.dynamicSubjectProvider === undefined
          ? {}
          : { subjectDataUrl: transparentSubject }),
        ...(artifact.renderer === "dom-timeline-ffmpeg-video"
          ? { videoId: "subject" }
          : {}),
      });
      const paused = await withTimeout(
        "Chromium document virtual time pause",
        resource.cdp.send("Emulation.setVirtualTimePolicy", { policy: "pause" }),
      ) as { virtualTimeTicksBase?: number };
      if (
        resource.headlessFrameControl !== undefined &&
        Number.isFinite(paused.virtualTimeTicksBase)
      ) {
        synchronizeHeadlessFrameControl(
          resource.headlessFrameControl,
          paused.virtualTimeTicksBase as number,
        );
      }
      return { descriptor, frameControl: resource.headlessFrameControl };
    };

    let resource: PooledPage | undefined;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let candidate: PooledPage | undefined;
      try {
        candidate = await this.#pool.acquire(
          artifact.composition.width,
          artifact.composition.height,
        );
        const initialized = await initializeResource(candidate);
        resource = candidate;
        staticArtifact = initialized.descriptor.static;
        hasMedia = initialized.descriptor.mediaCount > 0;
        headlessFrameControl = initialized.frameControl;
        break;
      } catch (error) {
        const recoverable = recoverableBrowserFailure(error);
        if (candidate !== undefined) {
          await terminateTimedOutExecution(candidate, error);
          await this.#pool.release(candidate, recoverable);
        }
        if (recycleLinuxBrowser(error)) await sharedBrowserHost.recycle();
        if (!recoverable || attempt === 1) throw error;
      }
    }
    if (resource === undefined) fail("DOM_RUNTIME_FAILED", "DOM page 初始化失败");
    state = "ready";

    const permanentlyFail = async (error: unknown): Promise<never> => {
      state = "failed";
      cache.clear();
      await terminateTimedOutExecution(resource, error);
      await this.#pool.release(resource, recoverableBrowserFailure(error));
      if (recycleLinuxBrowser(error)) await sharedBrowserHost.recycle();
      throw error;
    };

    const runExclusive = <T>(operation: () => Promise<T>): Promise<T> => {
      const next = serial.then(operation, operation);
      serial = next.then(() => undefined, () => undefined);
      return next;
    };

    return Object.freeze({
      snapshotId: artifact.snapshotId,
      isStatic: staticArtifact,
      sample: async (request: TimelineSampleRequest): Promise<TimelineSampleResult> => {
        if (state === "closed" || state === "failed") {
          fail("TIMELINE_INSTANCE_CLOSED", "timeline instance 已关闭");
        }
        cancelled(request.signal);
        const time = rationalTime(request.time);
        if (time.numerator < 0n) fail("INVALID_SAMPLE_TIME", "sample time 不能为负数");
        const subject = artifact.dynamicSubjectProvider === undefined
          ? undefined
          : await artifact.dynamicSubjectProvider(time, request.signal);
        cancelled(request.signal);
        const clock = new SampleClock(artifact.composition.fpsSource);
        const phase = artifact.motion === undefined
          ? undefined
          : clock.phase(
              time,
              clock.frameStart(artifact.motion.startFrame),
              clock.frameStart(artifact.motion.durationInFrames),
              artifact.motion.fill,
            );
        const inactiveSubject = artifact.motion !== undefined && phase === undefined;
        const timePart = staticArtifact ? "static" : rationalTimeKey(time);
        const cacheKey = [
          artifact.snapshotId,
          artifact.propsDigest,
          subject?.digest ?? "static-subject",
          artifact.renderProfile.hash,
          timePart,
        ].join(":");
        return cache.get(cacheKey, () => runExclusive(async () => {
          cancelled(request.signal);
          if (inactiveSubject) {
            if (subject === undefined) {
              fail("MOTION_SUBJECT_MISSING", "fill=none 区间缺少原 subject PNG");
            }
            const result = Object.freeze({
              png: subject.png,
              width: artifact.composition.width,
              height: artifact.composition.height,
              time,
              snapshotId: artifact.snapshotId,
              sha256: createHash("sha256").update(subject.png).digest("hex"),
              videoSurfaces: Object.freeze([]),
            });
            return result;
          }
          state = "sampling";
          try {
            if (subject !== undefined && artifact.textSubject === undefined) {
              await browserCall<void>(resource.page, "setSubject", subject.dataUrl);
            }
            const animationTime = phase?.localTime ?? time;
            const milliseconds = clock.toMilliseconds(animationTime);
            if (hasMedia) {
              await withTimeout(
                "Chromium media seek virtual time resume",
                resource.cdp.send("Emulation.setVirtualTimePolicy", { policy: "advance" }),
              );
            }
            let before: TimelineStateSnapshot;
            try {
              before = await browserCall<TimelineStateSnapshot>(
                resource.page,
                "setTime",
                milliseconds,
              );
            } finally {
              if (hasMedia) {
                const paused = await withTimeout(
                  "Chromium media seek virtual time pause",
                  resource.cdp.send("Emulation.setVirtualTimePolicy", { policy: "pause" }),
                ) as { virtualTimeTicksBase?: number };
                if (
                  headlessFrameControl !== undefined &&
                  Number.isFinite(paused.virtualTimeTicksBase)
                ) {
                  synchronizeHeadlessFrameControl(
                    headlessFrameControl,
                    paused.virtualTimeTicksBase as number,
                  );
                }
              }
            }
            cancelled(request.signal);
            const capture = await withTimeout(
              `DOM compositor ${BROWSER_COMMIT_MODE}`,
              captureCommittedViewport(
                resource.cdp,
                resource.page,
                headlessFrameControl,
              ),
            );
            const after = await browserCall<TimelineStateSnapshot>(resource.page, "snapshot");
            if (JSON.stringify(before) !== JSON.stringify(after)) {
              fail("DOM_ANIMATION_DRIFT", "截图前后 animation state 发生漂移");
            }
            cancelled(request.signal);
            const png = new Uint8Array(Buffer.from(capture.data, "base64"));
            const surfaceDigest = JSON.stringify(after.videoSurfaces);
            const result = Object.freeze({
              png,
              width: artifact.composition.width,
              height: artifact.composition.height,
              time,
              snapshotId: artifact.snapshotId,
              sha256: createHash("sha256")
                .update(png)
                .update(surfaceDigest)
                .digest("hex"),
              videoSurfaces: Object.freeze(after.videoSurfaces.map((surface) =>
                Object.freeze(surface)
              )),
            });
            state = "ready";
            return result;
          } catch (error) {
            if (error instanceof CoreError && error.code === "RENDER_CANCELLED") {
              state = "ready";
              throw error;
            }
            return permanentlyFail(error);
          }
        }));
      },
      close: async () => {
        if (state === "closed" || state === "failed") return;
        state = "closed";
        cache.clear();
        await serial;
        await this.#pool.release(resource);
      },
    });
  }

  async close(): Promise<void> {
    await this.#pool.close();
  }
}

export class VisualTimelineRuntime {
  readonly #dom: DomTimelineAdapter;
  readonly #resolveAuthorImport: ResolveAuthorImport;

  constructor(options: VisualTimelineRuntimeOptions) {
    this.#dom = new DomTimelineAdapter(options.maximumDomPages);
    this.#resolveAuthorImport = options.resolveAuthorImport;
  }

  async open(
    input: CompiledVisualArtifact | CompileVisualArtifactOptions,
  ): Promise<TimelineInstance> {
    const artifact = "sdkAbiVersion" in input
      ? input
      : await compileVisualArtifact(input, {
          resolveAuthorImport: this.#resolveAuthorImport,
        });
    return this.#dom.open(artifact);
  }

  async close(): Promise<void> {
    await this.#dom.close();
  }
}

export interface VisualTimelineRuntimeOptions {
  readonly maximumDomPages?: number;
  readonly resolveAuthorImport: ResolveAuthorImport;
}
