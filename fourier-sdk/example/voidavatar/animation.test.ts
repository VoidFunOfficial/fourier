import { expect, test } from "bun:test";
import { createVoidTimeline, type VoidAnimationOptions } from "./animation.ts";

test("公共动画默认十二秒、自信表情与空手，并可直接反复采样", () => {
  const timeline = createVoidTimeline();
  const explicit = createVoidTimeline({ duration: 12, expression: "confident", hands: { left: "none", right: "none" } });
  expect(timeline.duration).toBe(12);
  for (const time of [0, 1.4, 5.1, 8.8, 12]) {
    const pose = timeline.sample(time);
    expect(pose).toEqual(explicit.sample(time));
    expect(pose.HandPropL).toBe(0); expect(pose.HandPropR).toBe(0);
    expect(pose.EyeArt).toBe(pose.BrowArt);
    expect(Object.values(pose).every(Number.isFinite)).toBe(true);
  }
  const neutral = createVoidTimeline({ expression: "neutral" });
  expect(timeline.sample(0).EyeArt).not.toBe(neutral.sample(0).EyeArt);
  const first = timeline.sample(0), last = timeline.sample(12);
  for (const channel of Object.keys(first)) expect(last[channel]!).toBeCloseTo(first[channel]!, 12);
});

test("持物只抬起持物侧手臂，空手侧保留挥手和手腕动作", () => {
  const options: VoidAnimationOptions = { duration: 12, actions: [{ at: 2, action: "wave", duration: 3 }] };
  const empty = createVoidTimeline(options);
  const left = createVoidTimeline({ ...options, hands: { left: "magicWand" } });
  const right = createVoidTimeline({ ...options, hands: { right: "book", scale: 1.2, angle: -15 } });
  expect(left.sample(0).ArmL!).toBeGreaterThan(empty.sample(0).ArmL!);
  expect(right.sample(0).ArmR!).toBeGreaterThan(empty.sample(0).ArmR!);
  const waveArm: number[] = [], waveWrist: number[] = [], heldArm: number[] = [];
  for (const time of [0, 2.1, 2.6, 3, 3.5, 4, 4.6, 5.1, 8]) {
    const base = empty.sample(time), holdingLeft = left.sample(time), holdingRight = right.sample(time);
    expect(holdingLeft.HandPropL!).toBeGreaterThan(0); expect(holdingLeft.HandPropR).toBe(0);
    expect(holdingRight.HandPropL).toBe(0); expect(holdingRight.HandPropR!).toBeGreaterThan(0);
    expect(holdingLeft.ArmR).toBe(base.ArmR); expect(holdingLeft.HandR).toBe(base.HandR);
    expect(holdingRight.ArmL).toBe(base.ArmL); expect(holdingRight.HandL).toBe(base.HandL);
    expect(holdingRight.PropScale).toBe(1.2); expect(holdingRight.PropAngle).toBe(-15);
    for (const channel of ["HeadYaw", "HeadPitch", "HeadRoll", "BodyBounce", "BodySquash", "HairSway", "CatHeadTurn", "EyeArt", "EyeOpenL", "EyeOpenR"]) {
      expect(holdingLeft[channel]).toBe(base[channel]); expect(holdingRight[channel]).toBe(base[channel]);
    }
    waveArm.push(holdingLeft.ArmR!); waveWrist.push(holdingLeft.HandR!); heldArm.push(holdingRight.ArmR!);
  }
  expect(Math.max(...waveArm) - Math.min(...waveArm)).toBeGreaterThan(.5);
  expect(Math.max(...waveWrist) - Math.min(...waveWrist)).toBeGreaterThan(.2);
  expect(Math.max(...heldArm) - Math.min(...heldArm)).toBeGreaterThan(.15);
});

