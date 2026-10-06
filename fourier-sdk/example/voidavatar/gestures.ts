import type { AvatarAction, AvatarMotion, AvatarTrack } from "@fourier-video/sdk/avatar";

type GestureKey = readonly [phase: number, value: number];
const duration = 2.8;
function track(parameter: string, keys: readonly GestureKey[]): AvatarTrack {
  return Object.freeze({ parameter, blend: "add" as const,
    keys: Object.freeze(keys.map(([phase, value]) => Object.freeze({ t: phase * duration, value, easing: "smooth" as const }))),
  });
}
function gesture(tracks: readonly AvatarTrack[]): AvatarMotion {
  return Object.freeze({ duration, tracks: Object.freeze(tracks) });
}

/** Local motions use the public motion action contract; every additive channel returns to zero. */
export const voidavatarGestureMotions = Object.freeze({
  doubleWave: gesture([
    track("ArmL", [[0, 0], [.18, .52], [.35, .60], [.50, .52], [.65, .60], [.78, .52], [1, 0]]),
    track("ArmR", [[0, 0], [.22, .58], [.38, .52], [.53, .62], [.68, .52], [.81, .58], [1, 0]]),
    track("HandL", [[0, 0], [.20, -.30], [.35, .36], [.50, -.30], [.65, .36], [.80, -.18], [1, 0]]),
    track("HandR", [[0, 0], [.23, .36], [.38, -.30], [.53, .36], [.68, -.30], [.81, .18], [1, 0]]),
    track("HeadRoll", [[0, 0], [.25, -.06], [.65, .06], [1, 0]]),
    track("BodyRoll", [[0, 0], [.32, -.055], [.73, .055], [1, 0]]),
  ]),
  thankYou: gesture([
    track("ArmL", [[0, 0], [.20, .10], [.42, .17], [.63, .17], [1, 0]]),
    track("ArmR", [[0, 0], [.20, .10], [.42, .17], [.63, .17], [1, 0]]),
    track("HeadPitch", [[0, 0], [.18, .025], [.43, -.28], [.59, -.28], [.81, .045], [1, 0]]),
    track("BodyPitch", [[0, 0], [.24, 0], [.48, -.30], [.62, -.30], [.86, .035], [1, 0]]),
    track("BodySquash", [[0, 0], [.20, -.025], [.48, .18], [.62, .18], [.86, -.04], [1, 0]]),
    track("EyeY", [[0, 0], [.38, .18], [.64, .18], [1, 0]]),
  ]),
  cheer: gesture([
    track("ArmL", [[0, 0], [.16, .09], [.37, .76], [.48, .66], [.63, .74], [.78, .62], [1, 0]]),
    track("ArmR", [[0, 0], [.16, .09], [.39, .74], [.50, .64], [.65, .76], [.80, .60], [1, 0]]),
    track("HandL", [[0, 0], [.38, .12], [.52, -.08], [.67, .10], [1, 0]]),
    track("HandR", [[0, 0], [.40, -.12], [.54, .08], [.69, -.10], [1, 0]]),
    track("HeadPitch", [[0, 0], [.16, -.045], [.40, .10], [.66, .065], [1, 0]]),
    track("BodyBounce", [[0, 0], [.16, -.055], [.38, .22], [.53, -.035], [.66, .11], [1, 0]]),
    track("BodySquash", [[0, 0], [.16, .12], [.38, -.14], [.53, .10], [.66, -.06], [1, 0]]),
  ]),
  shy: gesture([
    track("ArmL", [[0, 0], [.28, .36], [.48, .40], [.74, .34], [1, 0]]),
    track("ArmR", [[0, 0], [.34, .06], [.72, .09], [1, 0]]),
    track("HandL", [[0, 0], [.30, -.12], [.55, .12], [.76, -.06], [1, 0]]),
    track("HeadRoll", [[0, 0], [.33, .16], [.70, .13], [1, 0]]),
    track("HeadYaw", [[0, 0], [.30, -.08], [.72, -.05], [1, 0]]),
    track("HeadPitch", [[0, 0], [.35, -.10], [.72, -.07], [1, 0]]),
    track("BodyRoll", [[0, 0], [.43, -.065], [.76, -.045], [1, 0]]),
    track("EyeX", [[0, 0], [.28, .24], [.66, .18], [1, 0]]),
  ]),
});
export type VoidavatarGestureName = keyof typeof voidavatarGestureMotions;

export const voidavatarActionDemoDuration = 28;
export const voidavatarActionDemoActions: readonly AvatarAction[] = Object.freeze(([
  { at: 3.8, action: "nod", duration: 2.7 },
  { at: 7.3, action: "wave", duration: 2.8 },
  { at: 10.8, action: "point", duration: 2.8, target: "marker" },
  { at: 14.3, action: "motion", name: "doubleWave", duration },
  { at: 17.8, action: "motion", name: "thankYou", duration },
  { at: 21.3, action: "motion", name: "cheer", duration },
  { at: 24.8, action: "motion", name: "shy", duration },
] satisfies AvatarAction[]).map(action => Object.freeze(action)));
export const voidavatarActionDemoChapters = Object.freeze([
  { start: 0, title: "眨眼 · 呼吸", english: "A little life.", detail: "轻轻眨眼，慢慢呼吸。" },
  { start: 3.5, title: "点头回应", english: "I hear you.", detail: "一点回应，让表达更自然。" },
  { start: 7, title: "挥手招呼", english: "Hello there.", detail: "袖子轻轻摇，和你打个招呼。" },
  { start: 10.5, title: "指向示意", english: "Look over here.", detail: "目光和动作，一起指向这里。" },
  { start: 14, title: "双手问好", english: "So glad to see you.", detail: "两只袖子，错开一点点节奏。" },
  { start: 17.5, title: "鞠躬致谢", english: "Thank you.", detail: "轻轻低头，再慢慢抬起。" },
  { start: 21, title: "举手欢呼", english: "We did it!", detail: "蓄力、举手，再轻轻回弹。" },
  { start: 24.5, title: "害羞歪头", english: "A little shy.", detail: "抬起小袖子，悄悄看向你。" },
].map(chapter => Object.freeze({ ...chapter, duration: 3.5 })));
