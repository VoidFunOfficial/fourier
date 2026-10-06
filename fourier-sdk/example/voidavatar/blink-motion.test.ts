import { expect, test } from "bun:test";
import { createBlinkChannels, createBlinkEvents } from "./blink-motion.ts";

test("女孩与猫每次都会双眼完全闭合，保持后重新睁开", () => {
  for (const duration of [4, 12, 16]) {
    const channels = createBlinkChannels(duration);
    const events = createBlinkEvents(duration);
    expect(events.filter(event => event.subject === "girl")).toHaveLength(5);
    expect(events.filter(event => event.subject === "cat")).toHaveLength(3);
    expect(Object.isFrozen(events)).toBe(true);
    for (const event of events) {
      const prefix = event.subject === "cat" ? "CatEyeOpen" : "EyeOpen";
      const left = channels[`${prefix}L`]!, right = channels[`${prefix}R`]!;
      expect(event.closeSeconds).toBeGreaterThanOrEqual(.06);
      expect(event.holdSeconds - event.rightDelaySeconds).toBeGreaterThanOrEqual(.04);
      expect(event.holdSeconds).toBeGreaterThanOrEqual(event.subject === "cat" ? .10 : .04);
      const closedStart = event.start + event.closeSeconds + event.rightDelaySeconds;
      const bothClosed = closedStart + (event.holdSeconds - event.rightDelaySeconds) / 2;
      expect(left(bothClosed)).toBe(0);
      expect(right(bothClosed)).toBe(0);
      const end = event.start + event.closeSeconds + event.holdSeconds + event.openSeconds + event.rightDelaySeconds;
      expect(left(end + .001)).toBe(1);
      expect(right(end + .001)).toBe(1);
      expect(end).toBeLessThan(duration - .07);
    }
  }
});

test("左右眼略微错开且女孩与猫保持不同节奏", () => {
  const duration = 12;
  const channels = createBlinkChannels(duration);
  const events = createBlinkEvents(duration);
  for (const event of events) {
    const prefix = event.subject === "cat" ? "CatEyeOpen" : "EyeOpen";
    const left = channels[`${prefix}L`]!, right = channels[`${prefix}R`]!;
    const closing = event.start + event.closeSeconds / 2;
    expect(left(closing)).toBeLessThan(right(closing));
    const reopening = event.start + event.closeSeconds + event.holdSeconds + event.openSeconds / 2;
    expect(left(reopening)).toBeGreaterThan(right(reopening));
    const other = event.subject === "cat" ? channels.EyeOpenL! : channels.CatEyeOpenL!;
    expect(other(closing)).toBe(1);
  }
  const girl = events.filter(event => event.subject === "girl");
  const firstDouble = girl[1]!, secondDouble = girl[2]!;
  const end = firstDouble.start + firstDouble.closeSeconds + firstDouble.holdSeconds + firstDouble.openSeconds + firstDouble.rightDelaySeconds;
  expect(secondDouble.start - end).toBeGreaterThanOrEqual(.06);
  expect(secondDouble.start - end).toBeLessThan(.15);
  expect(girl[3]!.closeSeconds + girl[3]!.holdSeconds + girl[3]!.openSeconds).toBeGreaterThan(.40);
});

test("眨眼边界一阶连续，首尾保持睁眼，乱序采样可复现", () => {
  for (const duration of [4, 12, 16]) {
    const channels = createBlinkChannels(duration);
    const events = createBlinkEvents(duration);
    for (const [name, sample] of Object.entries(channels)) {
      expect(sample(0)).toBe(1);
      expect(sample(duration)).toBe(1);
      expect(sample(duration - .04)).toBe(1);
      expect(sample(.04)).toBe(1);
      const t = events[0]!.start + .055;
      const earlier = sample(t);
      sample(duration - .01); sample(-4.37); sample(.01);
      expect(sample(t)).toBe(earlier);
      expect(sample(t + duration)).toBeCloseTo(earlier, 11);
      const subject = name.startsWith("Cat") ? "cat" : "girl";
      for (const event of events.filter(event => event.subject === subject)) {
        const start = event.start + (name.endsWith("R") ? event.rightDelaySeconds : 0);
        for (const boundary of [start, start + event.closeSeconds, start + event.closeSeconds + event.holdSeconds, start + event.closeSeconds + event.holdSeconds + event.openSeconds]) {
          const h = 1e-7;
          const before = (sample(boundary) - sample(boundary - h)) / h;
          const after = (sample(boundary + h) - sample(boundary)) / h;
          expect(Math.abs(before - after)).toBeLessThan(.0001);
        }
      }
      const values = Array.from({ length: duration * 240 + 1 }, (_, i) => sample(i / 240));
      expect(values.every(Number.isFinite)).toBe(true);
      expect(Math.min(...values)).toBe(0);
      expect(Math.max(...values)).toBe(1);
    }
  }
});

test("非法时长和非有限采样时间被拒绝", () => {
  expect(() => createBlinkEvents(0)).toThrow("时长");
  expect(() => createBlinkEvents(Infinity)).toThrow("时长");
  expect(() => createBlinkChannels(12).CatEyeOpenL!(NaN)).toThrow("采样时间");
});
