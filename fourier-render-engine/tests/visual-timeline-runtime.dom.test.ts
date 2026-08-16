import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";
import { Resvg } from "@resvg/resvg-js";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { compileVisualArtifact } from "../src/artifact-compiler.ts";
import { SampleClock } from "../src/time.ts";
import { VisualTimelineRuntime } from "../src/visual-timeline-runtime.ts";

const run = Bun.env.RUN_DOM_TESTS === "1";
const describeDom = run ? describe : describe.skip;

function paeth(left: number, up: number, upperLeft: number): number {
  const estimate = left + up - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) return left;
  return upDistance <= upperLeftDistance ? up : upperLeft;
}

function rgbaAlphaAt(png: Uint8Array, x: number, y: number): number {
  const view = Buffer.from(png);
  const width = view.readUInt32BE(16);
  const height = view.readUInt32BE(20);
  if (view[24] !== 8 || view[25] !== 6) throw new Error("expected 8-bit RGBA PNG");
  if (x < 0 || x >= width || y < 0 || y >= height) throw new Error("pixel out of bounds");
  const idat: Buffer[] = [];
  for (let offset = 8; offset < view.length;) {
    const length = view.readUInt32BE(offset);
    const type = view.toString("ascii", offset + 4, offset + 8);
    if (type === "IDAT") idat.push(view.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
  }
  const decoded = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  let previous = new Uint8Array(stride);
  for (let row = 0; row < height; row += 1) {
    const filter = decoded[row * (stride + 1)]!;
    const current = new Uint8Array(stride);
    for (let column = 0; column < stride; column += 1) {
      const raw = decoded[row * (stride + 1) + column + 1]!;
      const left = column >= 4 ? current[column - 4]! : 0;
      const up = previous[column]!;
      const upperLeft = column >= 4 ? previous[column - 4]! : 0;
      const predictor = filter === 0 ? 0
        : filter === 1 ? left
        : filter === 2 ? up
        : filter === 3 ? Math.floor((left + up) / 2)
        : filter === 4 ? paeth(left, up, upperLeft)
        : (() => { throw new Error(`unsupported PNG filter ${filter}`); })();
      current[column] = (raw + predictor) & 0xff;
    }
    if (row === y) return current[x * 4 + 3]!;
    previous = current;
  }
  throw new Error("missing PNG row");
}

describeDom("VisualTimelineRuntime production DOM Adapter", () => {
  let runtime: VisualTimelineRuntime;

  beforeAll(() => {
    runtime = new VisualTimelineRuntime({ maximumDomPages: 2 });
  });

  afterAll(async () => {
    await runtime.close();
  });

  test("多个 runtime 并发复用一个 Chromium，并在独立 page 中渲染", async () => {
    const originalLaunch = chromium.launch.bind(chromium);
    let launches = 0;
    let pages = 0;
    chromium.launch = (async (...arguments_: Parameters<typeof chromium.launch>) => {
      launches += 1;
      const browser = await originalLaunch(...arguments_);
      const originalNewContext = browser.newContext.bind(browser);
      browser.newContext = (async (...contextArguments: Parameters<Browser["newContext"]>) => {
        const context = await originalNewContext(...contextArguments);
        const originalNewPage = context.newPage.bind(context);
        context.newPage = (async (...pageArguments: Parameters<BrowserContext["newPage"]>) => {
          pages += 1;
          return originalNewPage(...pageArguments);
        }) as (...arguments_: Parameters<BrowserContext["newPage"]>) => Promise<Page>;
        return context;
      }) as Browser["newContext"];
      return browser;
    }) as typeof chromium.launch;
    const secondary = new VisualTimelineRuntime({ maximumDomPages: 1 });
    let first: Awaited<ReturnType<VisualTimelineRuntime["open"]>> | undefined;
    let second: Awaited<ReturnType<VisualTimelineRuntime["open"]>> | undefined;
    try {
      const entryPath = join(import.meta.dir, "components/DomStaticPanel.tsx");
      [first, second] = await Promise.all([
        runtime.open({ entryPath }),
        secondary.open({ entryPath }),
      ]);
      expect(launches).toBe(1);
      const expectedPages = process.platform === "darwin" ? 3 : 2;
      expect(pages).toBe(expectedPages);

      await second.close();
      second = undefined;
      second = await secondary.open({ entryPath });
      expect(pages).toBe(expectedPages);
      await second.close();
      second = undefined;
      await secondary.close();
      const frame = await first.sample({ time: { numerator: 0, denominator: 1 } });
      expect(frame.png.slice(0, 8)).toEqual(
        new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      );
    } finally {
      chromium.launch = originalLaunch;
      await second?.close();
      await secondary.close();
      await first?.close();
    }
  }, 30_000);

  test("同一 snapshot/time 在乱序、重复和新 page 中逐字节一致", async () => {
    const entryPath = join(import.meta.dir, "components/DomTimelinePanel.tsx");
    const first = await runtime.open({ entryPath });
      expect(first.isStatic).toBe(false);
      const expected = new Map<string, string>();
      try {
        for (const time of [
          { numerator: 0, denominator: 1 },
          { numerator: 1, denominator: 2 },
          { numerator: 59, denominator: 60 },
        ]) {
          const result = await first.sample({ time });
          expected.set(`${time.numerator}/${time.denominator}`, result.sha256);
          expect(result.png.slice(0, 8)).toEqual(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));
        }
        for (const time of [
          { numerator: 59, denominator: 60 },
          { numerator: 0, denominator: 1 },
          { numerator: 1, denominator: 2 },
        ]) {
          const expectedHash = expected.get(`${time.numerator}/${time.denominator}`);
          if (expectedHash === undefined) throw new Error("missing expected hash");
          expect((await first.sample({ time })).sha256).toBe(expectedHash);
        }
      } finally {
        await first.close();
      }

    const second = await runtime.open({ entryPath });
      try {
        const expectedHash = expected.get("1/2");
        if (expectedHash === undefined) throw new Error("missing expected hash");
        expect((await second.sample({ time: { numerator: 1, denominator: 2 } })).sha256)
          .toBe(expectedHash);
      } finally {
        await second.close();
      }
  }, 30_000);

  test("静态 React v1 跨时间复用同一 PNG", async () => {
    const instance = await runtime.open({
        entryPath: join(import.meta.dir, "components/DomStaticPanel.tsx"),
      });
      try {
        expect(instance.isStatic).toBe(true);
        const first = await instance.sample({ time: { numerator: 0, denominator: 1 } });
        const later = await instance.sample({ time: { numerator: 59, denominator: 60 } });
        expect(later.sha256).toBe(first.sha256);
        expect(later.png).toEqual(first.png);
      } finally {
        await instance.close();
      }
  });

  test("media 与 SMIL 分别由宿主绝对时间暂停采样并支持乱序循环", async () => {
    const entryPath = join(import.meta.dir, "components/DomMediaSmilTimeline.tsx");
    for (const mode of ["media", "smil"] as const) {
      const instance = await runtime.open({ entryPath, props: { mode } });
      try {
        expect(instance.isStatic).toBe(false);
        const start = await instance.sample({ time: { numerator: 0, denominator: 1 } });
        const middle = await instance.sample({ time: { numerator: 1, denominator: 2 } });
        const looped = await instance.sample({
          time: mode === "media"
            ? { numerator: 5, denominator: 2 }
            : { numerator: 3, denominator: 2 },
        });
        expect(middle.sha256).not.toBe(start.sha256);
        expect(looped.png).toEqual(middle.png);
        expect((await instance.sample({ time: { numerator: 0, denominator: 1 } })).png)
          .toEqual(start.png);
      } finally {
        await instance.close();
      }
    }
  }, 30_000);

  test("显式 static React 注册 timeline 时稳定拒绝", async () => {
    await expect(runtime.open({
      entryPath: join(import.meta.dir, "components/DomStaticTimelineViolation.tsx"),
    })).rejects.toMatchObject({ code: "STATIC_REACT_TIMELINE_VIOLATION" });
  });

  test("透明 DOM 截图保留 alpha，不与 Chromium 默认白底合成", async () => {
    const instance = await runtime.open({
      entryPath: join(import.meta.dir, "components/DomTransparentPanel.tsx"),
    });
    try {
      expect(instance.isStatic).toBe(true);
      const frame = await instance.sample({ time: { numerator: 0, denominator: 1 } });
      expect(rgbaAlphaAt(frame.png, 2, 2)).toBe(255);
      expect(rgbaAlphaAt(frame.png, 15, 15)).toBe(0);
    } finally {
      await instance.close();
    }
  });

  test("初始化错误返回稳定 code 并连续释放 page", async () => {
    for (const [filename, code] of [
      ["DomMissingMotionLifecycle.tsx", "FOURIER_LIFECYCLE_REQUIRED"],
      ["DomDuplicateLifecycle.tsx", "DUPLICATE_FOURIER_LIFECYCLE"],
      ["DomAsyncLifecycle.tsx", "FOURIER_LIFECYCLE_ASYNC"],
      ["DomRawWaapi.tsx", "UNREGISTERED_WAAPI_ANIMATION"],
    ] as const) {
      let failure: unknown;
      try {
        await runtime.open({
          entryPath: join(import.meta.dir, `components/${filename}`),
        });
      } catch (error) {
        failure = error;
      }
      expect(failure).toMatchObject({ code });
    }
  }, 20_000);

  test("Motion dynamic subject 与 none/backwards/forwards/both 使用连续局部时间", async () => {
    const entryPath = join(import.meta.dir, "components/DomMotion.tsx");
    const clock = new SampleClock(30);
    const subject = (frame: number): Uint8Array => new Resvg(
      `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="12"><rect width="16" height="12" fill="${frame % 2 === 0 ? "#ef4444" : "#2563eb"}"/></svg>`,
    ).render().asPng();
    const provider = async (time: { numerator: bigint; denominator: bigint }) => {
      const png = subject(clock.frameAt(time));
      return {
        png,
        digest: createHash("sha256").update(png).digest("hex"),
        dataUrl: `data:image/png;base64,${Buffer.from(png).toString("base64")}`,
      };
    };
    const noneArtifact = await compileVisualArtifact({
        entryPath,
        composition: { width: 16, height: 12, fps: 30, durationInFrames: 6 },
        motion: { startFrame: 2, durationInFrames: 2, fill: "none" },
        dynamicSubjectProvider: provider,
      });
      const none = await runtime.open(noneArtifact);
      try {
        const before = await none.sample({ time: clock.frameStart(0) });
        const active = await none.sample({ time: clock.frameStart(2) });
        const after = await none.sample({ time: clock.frameStart(4) });
        expect(before.png).toEqual(subject(0));
        expect(after.png).toEqual(subject(4));
        expect(active.png).not.toEqual(subject(2));
      } finally {
        await none.close();
      }

      for (const fill of ["backwards", "forwards", "both"] as const) {
        const compiled = await compileVisualArtifact({
          entryPath,
          composition: { width: 16, height: 12, fps: 30, durationInFrames: 6 },
          motion: { startFrame: 2, durationInFrames: 2, fill },
          dynamicSubjectProvider: provider,
        });
        const instance = await runtime.open(compiled);
        try {
          const frame = fill === "forwards" ? 4 : 0;
          const sampled = await instance.sample({ time: clock.frameStart(frame) });
          expect(sampled.png).not.toEqual(subject(frame));
        } finally {
          await instance.close();
        }
      }
  }, 30_000);

  test("Text Motion 走独立 textComponent，并拒绝未声明支持的组件", async () => {
    const textEntry = join(import.meta.dir, "components/DomTextMotion.tsx");
    const compiled = await compileVisualArtifact({
      entryPath: textEntry,
      composition: { width: 80, height: 24, fps: 30, durationInFrames: 30 },
      motion: { startFrame: 0, durationInFrames: 30, fill: "both" },
    });
    expect(compiled).toMatchObject({
      supportsTextMotion: true,
      textSubject: "Fourier text",
    });
    const instance = await runtime.open(compiled);
    try {
      const result = await instance.sample({ time: { numerator: 1, denominator: 2 } });
      expect(result.png.slice(0, 8)).toEqual(
        new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      );
    } finally {
      await instance.close();
    }

    await expect(compileVisualArtifact({
      entryPath: join(import.meta.dir, "components/DomMotion.tsx"),
      composition: { width: 16, height: 12, fps: 30, durationInFrames: 30 },
      textSubject: "unsupported",
    })).rejects.toMatchObject({ code: "TEXT_MOTION_UNSUPPORTED" });
  }, 30_000);
});
