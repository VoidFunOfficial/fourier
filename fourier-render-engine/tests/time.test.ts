import { describe, expect, test } from "bun:test";
import { RenderEngineError } from "../src/errors.ts";
import {
  framesToFfmpegSeconds,
  framesToSamples,
  parseTimeToFrames,
  rationalTimeKey,
  SampleClock,
  samplesToCoveringFrames,
} from "../src/time.ts";

describe("V1 时间解析", () => {
  test("把秒、毫秒和帧转换为整数帧", () => {
    expect(parseTimeToFrames("1s45f", "60")).toBe(105);
    expect(parseTimeToFrames("500ms", "30")).toBe(15);
    expect(parseTimeToFrames("60f", "30")).toBe(60);
    expect(parseTimeToFrames("-1s15f", "30")).toBe(-45);
  });

  test("在帧边界之间使用精确有理数四舍五入", () => {
    expect(parseTimeToFrames("50ms", "30")).toBe(2);
    expect(parseTimeToFrames("-50ms", "30")).toBe(-2);
    expect(parseTimeToFrames("1s", "29.97")).toBe(30);
  });

  test("拒绝非法时间", () => {
    for (const source of ["", "1", "1sec", "1s 2f", "1.5f", "1s2s"]) {
      expect(() => parseTimeToFrames(source, "30")).toThrow(
        RenderEngineError,
      );
    }
  });

  test("生成 FFmpeg 有理秒和音频采样位置", () => {
    expect(framesToFfmpegSeconds(15, "30")).toBe("1/2");
    expect(framesToSamples(15, 48_000, "30")).toBe(24_000);
  });

  test("用覆盖式取整把真实音频采样数转换为字幕帧数", () => {
    expect(samplesToCoveringFrames(48_000, 48_000, "30")).toBe(30);
    expect(samplesToCoveringFrames(48_001, 48_000, "30")).toBe(31);
    expect(samplesToCoveringFrames(1, 48_000, "29.97")).toBe(1);
  });
});

describe("DOM SampleClock", () => {
  test("24/25/29.97/30/60fps 始终返回约分后的 frame-start 有理时间", () => {
    expect(rationalTimeKey(new SampleClock(24).frameStart(12))).toBe("1/2");
    expect(rationalTimeKey(new SampleClock(25).frameStart(10))).toBe("2/5");
    expect(rationalTimeKey(new SampleClock("29.97").frameStart(29_970))).toBe("1000/1");
    expect(rationalTimeKey(new SampleClock(30).frameStart(15))).toBe("1/2");
    expect(rationalTimeKey(new SampleClock(60).frameStart(30))).toBe("1/2");
    expect(rationalTimeKey(new SampleClock("30000/1001").frameStart(30_000))).toBe("1001/1");
  });

  test("frameAt 使用半开 frame-start 区间且长时无累计浮点误差", () => {
    const clock = new SampleClock("30000/1001");
    const start = clock.frameStart(10_000_000);
    expect(clock.frameAt(start)).toBe(10_000_000);
    expect(clock.frameAt({
      numerator: start.numerator * 60_000n + 1_001n * start.denominator,
      denominator: start.denominator * 60_000n,
    })).toBe(10_000_000);
  });

  test("Motion fill 使用半开 active 区间", () => {
    const clock = new SampleClock(30);
    const start = { numerator: 1, denominator: 1 };
    const duration = { numerator: 2, denominator: 1 };
    expect(clock.phase({ numerator: 0, denominator: 1 }, start, duration, "none")).toBeUndefined();
    expect(clock.phase({ numerator: 0, denominator: 1 }, start, duration, "backwards"))
      .toMatchObject({ phase: "before", localTime: { numerator: 0n, denominator: 1n } });
    expect(clock.phase({ numerator: 1, denominator: 1 }, start, duration, "both"))
      .toMatchObject({ phase: "active", localTime: { numerator: 0n, denominator: 1n } });
    expect(clock.phase({ numerator: 3, denominator: 1 }, start, duration, "forwards"))
      .toMatchObject({ phase: "after", localTime: { numerator: 2n, denominator: 1n } });
  });
});
