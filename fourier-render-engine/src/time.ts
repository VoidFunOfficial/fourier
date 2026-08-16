import { fail } from "./errors.ts";

interface Fraction {
  numerator: bigint;
  denominator: bigint;
}

export interface RationalTime {
  readonly numerator: bigint;
  readonly denominator: bigint;
}

export interface RationalTimeInput {
  numerator: bigint | number | string;
  denominator: bigint | number | string;
}

function gcd(a: bigint, b: bigint): bigint {
  let left = a < 0n ? -a : a;
  let right = b < 0n ? -b : b;
  while (right !== 0n) {
    const next = left % right;
    left = right;
    right = next;
  }
  return left;
}

function fraction(numerator: bigint, denominator: bigint): Fraction {
  if (denominator === 0n) fail("INVALID_NUMBER", "分母不能为零");
  const sign = denominator < 0n ? -1n : 1n;
  const divisor = gcd(numerator, denominator);
  return {
    numerator: (sign * numerator) / divisor,
    denominator: (sign * denominator) / divisor,
  };
}

function integerBigInt(value: bigint | number | string, field: string): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      fail("INVALID_RATIONAL_TIME", `${field} 必须是安全整数`, { field, value });
    }
    return BigInt(value);
  }
  if (!/^-?\d+$/.test(value)) {
    fail("INVALID_RATIONAL_TIME", `${field} 必须是十进制整数`, { field, value });
  }
  return BigInt(value);
}

export function rationalTime(input: RationalTimeInput): RationalTime {
  if (typeof input !== "object" || input === null) {
    fail("INVALID_RATIONAL_TIME", "time 必须是有理数对象");
  }
  return Object.freeze(fraction(
    integerBigInt(input.numerator, "time.numerator"),
    integerBigInt(input.denominator, "time.denominator"),
  ));
}

export function rationalTimeKey(input: RationalTimeInput): string {
  const value = rationalTime(input);
  return `${value.numerator}/${value.denominator}`;
}

export function rationalTimeToSeconds(input: RationalTimeInput): number {
  const value = rationalTime(input);
  return Number(value.numerator) / Number(value.denominator);
}

