import type { CDPSession, LaunchOptions, Page } from "playwright";
import { CoreError } from "./errors.ts";

export type BrowserCommitMode =
  | "headed-page-capture"
  | "headless-begin-frame";

export type LinuxHeadlessProcessMode =
  | "single-process"
  | "single-renderer";

export const BROWSER_COMMIT_MODE: BrowserCommitMode = process.platform === "darwin"
  ? "headed-page-capture"
  : "headless-begin-frame";

const commonArgs = [
  "--run-all-compositor-stages-before-draw",
  "--disable-gpu",
  "--force-color-profile=srgb",
  "--hide-scrollbars",
  "--mute-audio",
] as const;

// Linux render workers are commonly deployed in containers with a small
// /dev/shm and a low process/thread limit. Always limit the renderer and its
// compositor work; SharedBrowserHost initially adds the stricter process flags
// and can retry without them when chrome-headless-shell closes its first target.
const linuxHeadlessArgs = [
  "--renderer-process-limit=1",
  "--disable-dev-shm-usage",
  "--disable-threaded-animation",
  "--disable-threaded-scrolling",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
] as const;

const BEGIN_FRAME_INTERVAL_MS = 1000 / 60;

export interface HeadlessFrameControl {
  nextFrameTimeTicks: number;
}

/**
 * Align BeginFrame with a new virtual-time base without ever reusing or
 * moving behind a frame timestamp that has already been submitted.
 */
export function synchronizeHeadlessFrameControl(
  control: HeadlessFrameControl,
  virtualTimeTicksBase: number,
): void {
  if (!Number.isFinite(virtualTimeTicksBase)) return;
  control.nextFrameTimeTicks = Math.max(
    control.nextFrameTimeTicks,
    virtualTimeTicksBase,
  );
}

export function browserOperationTimeout(
  platform: NodeJS.Platform = process.platform,
): number {
  const configured = Number(Bun.env.FOURIER_DOM_TIMEOUT_MS ?? "");
  if (Number.isSafeInteger(configured) && configured >= 1_000) return configured;
  return platform === "linux" ? 30_000 : 15_000;
}

export function chromiumLaunchOptions(
  platform: NodeJS.Platform = process.platform,
  linuxProcessMode: LinuxHeadlessProcessMode = "single-process",
): LaunchOptions {
  if (platform === "darwin") {
    return {
      headless: false,
      args: [...commonArgs],
    };
  }
  return {
    headless: true,
    chromiumSandbox: false,
    args: [
      "--deterministic-mode",
      "--enable-begin-frame-control",
      ...(platform === "linux"
        ? [
            ...(linuxProcessMode === "single-process"
              ? ["--single-process", "--no-zygote"]
              : []),
            ...linuxHeadlessArgs,
          ]
        : []),
      ...commonArgs,
    ],
  };
}

/** Preserve DOM transparency in CDP screenshots instead of compositing onto Chromium white. */
export async function configureTransparentViewport(cdp: CDPSession): Promise<void> {
  await cdp.send("Emulation.setDefaultBackgroundColorOverride", {
    color: { r: 0, g: 0, b: 0, a: 0 },
  });
}

export async function captureCommittedViewport(
  cdp: CDPSession,
  page: Page,
  headlessFrameControl?: HeadlessFrameControl,
): Promise<{ data: string; hasDamage?: boolean }> {
  if (BROWSER_COMMIT_MODE === "headed-page-capture") {
    const png = await page.screenshot({
      type: "png",
      omitBackground: true,
      animations: "allow",
      caret: "hide",
      scale: "device",
    });
    return { data: png.toString("base64") };
  }
  if (headlessFrameControl === undefined) {
    throw new CoreError(
      "HEADLESS_FRAME_CONTROL_NOT_INITIALIZED",
      "Linux BeginFrame 截图前必须初始化 frame control",
    );
  }
  return captureHeadlessCommittedViewport(cdp, headlessFrameControl);
}

function takeFrameTimeTicks(control: HeadlessFrameControl): number {
  const value = control.nextFrameTimeTicks;
  control.nextFrameTimeTicks += BEGIN_FRAME_INTERVAL_MS;
  return value;
}

export async function initializeHeadlessFrameControl(
  cdp: CDPSession,
): Promise<HeadlessFrameControl> {
  await cdp.send("Page.enable");
  const virtualTime = await cdp.send("Emulation.setVirtualTimePolicy", {
    policy: "pause",
    initialVirtualTime: 0,
  }) as { virtualTimeTicksBase?: number };
  if (!Number.isFinite(virtualTime.virtualTimeTicksBase)) {
    throw new CoreError(
      "HEADLESS_FRAME_CONTROL_INIT_FAILED",
      "Emulation.setVirtualTimePolicy 没有返回 virtualTimeTicksBase",
    );
  }
  const control: HeadlessFrameControl = {
    nextFrameTimeTicks: virtualTime.virtualTimeTicksBase as number,
  };
  await cdp.send("HeadlessExperimental.beginFrame", {
    frameTimeTicks: takeFrameTimeTicks(control),
    noDisplayUpdates: false,
  });
  return control;
}

export async function captureHeadlessCommittedViewport(
  cdp: CDPSession,
  control: HeadlessFrameControl,
): Promise<{ data: string; hasDamage?: boolean }> {
  const capture = () => cdp.send("HeadlessExperimental.beginFrame", {
    frameTimeTicks: takeFrameTimeTicks(control),
    interval: BEGIN_FRAME_INTERVAL_MS,
    noDisplayUpdates: false,
    screenshot: { format: "png" },
  }) as Promise<{ screenshotData?: string; hasDamage?: boolean }>;
  // A newly created headless surface can report no screenshot data for its
  // first frame(s), especially with software rasterization in a container.
  // Drive a fresh compositor frame between bounded capture attempts.
  let result: { screenshotData?: string; hasDamage?: boolean } = {};
  for (let attempt = 0; attempt < 3; attempt += 1) {
    result = await capture();
    if (result.screenshotData !== undefined) break;
    if (attempt === 2) break;
    await cdp.send("HeadlessExperimental.beginFrame", {
      frameTimeTicks: takeFrameTimeTicks(control),
      interval: BEGIN_FRAME_INTERVAL_MS,
      noDisplayUpdates: false,
    });
  }
  if (result.screenshotData === undefined) {
    throw new CoreError(
      "DOM_COMPOSITOR_SCREENSHOT_MISSING",
      "HeadlessExperimental.beginFrame 重试后仍未返回 screenshotData",
    );
  }
  return {
    data: result.screenshotData,
    ...(result.hasDamage === undefined ? {} : { hasDamage: result.hasDamage }),
  };
}
