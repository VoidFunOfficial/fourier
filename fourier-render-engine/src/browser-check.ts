import { createHash } from "node:crypto";
import { chromium, type Browser } from "playwright";
import {
  BROWSER_COMMIT_MODE,
  browserOperationTimeout,
  captureCommittedViewport,
  chromiumLaunchOptions,
  configureTransparentViewport,
  initializeHeadlessFrameControl,
  type HeadlessFrameControl,
} from "./browser-platform.ts";
import { RenderEngineError } from "./errors.ts";
import {
  CHROMIUM_REVISION,
  CHROMIUM_VERSION,
  PLAYWRIGHT_VERSION,
} from "./render-profile.ts";

export interface BrowserCheckResult {
  readonly ok: true;
  readonly playwright: typeof PLAYWRIGHT_VERSION;
  readonly chromium: typeof CHROMIUM_VERSION;
  readonly chromiumRevision: typeof CHROMIUM_REVISION;
  readonly runtime: typeof BROWSER_COMMIT_MODE;
  readonly committedPngSha256: string;
}

function withTimeout<T>(
  operation: string,
  promise: Promise<T>,
  milliseconds = browserOperationTimeout(),
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new RenderEngineError("DOM_RUNTIME_TIMEOUT", `${operation} 超过 ${milliseconds}ms`)),
      milliseconds,
    );
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

export async function checkBrowserRuntime(): Promise<BrowserCheckResult> {
  let browser: Browser;
  try {
    // Let Playwright own launch timeout cleanup; an outer Promise.race can
    // reject first and leave a late browser process orphaned.
    browser = await chromium.launch({
      // The check validates the profile that every Linux worker can run. The
      // production runtime may first try stricter single-process mode, then
      // automatically restart into this single-renderer profile.
      ...chromiumLaunchOptions(
        process.platform,
        process.platform === "linux" ? "single-renderer" : "single-process",
      ),
      timeout: browserOperationTimeout(),
    });
  } catch (error) {
    throw new RenderEngineError(
      "CHROMIUM_NOT_INSTALLED",
      `无法启动固定的 Playwright Chromium: ${error instanceof Error ? error.message : String(error)}`,
      {
        executablePath: chromium.executablePath(),
        chromiumRevision: CHROMIUM_REVISION,
        installCommand: process.platform === "linux"
          ? "bunx playwright install --with-deps chromium"
          : "bunx playwright install chromium",
      },
    );
  }

  try {
    const actualVersion = browser.version();
    if (actualVersion !== CHROMIUM_VERSION) {
      throw new RenderEngineError(
        "CHROMIUM_VERSION_MISMATCH",
        `Chromium 版本不匹配：期望 ${CHROMIUM_VERSION}，实际 ${actualVersion}`,
        { expected: CHROMIUM_VERSION, actual: actualVersion, chromiumRevision: CHROMIUM_REVISION },
      );
    }
    const context = await withTimeout("browser.newContext", browser.newContext({
      viewport: { width: 64, height: 64 },
      deviceScaleFactor: 1,
      locale: "en-US",
      timezoneId: "UTC",
      colorScheme: "light",
      reducedMotion: "no-preference",
      serviceWorkers: "block",
    }));
    try {
      await context.route("**/*", (route) => route.abort("blockedbyclient"));
      const page = await withTimeout("context.newPage", context.newPage());
      await withTimeout("page.setContent", page.setContent(
        "<!doctype html><style>html,body{margin:0;background:transparent}#root{width:64px;height:64px;background:#22c55e}</style><div id=root></div>",
      ));
      const cdp = await withTimeout("context.newCDPSession", context.newCDPSession(page));
      await withTimeout("transparent background", configureTransparentViewport(cdp));
      let headlessFrameControl: HeadlessFrameControl | undefined;
      if (BROWSER_COMMIT_MODE === "headless-begin-frame") {
        headlessFrameControl = await withTimeout(
          "Linux BeginFrame control initialization",
          initializeHeadlessFrameControl(cdp),
        );
      } else {
        await withTimeout("Emulation.setVirtualTimePolicy", cdp.send("Emulation.setVirtualTimePolicy", {
          policy: "pause",
          initialVirtualTime: 0,
        }));
      }
      let frame: { data: string };
      try {
        frame = await withTimeout(
          BROWSER_COMMIT_MODE,
          captureCommittedViewport(cdp, page, headlessFrameControl),
        );
      } catch (error) {
        throw new RenderEngineError(
          "DOM_COMPOSITOR_COMMIT_FAILED",
          error instanceof Error ? error.message : String(error),
          { chromium: actualVersion, runtime: BROWSER_COMMIT_MODE },
        );
      }
      const png = Buffer.from(frame.data, "base64");
      return Object.freeze({
        ok: true,
        playwright: PLAYWRIGHT_VERSION,
        chromium: CHROMIUM_VERSION,
        chromiumRevision: CHROMIUM_REVISION,
        runtime: BROWSER_COMMIT_MODE,
        committedPngSha256: createHash("sha256").update(png).digest("hex"),
      });
    } finally {
      await withTimeout("context.close", context.close()).catch(() => undefined);
    }
  } finally {
    await withTimeout("browser.close", browser.close()).catch(() => undefined);
  }
}
