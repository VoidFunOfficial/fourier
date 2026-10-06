import { expect, test } from "bun:test";
import { createCatMotionChannels } from "./cat-motion.ts";

test("猫咪通道首尾与一阶速度连续，正反向乱序采样一致", () => {
  for (const duration of [12, 16]) {
    const channels = createCatMotionChannels(duration, 1);
    expect(Object.isFrozen(channels)).toBe(true);
    for (const sample of Object.values(channels)) {
      expect(sample(duration)).toBe(sample(0));
      expect(sample(-duration)).toBe(sample(0));
      const h = .00001;
      const before = (sample(0) - sample(-h)) / h;
      const after = (sample(h) - sample(0)) / h;
      expect(Math.abs(before - after)).toBeLessThan(.0002);
      const earlier = sample(2.731);
      sample(duration - .01); sample(-2.5); sample(0);
      expect(sample(2.731)).toBe(earlier);
      expect(Math.abs(sample(2.731 + duration) - earlier)).toBeLessThan(1e-12);
    }
  }
});

test("零强度完全静止，最大强度线性放大且各通道保持有效范围", () => {
  for (const duration of [12, 16]) {
    const zero = createCatMotionChannels(duration, 0);
    const normal = createCatMotionChannels(duration, 1);
    const strong = createCatMotionChannels(duration, 1.5);
    for (const name of Object.keys(normal)) {
      const samples = Array.from({ length: duration * 120 + 1 }, (_, i) => i / 120);
      const values = samples.map(t => strong[name]!(t));
      expect(values.every(Number.isFinite)).toBe(true);
      expect(Math.max(...values)).toBeLessThan(1);
      expect(Math.min(...values)).toBeGreaterThanOrEqual(name === "CatBreath" ? 0 : -1);
      expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(.3);
      expect(Math.max(...samples.map(t => Math.abs(zero[name]!(t))))).toBe(0);
      expect(Math.max(...samples.map(t => Math.abs(strong[name]!(t) - 1.5 * normal[name]!(t))))).toBeLessThan(1e-12);
    }
  }
});

test("猫咪先注意女孩再歪头停留，耳朵分别响应而不是一起摆动", () => {
  const duration = 12;
  const channels = createCatMotionChannels(duration, 1);
  expect(channels.CatEarL!(duration * .135)).toBeLessThan(-.4);
  expect(channels.CatEarR!(duration * .135)).toBe(0);
  expect(channels.CatEarR!(duration * .178)).toBeLessThan(-.35);
  expect(channels.CatHeadTurn!(duration * .23)).toBeLessThan(-.4);
  expect(channels.CatHeadTilt!(duration * .23)).toBeLessThan(channels.CatHeadTilt!(duration * .30));
  expect(channels.CatHeadTurn!(duration * .28)).toBe(channels.CatHeadTurn!(duration * .30));
  expect(channels.CatHeadTilt!(duration * .28)).toBe(channels.CatHeadTilt!(duration * .34));
  expect(Math.abs(channels.CatHeadTurn!(duration * .54))).toBeLessThan(.001);
});

test("猫咪蓄力后抬身，落下压缩并逐渐回弹，第二次抬身更小", () => {
  for (const duration of [12, 16]) {
    const channels = createCatMotionChannels(duration, 1);
    const bounce = (p: number) => channels.CatBounce!(p * duration);
    const squash = (p: number) => channels.CatSquash!(p * duration);
    expect(bounce(.335)).toBeLessThan(-.02);
    expect(squash(.335)).toBeGreaterThan(.28);
    expect(bounce(.38)).toBeGreaterThan(.35);
    expect(squash(.38)).toBeLessThan(-.24);
    expect(bounce(.455)).toBeLessThan(-.015);
    expect(squash(.455)).toBeGreaterThan(.22);
    expect(bounce(.49)).toBeGreaterThan(.10);
    expect(bounce(.49)).toBeLessThan(bounce(.38) * .5);
    expect(squash(.49)).toBeLessThan(-.09);
    expect(bounce(.79)).toBeLessThan(bounce(.38));
    expect(Math.abs(bounce(.60))).toBeLessThan(.06);
  }
});

test("尾巴具有停顿和局部快甩，呼吸周期独立于女孩的四秒节奏", () => {
  for (const duration of [12, 16]) {
    const channels = createCatMotionChannels(duration, 1);
    const tail = channels.CatTailSwing!, curl = channels.CatTailCurl!;
    expect(tail(duration * .19)).toBe(tail(duration * .22));
    expect(Math.abs(tail(duration * .57) - tail(duration * .52))).toBeLessThan(.001);
    expect(curl(duration * .52)).toBeGreaterThan(.15);
    expect(curl(duration * .56)).toBeLessThan(-.25);
    expect(curl(duration * .59)).toBeGreaterThan(.20);
    const breathe = channels.CatBreath!;
    const cycles = duration === 12 ? 2 : 3;
    expect(breathe(duration / cycles / 2)).toBeCloseTo(.6, 10);
    expect(breathe(duration / cycles)).toBeCloseTo(0, 10);
    expect(breathe(4)).toBeGreaterThan(.25);
  }
});

test("非法时长和非有限幅度不进入动画采样", () => {
  expect(() => createCatMotionChannels(0, 1)).toThrow("时长");
  expect(() => createCatMotionChannels(Infinity, 1)).toThrow("时长");
  expect(() => createCatMotionChannels(12, NaN)).toThrow("幅度");
  expect(() => createCatMotionChannels(12, 1).CatBounce!(Infinity)).toThrow("采样时间");
});
