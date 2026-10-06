import { expect, test } from "bun:test";
import { createPropsTimeline, propsShowcaseDuration, voidavatarPropShowcaseOrder } from "./props-timeline.ts";

test("30 秒道具展示依序覆盖十种道具，折扇展示左手绑定", () => {
  const timeline = createPropsTimeline();
  expect(timeline.duration).toBe(30);
  expect(voidavatarPropShowcaseOrder).toHaveLength(10);
  for (let i = 0; i < 10; i++) {
    const pose = timeline.sample(i * 3 + 1.5);
    expect(pose.PropOpacity).toBe(1);
    expect(pose.PropScale).toBe(1);
    expect(pose[i === 9 ? "HandPropL" : "HandPropR"]).toBe(i + 1);
    expect(pose[i === 9 ? "HandPropR" : "HandPropL"]).toBe(0);
    expect(pose[i === 9 ? "ArmL" : "ArmR"]!).toBeGreaterThanOrEqual(.45);
    expect(pose[i === 9 ? "ArmL" : "ArmR"]!).toBeLessThanOrEqual(.65);
  }
});

test("每段道具仅在透明时换图，并用四分之一秒渐入渐出", () => {
  const timeline = createPropsTimeline();
  for (let i = 0; i < 10; i++) {
    const start = i * 3;
    expect(timeline.sample(start).PropOpacity).toBe(0);
    expect(timeline.sample(start).HandPropL).toBe(0);
    expect(timeline.sample(start).HandPropR).toBe(0);
    expect(timeline.sample(start + .125).PropOpacity).toBeCloseTo(.5, 10);
    expect(timeline.sample(start + .25).PropOpacity).toBe(1);
    expect(timeline.sample(start + 2.75).PropOpacity).toBe(1);
    expect(timeline.sample(start + 2.875).PropOpacity).toBeCloseTo(.5, 10);
  }
  expect(timeline.sample(30).PropOpacity).toBe(0);
});

test("固定选择保持同一道具，轻动作不会在三秒界限突然重置", () => {
  for (const [i, name] of voidavatarPropShowcaseOrder.entries()) {
    const timeline = createPropsTimeline(name);
    for (const t of [1.5, 3, 12.5, 28.5]) {
      const pose = timeline.sample(t);
      expect(pose[i === 9 ? "HandPropL" : "HandPropR"]).toBe(i + 1);
      expect(pose.PropOpacity).toBe(1);
    }
    const left = timeline.sample(3 - .0001), right = timeline.sample(3 + .0001);
    for (const key of ["ArmL", "ArmR", "HandL", "HandR", "PropAngle"]) expect(Math.abs(left[key]! - right[key]!)).toBeLessThan(.02);
  }
});

test("道具动作逐帧有限、首尾连续且支持乱序采样", () => {
  const timeline = createPropsTimeline();
  let maxArm = 0, maxPropAngle = 0;
  for (let frame = 0; frame <= 1800; frame++) {
    const pose = timeline.sample(frame / 60);
    expect(Object.values(pose).every(Number.isFinite)).toBe(true);
    maxArm = Math.max(maxArm, pose.ArmL!, pose.ArmR!);
    maxPropAngle = Math.max(maxPropAngle, Math.abs(pose.PropAngle!));
  }
  expect(maxArm).toBeLessThanOrEqual(.65);
  expect(maxPropAngle).toBeLessThanOrEqual(10);
  const first = timeline.sample(0), last = timeline.sample(propsShowcaseDuration);
  for (const key of Object.keys(first)) expect(Math.abs(first[key]! - last[key]!)).toBeLessThan(.0001);
  const samples = [0, .125, 1.5, 7.5, 16.5, 28.5, 30].map(t => [t, timeline.sample(t)] as const);
  for (const [t, expected] of samples.toReversed()) expect(timeline.sample(t)).toEqual(expected);
});
