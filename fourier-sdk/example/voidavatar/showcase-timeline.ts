import { compileAvatarTimeline, type AvatarAction, type AvatarTimeline } from "@fourier-video/sdk/avatar";
import { createVoidavatarTimeline } from "./natural-timeline.ts";
import { voidavatarDemoRig } from "./demo-rig.ts";
import { voidavatarGestureMotions } from "./gestures.ts";
import { voidavatarExpressionNames, voidavatarExpressions, type VoidavatarExpressionName } from "./expressions.ts";

export const showcaseDuration = 84;
const smooth = (n: number) => { const t = Math.max(0, Math.min(1, n)); return t * t * (3 - 2 * t); };
const gestureNames = ["nod", "shakeHead", "wave", "point", "thinking", "explain", "emphasize", "lookAt"] as const;
const gestures: readonly AvatarAction[] = [
  ...gestureNames.map((action, i) => ({ at: 39.65 + i * 2, action, duration: 1.65,
    ...(action === "point" ? { target: "right" } : action === "lookAt" ? { target: "left" } : {}) })),
  ...(["doubleWave", "thankYou", "cheer", "shy"] as const).map((name, i) => ({ at: 55.65 + i * 3, action: "motion" as const, name, duration: 2.6 })),
  { at: 80.0, action: "wave", duration: 2.7 },
];
const expressionCues: readonly { at: number; name: VoidavatarExpressionName }[] = [
  { at: 0, name: "neutral" }, { at: 3, name: "happy" }, { at: 6, name: "confident" }, { at: 9, name: "neutral" },
  ...voidavatarExpressionNames.map((name, i) => ({ at: 12 + i * 1.5, name })),
  { at: 31.5, name: "neutral" },
  ...(["confident", "neutral", "happy", "determined", "thinking", "neutral", "confident", "curious"] as const).map((name, i) => ({ at: 39.5 + i * 2, name })),
  { at: 55.5, name: "happy" }, { at: 58.5, name: "shy" }, { at: 61.5, name: "happy" }, { at: 64.5, name: "shy" },
  { at: 67.5, name: "neutral" }, { at: 79.5, name: "happy" }, { at: 81.5, name: "wink" }, { at: 83, name: "neutral" },
];
const cameras = [
  { at: 0, zoom: 1, x: 0, y: 0 }, { at: 10.8, zoom: 1, x: 0, y: 0 },
  { at: 12, zoom: 1.45, x: -403, y: -128.5 }, { at: 38.35, zoom: 1.45, x: -403, y: -128.5 },
  { at: 39.5, zoom: 1, x: 0, y: 0 }, { at: 67.4, zoom: 1, x: 0, y: 0 },
  { at: 68.5, zoom: 3.7, x: -3295, y: -2817.9 }, { at: 78.4, zoom: 3.7, x: -3295, y: -2817.9 },
  { at: 79.6, zoom: 1, x: 0, y: 0 }, { at: 84, zoom: 1, x: 0, y: 0 },
];
function cameraAt(t: number) {
  for (let i = 1; i < cameras.length; i++) {
    const a = cameras[i - 1]!, b = cameras[i]!;
    if (t <= b.at) {
      const w = smooth((t - a.at) / (b.at - a.at));
      return { DemoZoom: a.zoom + (b.zoom - a.zoom) * w, DemoX: a.x + (b.x - a.x) * w, DemoY: a.y + (b.y - a.y) * w };
    }
  }
  return { DemoZoom: 1, DemoX: 0, DemoY: 0 };
}
/** A text-free performance of every available gesture, all thirteen expressions and independent brows. */
export function createShowcaseTimeline(): AvatarTimeline {
  const idle = createVoidavatarTimeline({ duration: 12, expression: "neutral", lookAt: "camera", seed: 7 }, 1, 1.15);
  const actions = compileAvatarTimeline({ ...voidavatarDemoRig, motions: voidavatarGestureMotions, physics: [] }, { duration: showcaseDuration, idle: false, actions: gestures,
    targets: { right: [.75, -.1], left: [-.72, -.12] } });
  return { duration: showcaseDuration, sample(time) {
    const t = Math.max(0, Math.min(showcaseDuration, time));
    const pose: Record<string, number> = { ...idle.sample(t % 12) };
    let cueIndex = 0;
    for (let i = 1; i < expressionCues.length; i++) { if (expressionCues[i]!.at <= t) cueIndex = i; else break; }
    const cue = expressionCues[cueIndex]!, prior = expressionCues[Math.max(0, cueIndex - 1)]!;
    const next = voidavatarExpressions[cue.name].parameters, previous = voidavatarExpressions[prior.name].parameters;
    const expressionWeight = smooth((t - cue.at) / .32);
    for (const key of ["HeadYaw", "HeadPitch", "HeadRoll", "ExprGazeX", "ExprGazeY", "BrowL", "BrowR"]) {
      pose[key] = (pose[key] ?? 0) + (previous[key] ?? 0) + ((next[key] ?? 0) - (previous[key] ?? 0)) * expressionWeight;
    }
    pose.EyeArt = next.EyeArt!; pose.BrowArt = next.BrowArt!;
    const action = actions.sample(t);
    for (const key of ["HeadYaw", "HeadPitch", "HeadRoll", "BodyYaw", "BodyPitch", "BodyRoll", "BodyBounce", "BodySquash", "ArmL", "ArmR", "HandL", "HandR", "EyeX", "EyeY", "BrowL", "BrowR"]) pose[key] = (pose[key] ?? 0) + (action[key] ?? 0);
    for (const key of ["HeadYaw", "HeadPitch", "HeadRoll"]) pose[key] = Math.max(-.55, Math.min(.55, pose[key]!));
    if (t >= 31.5 && t < 39.5) {
      const phase = t - 31.5, segment = Math.floor(phase / 2), pulse = Math.sin((phase % 2) / 2 * Math.PI) ** 2;
      pose.EyeArt = 0; pose.BrowArt = 0; pose.EyeOpenL = 1; pose.EyeOpenR = 1;
      pose.BrowL = segment === 0 ? .8 * pulse : segment === 2 ? -.65 * pulse : 0;
      pose.BrowR = segment === 1 ? .8 * pulse : segment === 2 ? -.65 * pulse : 0;
      pose.BrowAngleL = segment === 3 ? .8 * pulse : 0;
      pose.BrowAngleR = segment === 3 ? -.8 * pulse : 0;
    }
    return { ...pose, ...cameraAt(t), DemoCatFocus: smooth((t - 67.5) / .75) * (1 - smooth((t - 78.6) / .7)) };
  } };
}