function add(left: Fraction, right: Fraction): Fraction {
  return fraction(
    left.numerator * right.denominator +
      right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

function multiply(left: Fraction, right: Fraction): Fraction {
  return fraction(
    left.numerator * right.numerator,
    left.denominator * right.denominator,
  );
}

function decimalToFraction(source: string): Fraction {
  if (!/^\d+(?:\.\d+)?$/.test(source)) {
    fail("INVALID_NUMBER", `非法数值 "${source}"`);
  }
  const [integer = "0", decimals = ""] = source.split(".");
  const denominator = 10n ** BigInt(decimals.length);
  return fraction(BigInt(integer + decimals), denominator);
}

function roundFraction(value: Fraction): bigint {
  const negative = value.numerator < 0n;
  const absolute = negative ? -value.numerator : value.numerator;
  const rounded =
    (absolute * 2n + value.denominator) / (value.denominator * 2n);
  return negative ? -rounded : rounded;
}

function ceilFraction(value: Fraction): bigint {
  if (value.numerator < 0n) {
    return -((-value.numerator) / value.denominator);
  }
  return (
    value.numerator + value.denominator - 1n
  ) / value.denominator;
}

export function parsePositiveNumber(
  source: string,
  field: string,
  allowZero = false,
): number {
  const value = Number(source);
  if (
    !Number.isFinite(value) ||
    (allowZero ? value < 0 : value <= 0)
  ) {
    fail(
      "INVALID_ATTRIBUTE",
      `${field} 必须是${allowZero ? "非负" : "正"}数，收到 "${source}"`,
      { field, value: source },
    );
  }
  return value;
}

export function parseInteger(
  source: string,
  field: string,
  options: { positive?: boolean; nonNegative?: boolean } = {},
): number {
  if (!/^-?\d+$/.test(source)) {
    fail("INVALID_ATTRIBUTE", `${field} 必须是整数，收到 "${source}"`, {
      field,
      value: source,
    });
  }
  const value = Number(source);
  if (!Number.isSafeInteger(value)) {
    fail("INVALID_ATTRIBUTE", `${field} 超出安全整数范围`, {
      field,
      value: source,
    });
  }
  if (options.positive && value <= 0) {
    fail("INVALID_ATTRIBUTE", `${field} 必须是正整数`, {
      field,
      value,
    });
  }
  if (options.nonNegative && value < 0) {
    fail("INVALID_ATTRIBUTE", `${field} 不能为负数`, {
      field,
      value,
    });
  }
  return value;
}

/**
 * Converts a V1 time literal to an integer frame using exact rational
 * arithmetic. Values between frame boundaries are rounded to the nearest frame;
 * ties round away from zero. Timeline calculations after this conversion only
 * use integers.
 */
export function parseTimeToFrames(
  source: string,
  fpsSource: string,
  field = "time",
): number {
  if (source.length === 0 || /\s/.test(source)) {
    fail("INVALID_TIME", `${field} 的时间格式非法: "${source}"`, {
      field,
      value: source,
    });
  }

  let sign = 1n;
  let input = source;
  if (input.startsWith("-")) {
    sign = -1n;
    input = input.slice(1);
  } else if (input.startsWith("+")) {
    input = input.slice(1);
  }

  const fps = decimalToFraction(fpsSource);
  if (fps.numerator <= 0n) {
    fail("INVALID_FPS", `fps 必须大于零，收到 "${fpsSource}"`);
  }

  const tokenPattern = /(\d+(?:\.\d+)?)(ms|s|f)/g;
  const units = new Set<string>();
  let cursor = 0;
  let total: Fraction = fraction(0n, 1n);
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(input)) !== null) {
    if (match.index !== cursor) {
      fail("INVALID_TIME", `${field} 的时间格式非法: "${source}"`, {
        field,
        value: source,
      });
    }
    cursor = tokenPattern.lastIndex;
    const valueSource = match[1];
    const unit = match[2];
    if (valueSource === undefined || unit === undefined || units.has(unit)) {
      fail("INVALID_TIME", `${field} 的时间格式非法: "${source}"`, {
        field,
        value: source,
      });
    }
    units.add(unit);
    const value = decimalToFraction(valueSource);
    if (unit === "f") {
      if (value.denominator !== 1n) {
        fail("INVALID_TIME", `${field} 的帧数必须是整数: "${source}"`, {
          field,
          value: source,
        });
      }
      total = add(total, value);
    } else if (unit === "s") {
      total = add(total, multiply(value, fps));
    } else {
      total = add(
        total,
        multiply(value, fraction(fps.numerator, fps.denominator * 1000n)),
      );
    }
  }

  if (cursor !== input.length || cursor === 0) {
    fail("INVALID_TIME", `${field} 的时间格式非法: "${source}"`, {
      field,
      value: source,
    });
  }

  const frames = roundFraction(
    fraction(total.numerator * sign, total.denominator),
  );
  const numeric = Number(frames);
  if (!Number.isSafeInteger(numeric)) {
    fail("INVALID_TIME", `${field} 超出安全帧范围`, {
      field,
      value: source,
    });
  }
  return numeric;
}

export function framesToSeconds(frames: number, fps: number): number {
  return frames / fps;
}

export function framesToFfmpegSeconds(
  frames: number,
  fpsSource: string,
): string {
  const fps = decimalToFraction(fpsSource);
  const value = fraction(
    BigInt(frames) * fps.denominator,
    fps.numerator,
  );
  return `${value.numerator}/${value.denominator}`;
}

export function framesToSamples(
  frames: number,
  sampleRate: number,
  fpsSource: string,
): number {
  const fps = decimalToFraction(fpsSource);
  const value = fraction(
    BigInt(frames) * BigInt(sampleRate) * fps.denominator,
    fps.numerator,
  );
  const samples = roundFraction(value);
  const numeric = Number(samples);
  if (!Number.isSafeInteger(numeric)) {
    fail("INVALID_TIME", "音频采样位置超出安全整数范围");
  }
  return numeric;
}

/**
 * Returns the smallest whole-frame duration that fully contains an audio
 * waveform. This deliberately rounds up so the subtitle never disappears
 * before its final audio sample.
 */
