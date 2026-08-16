import { describe, expect, test } from "bun:test";
import type { CDPSession } from "playwright";
import {
  captureHeadlessCommittedViewport,
  chromiumLaunchOptions,
  initializeHeadlessFrameControl,
  synchronizeHeadlessFrameControl,
} from "../src/browser-platform.ts";

function cdpMock(
  handler: (method: string, params: Record<string, unknown> | undefined) => unknown,
  calls: Array<{ method: string; params?: Record<string, unknown> }>,
): CDPSession {
  return {
    async send(method: string, params?: Record<string, unknown>) {
      calls.push({ method, ...(params === undefined ? {} : { params }) });
      return handler(method, params);
    },
  } as unknown as CDPSession;
}

describe("Linux headless compositor capture", () => {
  test("Linux 只启动一个 browser/renderer process，并使用容器安全参数", () => {
    const options = chromiumLaunchOptions("linux");
    expect(options.headless).toBe(true);
    expect(options.chromiumSandbox).toBe(false);
    expect(options.args).toContain("--single-process");
    expect(options.args).toContain("--renderer-process-limit=1");
    expect(options.args).toContain("--no-zygote");
    expect(options.args).toContain("--disable-dev-shm-usage");
    expect(options.args).toContain("--disable-threaded-animation");
    expect(options.args).toContain("--disable-threaded-scrolling");
  });

  test("Linux 兼容模式保留单 renderer，但不使用易导致 headless-shell 退出的参数", () => {
    const options = chromiumLaunchOptions("linux", "single-renderer");
    expect(options.headless).toBe(true);
    expect(options.args).not.toContain("--single-process");
    expect(options.args).not.toContain("--no-zygote");
    expect(options.args).toContain("--renderer-process-limit=1");
    expect(options.args).toContain("--disable-threaded-animation");
    expect(options.args).toContain("--disable-threaded-scrolling");
  });

  test("初始化 Page/虚拟时间并发送无截图的首个 BeginFrame", async () => {
    const calls: Array<{ method: string; params?: Record<string, unknown> }> = [];
    const control = await initializeHeadlessFrameControl(cdpMock(
      (method) => method === "Emulation.setVirtualTimePolicy"
        ? { virtualTimeTicksBase: 100 }
        : {},
      calls,
    ));

    expect(control.nextFrameTimeTicks).toBeCloseTo(100 + 1000 / 60);
    expect(calls.map(({ method }) => method)).toEqual([
      "Page.enable",
      "Emulation.setVirtualTimePolicy",
      "HeadlessExperimental.beginFrame",
    ]);
    expect(calls[2]?.params).toMatchObject({
      frameTimeTicks: 100,
      noDisplayUpdates: false,
    });
  });

  test("截图 BeginFrame 使用严格递增的 frameTimeTicks", async () => {
    const calls: Array<{ method: string; params?: Record<string, unknown> }> = [];
    const control = { nextFrameTimeTicks: 100 };
    const result = await captureHeadlessCommittedViewport(cdpMock(
      () => ({ screenshotData: "inline-png", hasDamage: true }),
      calls,
    ), control);

    expect(result).toEqual({ data: "inline-png", hasDamage: true });
    expect(calls[0]?.params?.frameTimeTicks).toBe(100);
    expect(control.nextFrameTimeTicks).toBeCloseTo(100 + 1000 / 60);
  });

  test("虚拟时间重新对齐不能回退或复用已发送的 BeginFrame 时间", () => {
    const control = { nextFrameTimeTicks: 100 + 1000 / 60 };

    synchronizeHeadlessFrameControl(control, 100);
    expect(control.nextFrameTimeTicks).toBeCloseTo(100 + 1000 / 60);

    synchronizeHeadlessFrameControl(control, 200);
    expect(control.nextFrameTimeTicks).toBe(200);
  });

  test("截图缺失时仍只用 BeginFrame 刷新并重试", async () => {
    const calls: Array<{ method: string; params?: Record<string, unknown> }> = [];
    let frame = 0;
    const result = await captureHeadlessCommittedViewport(cdpMock(
      () => ++frame === 3
        ? { screenshotData: "retry-png", hasDamage: true }
        : { hasDamage: false },
      calls,
    ), { nextFrameTimeTicks: 100 });

    expect(result).toEqual({ data: "retry-png", hasDamage: true });
    expect(calls.map(({ method }) => method)).toEqual([
      "HeadlessExperimental.beginFrame",
      "HeadlessExperimental.beginFrame",
      "HeadlessExperimental.beginFrame",
    ]);
    expect(calls.map(({ params }) => params?.frameTimeTicks)).toEqual([
      100,
      100 + 1000 / 60,
      100 + 2000 / 60,
    ]);
  });

  test("连续缺失 screenshotData 时进行有界重试", async () => {
    const calls: Array<{ method: string; params?: Record<string, unknown> }> = [];
    await expect(captureHeadlessCommittedViewport(cdpMock(
      () => ({ hasDamage: false }),
      calls,
    ), { nextFrameTimeTicks: 100 })).rejects.toMatchObject({
      code: "DOM_COMPOSITOR_SCREENSHOT_MISSING",
    });

    expect(calls).toHaveLength(5);
    expect(calls.filter(({ params }) => params?.screenshot !== undefined)).toHaveLength(3);
  });
});
