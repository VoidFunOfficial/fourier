import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser } from "playwright";
import {
  BROWSER_COMMIT_MODE,
  captureCommittedViewport,
  chromiumLaunchOptions,
  initializeHeadlessFrameControl,
  type HeadlessFrameControl,
} from "../src/browser-platform.ts";

function withTimeout<T>(operation: string, promise: Promise<T>, milliseconds = 15_000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`DOM_COMPOSITOR_COMMIT_FAILED: ${operation} 超过 ${milliseconds}ms`)),
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

const run = Bun.env.RUN_DOM_TESTS === "1";
const describeDom = run ? describe : describe.skip;

describeDom("DOM timeline Phase 0 conformance", () => {
  let browser: Browser;
  let bundle = "";
  let temporaryDirectory = "";

  beforeAll(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), "fourier-phase0-"));
    const reactEntry = Bun.resolveSync("react", import.meta.dir);
    const reactJsxRuntimeEntry = Bun.resolveSync("react/jsx-runtime", import.meta.dir);
    const result = await Bun.build({
      entrypoints: [join(import.meta.dir, "fixtures/dom/Phase0Harness.tsx")],
      outdir: temporaryDirectory,
      target: "browser",
      format: "iife",
      minify: false,
      sourcemap: "inline",
      define: { "process.env.NODE_ENV": JSON.stringify("production") },
      plugins: [{
        name: "fourier-single-react-runtime",
        setup(build) {
          build.onResolve({ filter: /^react$/ }, () => ({ path: reactEntry }));
          build.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: reactJsxRuntimeEntry }));
        },
      }],
    });
    if (!result.success || result.outputs[0] === undefined) {
      throw new Error(result.logs.map((log) => log.message).join("\n"));
    }
    bundle = await result.outputs[0].text();
    browser = await chromium.launch(chromiumLaunchOptions());
  });

  afterAll(async () => {
    await browser?.close();
    if (temporaryDirectory !== "") {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });

  async function openHarness() {
    const context = await browser.newContext({
      viewport: { width: 64, height: 64 },
      deviceScaleFactor: 1,
      locale: "en-US",
      timezoneId: "UTC",
      colorScheme: "light",
      reducedMotion: "no-preference",
      serviceWorkers: "block",
    });
    await context.route("**/*", (route) => route.abort());
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.setContent("<!doctype html><style>html,body,#root{width:64px;height:64px;margin:0;background:transparent;overflow:hidden}</style><div id=root></div>");
    await page.addScriptTag({ content: bundle });
    const cdp = await context.newCDPSession(page);
    try {
      await page.evaluate(() => window.phase0Harness.initialize());
    } catch (error) {
      throw new Error([
        error instanceof Error ? error.message : String(error),
        ...pageErrors,
      ].join("\n"));
    }
    let headlessFrameControl: HeadlessFrameControl | undefined;
    if (BROWSER_COMMIT_MODE === "headless-begin-frame") {
      headlessFrameControl = await initializeHeadlessFrameControl(cdp);
    } else {
      await cdp.send("Emulation.setVirtualTimePolicy", {
        policy: "pause",
        initialVirtualTime: 0,
      });
    }
    return {
      context,
      page,
      async capture(milliseconds: number, waitMilliseconds = 0) {
        await page.evaluate((time) => window.phase0Harness.setTime(time), milliseconds);
        if (waitMilliseconds > 0) await Bun.sleep(waitMilliseconds);
        const before = await page.evaluate(() => window.phase0Harness.snapshot());
        const frame = await withTimeout(
          BROWSER_COMMIT_MODE,
          captureCommittedViewport(cdp, page, headlessFrameControl),
        );
        const after = await page.evaluate(() => window.phase0Harness.snapshot());
        expect(after).toEqual(before);
        expect(after.every((animation) => animation.playState === "paused")).toBe(true);
        const png = Buffer.from(frame.data, "base64");
        return createHash("sha256").update(png).digest("hex");
      },
    };
  }

  test(`${BROWSER_COMMIT_MODE} 在乱序、重复和真实等待后保持绝对时间像素`, async () => {
    const first = await openHarness();
    try {
      const expected = new Map<number, string>();
      for (const time of [0, 500, 1000]) expected.set(time, await first.capture(time));
      for (const [time, wait] of [[1000, 0], [0, 50], [500, 500], [0, 2000]] as const) {
        const expectedHash = expected.get(time);
        if (expectedHash === undefined) throw new Error(`missing expected hash for ${time}ms`);
        expect(await first.capture(time, wait)).toBe(expectedHash);
      }
      const second = await openHarness();
      try {
        for (const time of [500, 1000, 0]) {
          const expectedHash = expected.get(time);
          if (expectedHash === undefined) throw new Error(`missing expected hash for ${time}ms`);
          expect(await second.capture(time)).toBe(expectedHash);
        }
      } finally {
        await second.context.close();
      }
    } finally {
      await first.context.close();
    }
  }, 30_000);
});
