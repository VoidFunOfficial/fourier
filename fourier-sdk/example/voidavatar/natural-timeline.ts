import { compileAvatarTimeline, defineAvatar, type AvatarTimeline, type AvatarTimelineOptions, type AvatarTrack } from "@fourier-video/sdk/avatar";
import { voidavatarDemoRig } from "./demo-rig.ts";
import { createCatMotionChannels } from "./cat-motion.ts";
import { createBlinkChannels } from "./blink-motion.ts";
import { voidavatarGestureMotions } from "./gestures.ts";

const tau = Math.PI * 2;
const smooth = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
type CycleKeys = readonly (readonly [phase: number, value: number])[];

function cycleCurve(keys: CycleKeys, phase: number): number {
  const time = phase - Math.floor(phase);
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1]!, b = keys[i]!;
    if (time <= b[0]) return a[1] + (b[1] - a[1]) * smooth((time - a[0]) / (b[0] - a[0]));
  }
  return keys.at(-1)![1];
}

// A small crouch leads the lift; landing compresses, then a lower rebound settles.
const bounceKeys: CycleKeys = [[0, 0], [.10, -.04], [.18, -.16], [.27, .58], [.40, .18], [.47, -.10], [.57, .22], [.69, -.035], [.82, 0], [1, 0]];
const squashKeys: CycleKeys = [[0, 0], [.11, .10], [.19, .38], [.265, -.32], [.37, -.08], [.46, .30], [.565, -.17], [.675, .085], [.79, 0], [1, 0]];

// Five coordinated hair poses: rest, sweep left, fan outward, sweep right, curl.
// Each channel arrives slightly later, so the silhouette does not change rigidly.
const hairSwayKeys: CycleKeys = [[0, 0], [.18, -.56], [.37, -.12], [.59, .58], [.79, .12], [1, 0]];
const hairFanKeys: CycleKeys = [[0, 0], [.18, .08], [.37, .48], [.59, .07], [.79, .15], [1, 0]];
const hairCurlKeys: CycleKeys = [[0, 0], [.18, -.18], [.37, -.38], [.59, .12], [.79, .50], [1, 0]];

/** Native head XYZ plus coordinated secondary motion, sampled from absolute time. */
export function createVoidavatarTimeline(options: Pick<AvatarTimelineOptions, "duration" | "seed" | "expression" | "lookAt" | "targets" | "actions">, intensity = 1, catIntensity = intensity): AvatarTimeline {
  const { duration } = options;
  if (!Number.isFinite(duration) || duration < 4 || duration > 1199) throw new Error("voidavatar 自然待机时长必须在 4–1199 秒内");
  if (!Number.isFinite(intensity)) throw new Error("voidavatar 待机幅度必须为有限数字");
  const amount = Math.max(0, Math.min(1.5, intensity));
  const sine = (t: number, cycles: number, phase = 0) => Math.sin(t / duration * tau * cycles + phase);
  const beats = Math.max(1, Math.round(duration / 4));
  const pulsePhase = (t: number) => t / duration * beats;
  const accent = (t: number) => .94 + .06 * sine(t, 1, .65);
  const bounce = (t: number) => cycleCurve(bounceKeys, pulsePhase(t)) * accent(t);
  const squash = (t: number) => cycleCurve(squashKeys, pulsePhase(t)) * accent(t);
  // A positive Huber gate joins with zero slope and no easing-slope overshoot.
  // Normalize its .58 lift peak back to .58 after the .06 transition offset.
  const positiveLift = (value: number) => value <= 0 ? 0 : (value < .12 ? value * value / .24 : value - .06) * (.58 / .52);
  const blinks = createBlinkChannels(duration);
  const channels: Readonly<Record<string, (time: number) => number>> = {
    // Eyes lead the head; the torso follows with a smaller, later response.
    EyeX: t => amount * (.22 * sine(t, 1, .58) + .055 * sine(t, 3, .2)),
    EyeY: t => amount * .16 * sine(t, 2, .85),
    HeadYaw: t => amount * (.30 * sine(t, 1, .12) + .05 * sine(t, 2, .7)),
    HeadPitch: t => amount * (.19 * sine(t, 2, .4) + .045 * sine(t, 3, .1) + .018 * bounce(t - .1)),
    HeadRoll: t => amount * (.18 * sine(t, 1, -.2) + .042 * sine(t, 3, .4)),
    BodyYaw: t => amount * (.17 * sine(t, 1, -.72) + .025 * sine(t, 2, -.2)),
    BodyPitch: t => amount * (.10 * sine(t, 2, -.24) + .018 * bounce(t - .08)),
    BodyRoll: t => amount * (.17 * sine(t, 1, -.82) + .025 * sine(t, 3, -.15)),
    BodyBounce: t => amount * bounce(t),
    BodySquash: t => amount * squash(t),
    HairSway: t => amount * (cycleCurve(hairSwayKeys, (t - .20) / duration) + .04 * sine(t, 3, .6)),
    HairFan: t => amount * (cycleCurve(hairFanKeys, (t - .32) / duration) + .065 * positiveLift(bounce(t - .24)) / .58),
    HairCurl: t => amount * (cycleCurve(hairCurlKeys, (t - .44) / duration) + .055 * squash(t - .28) / .38),
    // Breath already has a [0,1] domain; extra intensity comes from bounce/squash.
    Breath: t => Math.min(amount, 1) * .5 * (1 - Math.cos(t / duration * tau * beats)),
    ...createCatMotionChannels(duration, catIntensity),
    ...blinks,
    // Zero catAmount leaves the cat completely still, with both eyes open.
    ...(catIntensity <= 0 ? { CatEyeOpenL: () => 1, CatEyeOpenR: () => 1 } : {}),
  };
  const steps = Math.ceil(duration * 60);
  const tracks: AvatarTrack[] = Object.entries(channels).map(([parameter, sample]) => ({
    parameter,
    // Multiply natural eyelid motion by the selected expression opening.
    blend: parameter.startsWith("EyeOpen") ? "multiply" : ["Breath", "BodyBounce", "BodySquash", "HairSway", "HairFan", "HairCurl"].includes(parameter) || parameter.startsWith("Cat") ? "replace" : "add",
    keys: Array.from({ length: steps + 1 }, (_, i) => ({ t: i / steps * duration, value: sample(i / steps * duration) })),
  }));
  const model = defineAvatar({ ...voidavatarDemoRig, motions: { ...voidavatarGestureMotions, naturalIdle: { duration, loop: true, tracks } } });
  // Two complete periods warm the baked springs. Sampling the third period gives
  // the same pose after a backward seek and avoids a rest-to-motion pop at frame 0.
  const preroll = duration * 2;
  const bakedDuration = duration * 3 + 1 / 60;
  const actions = [0, 1, 2].flatMap(cycle => (options.actions ?? []).map(action => ({ ...action, at: action.at + cycle * duration })));
  const timeline = compileAvatarTimeline(model, {
    ...options, duration: bakedDuration, idle: false,
    actions: [{ at: 0, action: "motion", name: "naturalIdle", duration: bakedDuration, priority: -100 }, ...actions],
  });
  return Object.freeze({ duration, sample: (time: number) => timeline.sample(preroll + Math.max(0, Math.min(duration, time))) });
}