export function samplesToCoveringFrames(
  samples: number,
  sampleRate: number,
  fpsSource: string,
): number {
  if (!Number.isSafeInteger(samples) || samples <= 0) {
    fail("INVALID_AUDIO_DURATION", "音频采样数必须是正安全整数", {
      samples,
    });
  }
  if (!Number.isSafeInteger(sampleRate) || sampleRate <= 0) {
    fail("INVALID_AUDIO_DURATION", "音频采样率必须是正安全整数", {
      sampleRate,
    });
  }
  const fps = decimalToFraction(fpsSource);
  const value = fraction(
    BigInt(samples) * fps.numerator,
    BigInt(sampleRate) * fps.denominator,
  );
  const frames = ceilFraction(value);
  const numeric = Number(frames);
  if (!Number.isSafeInteger(numeric) || numeric <= 0) {
    fail("INVALID_AUDIO_DURATION", "音频时长超出安全帧范围", {
      samples,
      sampleRate,
      fps: fpsSource,
    });
  }
  return numeric;
}

export interface TimelinePhaseSample {
  readonly phase: "before" | "active" | "after";
  readonly localTime: RationalTime;
}

function compare(left: Fraction, right: Fraction): number {
  const difference = left.numerator * right.denominator -
    right.numerator * left.denominator;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

function subtract(left: Fraction, right: Fraction): Fraction {
  return fraction(
    left.numerator * right.denominator - right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

function fpsFraction(source: string | number | RationalTimeInput): Fraction {
  let value: Fraction;
  if (typeof source === "object") {
    value = rationalTime(source);
  } else {
    const text = String(source);
    const ratio = /^(\d+)\/(\d+)$/.exec(text);
    value = ratio === null
      ? decimalToFraction(text)
      : fraction(BigInt(ratio[1]!), BigInt(ratio[2]!));
  }
  if (value.numerator <= 0n) {
    fail("INVALID_FPS", "fps 必须大于零", { fps: String(source) });
  }
  return value;
}

/** Exact frame-start clock used by every DOM timeline caller. */
export class SampleClock {
  readonly fps: RationalTime;

  constructor(source: string | number | RationalTimeInput) {
    this.fps = Object.freeze(fpsFraction(source));
  }

  frameStart(frame: number): RationalTime {
    if (!Number.isSafeInteger(frame) || frame < 0) {
      fail("INVALID_FRAME", "frame 必须是非负安全整数", { frame });
    }
    return Object.freeze(fraction(
      BigInt(frame) * this.fps.denominator,
      this.fps.numerator,
    ));
  }

  frameAt(input: RationalTimeInput): number {
    const time = rationalTime(input);
    if (time.numerator < 0n) fail("INVALID_TIME", "采样时间不能为负数");
    const value = fraction(
      time.numerator * this.fps.numerator,
      time.denominator * this.fps.denominator,
    );
    const numeric = Number(value.numerator / value.denominator);
    if (!Number.isSafeInteger(numeric)) fail("INVALID_TIME", "采样时间超出安全帧范围");
    return numeric;
  }

  toMilliseconds(input: RationalTimeInput): number {
    const time = rationalTime(input);
    const value = Number(time.numerator * 1000n) / Number(time.denominator);
    if (!Number.isFinite(value)) fail("INVALID_TIME", "采样时间无法转换为浏览器时间");
    return value;
  }

  phase(
    input: RationalTimeInput,
    start: RationalTimeInput,
    duration: RationalTimeInput,
    fill: "none" | "forwards" | "backwards" | "both",
  ): TimelinePhaseSample | undefined {
    const time = rationalTime(input);
    const startTime = rationalTime(start);
    const durationTime = rationalTime(duration);
    if (durationTime.numerator <= 0n) fail("INVALID_TIME", "timeline duration 必须大于零");
    const endTime = add(startTime, durationTime);
    if (compare(time, startTime) < 0) {
      if (fill !== "backwards" && fill !== "both") return undefined;
      return Object.freeze({ phase: "before", localTime: fraction(0n, 1n) });
    }
    if (compare(time, endTime) >= 0) {
      if (fill !== "forwards" && fill !== "both") return undefined;
      return Object.freeze({ phase: "after", localTime: durationTime });
    }
    return Object.freeze({
      phase: "active",
      localTime: Object.freeze(subtract(time, startTime)),
    });
  }
}
