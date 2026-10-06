import { expect, test } from "bun:test";
import { createVoidavatarTimeline } from "./natural-timeline.ts";
import { createBlinkEvents } from "./blink-motion.ts";

test("待机跨循环衔接，随动在乱序采样时保持一致", () => {
  for (const duration of [12, 16]) {
    const timeline = createVoidavatarTimeline({ duration, lookAt: "camera" });
    const first = timeline.sample(0), end = timeline.sample(duration);
    for (const parameter of Object.keys(first)) expect(Math.abs(first[parameter]! - end[parameter]!)).toBeLessThan(.0001);
    const earlier = timeline.sample(2.65);
    timeline.sample(duration - .1); timeline.sample(.1);
    expect(timeline.sample(2.65)).toEqual(earlier);
    const poses = Array.from({ length: duration + 1 }, (_, i) => timeline.sample(i));
    for (const parameter of ["HeadYaw", "HeadPitch", "HeadRoll", "BodyYaw", "BodyPitch", "BodyRoll", "BodyBounce", "BodySquash", "EyeX", "EyeY", "Breath", "HairSway", "HairFan", "HairCurl", "HairFront", "HairBack", "HairSide", "SleeveFollow"]) {
      const values = poses.map(pose => pose[parameter]!);
      expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(.01);
    }
  }
});

test("待机眨眼完整闭合并重新睁开，动作结束连续回到待机", () => {
  const idle = createVoidavatarTimeline({ duration: 16 });
  const firstBlink = createBlinkEvents(16).find(event => event.subject === "girl")!;
  const blink = Array.from({ length: 90 }, (_, i) => idle.sample(firstBlink.start + i / 120));
  expect(Math.min(...blink.map(pose => pose.EyeOpenL!))).toBeLessThan(.015);
  expect(blink.at(-1)!.EyeOpenL).toBe(1);
  const gesture = createVoidavatarTimeline({ duration: 16, actions: [{ at: 4.3, action: "nod", duration: 2.8 }] });
  expect(gesture.sample(5.6).HeadPitch).not.toBe(idle.sample(5.6).HeadPitch);
  expect(Math.abs(gesture.sample(7.1 - .00001).HeadPitch! - gesture.sample(7.1).HeadPitch!)).toBeLessThan(.0001);
  expect(gesture.sample(7.2).HeadPitch).toBe(idle.sample(7.2).HeadPitch);
});

test("身体先蓄力再上弹，落地压缩后有幅度较小的回弹", () => {
  const timeline = createVoidavatarTimeline({ duration: 12 });
  const crouch = timeline.sample(.74), lift = timeline.sample(1.08);
  const land = timeline.sample(1.88), rebound = timeline.sample(2.28), settle = timeline.sample(3.28);
  expect(crouch.BodyBounce).toBeLessThan(-.12);
  expect(crouch.BodySquash).toBeGreaterThan(.3);
  expect(lift.BodyBounce).toBeGreaterThan(.5);
  expect(lift.BodySquash).toBeLessThan(-.27);
  expect(land.BodyBounce).toBeLessThan(-.08);
  expect(land.BodySquash).toBeGreaterThan(.25);
  expect(rebound.BodyBounce).toBeGreaterThan(.16);
  expect(rebound.BodyBounce!).toBeLessThan(lift.BodyBounce! * .5);
  expect(rebound.BodySquash).toBeLessThan(-.12);
  expect(Math.abs(settle.BodyBounce!)).toBeLessThan(.001);
  expect(Math.abs(settle.BodySquash!)).toBeLessThan(.001);
});

test("五种发型姿态可区分，散开和卷曲不只是左右摆的复制", () => {
  for (const duration of [12, 16]) {
    const timeline = createVoidavatarTimeline({ duration });
    const poses = [0, .20, .39, .61, .82].map(fraction => timeline.sample(duration * fraction));
    expect(Math.abs(poses[0]!.HairSway!) + poses[0]!.HairFan! + Math.abs(poses[0]!.HairCurl!)).toBeLessThan(.11);
    expect(poses[1]!.HairSway).toBeLessThan(-.45);
    expect(poses[2]!.HairFan).toBeGreaterThan(.4);
    expect(poses[2]!.HairCurl).toBeLessThan(-.25);
    expect(poses[3]!.HairSway).toBeGreaterThan(.45);
    expect(poses[4]!.HairCurl).toBeGreaterThan(.4);
    for (let i = 0; i < poses.length; i++) for (let j = i + 1; j < poses.length; j++) {
      const separation = Math.max(...["HairSway", "HairFan", "HairCurl"].map(key => Math.abs(poses[i]![key]! - poses[j]![key]!)));
      expect(separation).toBeGreaterThan(.28);
    }
  }
});

test("零强度关闭新增变形，1.5 倍不截断通道，默认头转保持安全范围", () => {
  const channels = ["BodyBounce", "BodySquash", "HairSway", "HairFan", "HairCurl"];
  for (const duration of [12, 16]) {
    const zero = createVoidavatarTimeline({ duration }, 0);
    const normal = createVoidavatarTimeline({ duration, expression: "confident" });
    const strong = createVoidavatarTimeline({ duration, expression: "confident" }, 1.5);
    const neutralMax = Object.fromEntries(channels.map(key => [key, 0]));
    const strongMax = { ...neutralMax };
    let maxHead = 0, maxScaleError = 0;
    for (let frame = 0; frame <= duration * 60; frame++) {
      const a = zero.sample(frame / 60), b = normal.sample(frame / 60), c = strong.sample(frame / 60);
      for (const key of channels) {
        neutralMax[key] = Math.max(neutralMax[key]!, Math.abs(a[key]!));
        strongMax[key] = Math.max(strongMax[key]!, Math.abs(c[key]!));
        maxScaleError = Math.max(maxScaleError, Math.abs(c[key]! - 1.5 * b[key]!));
      }
      for (const key of ["HeadYaw", "HeadPitch", "HeadRoll"]) maxHead = Math.max(maxHead, Math.abs(b[key]!));
    }
    expect(Math.max(...Object.values(neutralMax))).toBe(0);
    expect(Math.max(...Object.values(strongMax))).toBeLessThan(1);
    expect(maxScaleError).toBeLessThan(.000001);
    expect(maxHead).toBeLessThan(.45);
    const start = strong.sample(0), end = strong.sample(duration);
    expect(Math.max(...Object.keys(start).map(key => Math.abs(start[key]! - end[key]!)))).toBeLessThan(.0001);
  }
});

test("猫咪幅度可单独关闭或调大，不改变人物和头发参数", () => {
  const stillCat = createVoidavatarTimeline({ duration: 12, expression: "confident" }, 1, 0);
  const livelyCat = createVoidavatarTimeline({ duration: 12, expression: "confident" }, 1, 1.5);
  let greatestCatChange = 0;
  for (let frame = 0; frame <= 720; frame += 30) {
    const a = stillCat.sample(frame / 60), b = livelyCat.sample(frame / 60);
    for (const key of Object.keys(a)) {
      if (key.startsWith("Cat")) {
        expect(a[key]).toBe(key.startsWith("CatEyeOpen") ? 1 : 0);
        if (!key.startsWith("CatEyeOpen")) greatestCatChange = Math.max(greatestCatChange, Math.abs(b[key]!));
      } else expect(a[key]).toBe(b[key]);
    }
  }
  expect(greatestCatChange).toBeGreaterThan(.5);
});