test("独立眉毛改变眉画稿、抬眉与倾角，保留原表情眼睛和头身动作", () => {
  const base = createVoidTimeline({ expression: "confident" });
  const following = createVoidTimeline({ expression: "confident", brows: { expression: "follow" } });
  const independent = createVoidTimeline({ expression: "confident", brows: { expression: "angry", lift: [.4, -.3], tilt: [.6, -.5] } });
  for (const time of [0, 1.38, 4.8, 7.31, 11.9]) {
    const normal = base.sample(time), adjusted = independent.sample(time);
    expect(following.sample(time)).toEqual(normal);
    expect(adjusted.BrowArt).not.toBe(normal.BrowArt);
    expect(adjusted.BrowL!).toBeGreaterThan(normal.BrowL!); expect(adjusted.BrowR!).toBeLessThan(normal.BrowR!);
    expect(adjusted.BrowAngleL).toBe(.6); expect(adjusted.BrowAngleR).toBe(-.5);
    for (const channel of ["EyeArt", "EyeOpenL", "EyeOpenR", "EyeX", "EyeY", "ExprGazeX", "ExprGazeY", "HeadYaw", "HeadPitch", "HeadRoll", "BodyRoll", "BodyBounce"]) {
      expect(adjusted[channel]).toBe(normal[channel]);
    }
  }
});

test("同一动画正向、倒放及乱序采样一致，越界时间落到两端", () => {
  const timeline = createVoidTimeline({ duration: 12, expression: "curious", motion: { amount: 1.3, catAmount: .7 },
    hands: { left: "coffeeCup", right: "conductorBaton" }, brows: { expression: "thinking", lift: [.2, -.1], tilt: [-.3, .4] },
    actions: [{ at: 3, action: "wave", duration: 2.8 }, { at: 7, action: "nod", duration: 2 }] });
  const times = [0, .1, 1.37, 3.4, 4.6, 7.7, 10.2, 11.99, 12];
  const expected = new Map(times.map(time => [time, timeline.sample(time)]));
  for (const time of [...times].reverse()) expect(timeline.sample(time)).toEqual(expected.get(time)!);
  for (const time of [7.7, .1, 12, 4.6, 0, 10.2, 3.4, 1.37]) expect(timeline.sample(time)).toEqual(expected.get(time)!);
  expect(timeline.sample(-1)).toEqual(expected.get(0)!);
  expect(timeline.sample(13)).toEqual(expected.get(12)!);
});

test("无效数值配置、未知道具或表情在创建时拒绝", () => {
  const invalid: readonly VoidAnimationOptions[] = [
    { duration: NaN }, { duration: Infinity }, { duration: 3.9 }, { duration: 1200 }, { seed: NaN }, { seed: Infinity },
    { motion: { amount: NaN } }, { motion: { amount: -.01 } }, { motion: { amount: 1.51 } },
    { motion: { catAmount: NaN } }, { motion: { catAmount: -.01 } }, { motion: { catAmount: 1.51 } },
    { hands: { scale: NaN } }, { hands: { scale: .64 } }, { hands: { scale: 1.36 } },
    { hands: { angle: NaN } }, { hands: { angle: -31 } }, { hands: { angle: 31 } },
    { brows: { lift: [NaN, 0] } }, { brows: { lift: [0, -1.01] } }, { brows: { lift: [1.01, 0] } },
    { brows: { tilt: [0, NaN] } }, { brows: { tilt: [-1.01, 0] } }, { brows: { tilt: [0, 1.01] } },
    { expression: "missing-expression" } as unknown as VoidAnimationOptions,
    { brows: { expression: "missing-brows" } } as unknown as VoidAnimationOptions,
    { hands: { left: "missing-prop" } } as unknown as VoidAnimationOptions,
    { hands: { right: "missing-prop" } } as unknown as VoidAnimationOptions,
  ];
  for (const config of invalid) expect(() => createVoidTimeline(config)).toThrow();
  const limits = createVoidTimeline({ duration: 4, motion: { amount: 0, catAmount: 1.5 }, hands: { scale: .65, angle: 30 },
    brows: { lift: [-1, 1], tilt: [1, -1] } });
  expect(Object.values(limits.sample(2)).every(Number.isFinite)).toBe(true);
});
