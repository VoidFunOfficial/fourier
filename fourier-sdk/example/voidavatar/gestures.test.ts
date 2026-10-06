import { expect, test } from "bun:test";
import { compileAvatarTimeline, defineAvatar, sampleAvatarCurve } from "@fourier-video/sdk/avatar";
import { voidavatarDemoRig } from "./demo-rig.ts";
import { createVoidavatarTimeline } from "./natural-timeline.ts";
import { voidavatarActionDemoActions, voidavatarActionDemoChapters, voidavatarActionDemoDuration, voidavatarGestureMotions } from "./gestures.ts";

const model = defineAvatar({ ...voidavatarDemoRig, physics: [], motions: voidavatarGestureMotions });

test("四个新动作使用公开 motion 合同，保留已有眼睛与猫咪通道", () => {
  expect(Object.keys(voidavatarGestureMotions)).toEqual(["doubleWave", "thankYou", "cheer", "shy"]);
  for (const [name, motion] of Object.entries(voidavatarGestureMotions)) {
    const timeline = compileAvatarTimeline(model, { duration: 4, idle: false, actions: [{ at: .2, action: "motion", name, duration: motion.duration }] });
    const rest = timeline.sample(0);
    let finite = true, maxArm = 0, minArm = 0, maxStep = 0, preservedArt = true;
    let previous = timeline.sample(.2);
    for (let frame = 0; frame <= 180; frame++) {
      const pose = timeline.sample(.2 + frame / 60);
      finite &&= Object.values(pose).every(Number.isFinite);
      maxArm = Math.max(maxArm, pose.ArmL!, pose.ArmR!);
      minArm = Math.min(minArm, pose.ArmL!, pose.ArmR!);
      for (const key of ["ArmL", "ArmR", "HandL", "HandR", "HeadPitch", "HeadRoll", "BodySquash"]) maxStep = Math.max(maxStep, Math.abs(pose[key]! - previous[key]!));
      for (const key of Object.keys(rest).filter(key => key.startsWith("Cat") || key.includes("Art") || key.startsWith("EyeOpen"))) preservedArt &&= pose[key] === rest[key];
      previous = pose;
    }
    expect(finite).toBe(true);
    expect(preservedArt).toBe(true);
    expect(minArm).toBe(0);
    expect(maxArm).toBeLessThanOrEqual(.76);
    expect(maxArm).toBeGreaterThan(.15);
    expect(maxStep).toBeLessThan(.06);
    for (const track of motion.tracks) {
      expect(track.blend).toBe("add");
      expect(sampleAvatarCurve(track.keys, 0)).toBe(0);
      expect(sampleAvatarCurve(track.keys, motion.duration)).toBe(0);
      expect(Math.abs(sampleAvatarCurve(track.keys, .0001))).toBeLessThan(.000001);
      expect(Math.abs(sampleAvatarCurve(track.keys, motion.duration - .0001))).toBeLessThan(.000001);
    }
    expect(timeline.sample(3.1)).toEqual(rest);
  }
});

test("问好、鞠躬、欢呼和害羞具有不同的动作重心", () => {
  const make = (name: keyof typeof voidavatarGestureMotions) => compileAvatarTimeline(model, {
    duration: 4, idle: false, actions: [{ at: 0, action: "motion", name }],
  });
  const greeting = make("doubleWave"), bow = make("thankYou"), cheer = make("cheer"), shy = make("shy");
  expect(greeting.sample(1).ArmL).toBeGreaterThan(.55);
  expect(greeting.sample(1).ArmR).toBeGreaterThan(.5);
  expect(greeting.sample(.98).HandL! * greeting.sample(.56).HandL!).toBeLessThan(0);
  expect(bow.sample(1.4).HeadPitch).toBeLessThan(-.27);
  expect(bow.sample(1.4).BodyPitch).toBeLessThan(-.29);
  expect(bow.sample(1.4).BodySquash).toBeGreaterThan(.17);
  expect(cheer.sample(1.04).ArmL).toBeGreaterThan(.75);
  expect(cheer.sample(1.06).BodyBounce).toBeGreaterThan(.21);
  expect(cheer.sample(.45).BodySquash).toBeGreaterThan(.11);
  expect(shy.sample(1.3).ArmL! - shy.sample(1.3).ArmR!).toBeGreaterThan(.28);
  expect(shy.sample(1.3).HeadRoll).toBeGreaterThan(.14);
  expect(shy.sample(1.3).EyeX).toBeGreaterThan(.2);
});

test("28 秒演示覆盖八个章节，动作都完整落在对应章节内", () => {
  expect(voidavatarActionDemoChapters).toHaveLength(8);
  expect(voidavatarActionDemoActions).toHaveLength(7);
  expect(voidavatarActionDemoChapters.at(-1)!.start + voidavatarActionDemoChapters.at(-1)!.duration).toBe(voidavatarActionDemoDuration);
  voidavatarActionDemoActions.forEach((action, i) => {
    const chapter = voidavatarActionDemoChapters[i + 1]!;
    expect(action.at).toBeGreaterThan(chapter.start);
    expect(action.at + action.duration!).toBeLessThan(chapter.start + chapter.duration);
  });
  const timeline = compileAvatarTimeline(model, { duration: voidavatarActionDemoDuration, idle: false,
    actions: voidavatarActionDemoActions, targets: { marker: [.7, -.12] } });
  const samples = [0, 4.4, 8.5, 12, 15.4, 19.2, 22.4, 26, 28].map(time => [time, timeline.sample(time)] as const);
  for (const [time, expected] of samples.toReversed()) expect(timeline.sample(time)).toEqual(expected);
});

test("新动作叠加自然待机后仍保持循环连续和乱序采样一致", () => {
  const timeline = createVoidavatarTimeline({ duration: voidavatarActionDemoDuration, expression: "neutral", lookAt: "camera",
    actions: voidavatarActionDemoActions, targets: { marker: [.7, -.12] } });
  const first = timeline.sample(0), end = timeline.sample(voidavatarActionDemoDuration);
  expect(Math.max(...Object.keys(first).map(key => Math.abs(first[key]! - end[key]!)))).toBeLessThan(.0001);
  let maxArm = 0, maxHead = 0, finite = true;
  for (let frame = 0; frame <= voidavatarActionDemoDuration * 60; frame++) {
    const pose = timeline.sample(frame / 60);
    finite &&= Object.values(pose).every(Number.isFinite);
    maxArm = Math.max(maxArm, pose.ArmL!, pose.ArmR!);
    maxHead = Math.max(maxHead, Math.abs(pose.HeadYaw!), Math.abs(pose.HeadPitch!), Math.abs(pose.HeadRoll!));
  }
  expect(finite).toBe(true);
  expect(maxArm).toBeLessThanOrEqual(.85);
  expect(maxHead).toBeLessThan(.56);
  const samples = [15.2, 19.2, 22.4, 26].map(time => [time, timeline.sample(time)] as const);
  for (const [time, expected] of samples.toReversed()) expect(timeline.sample(time)).toEqual(expected);
});
