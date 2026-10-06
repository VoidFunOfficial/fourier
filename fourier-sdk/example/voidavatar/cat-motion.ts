const tau = Math.PI * 2;
type CycleKeys = readonly (readonly [phase: number, value: number])[];

function curve(keys: CycleKeys, phase: number): number {
  const wrapped = phase - Math.floor(phase);
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1]!, b = keys[i]!;
    if (wrapped <= b[0]) {
      const t = (wrapped - a[0]) / (b[0] - a[0]);
      return a[1] + (b[1] - a[1]) * t * t * (3 - 2 * t);
    }
  }
  return keys.at(-1)![1];
}

// The cat notices the girl, holds a curious look, then turns back to the viewer.
// Negative turn is a glance toward the girl; the tilt pauses before release.
const turnKeys: CycleKeys = [[0, 0], [.10, 0], [.23, -.48], [.32, -.48], [.44, -.12], [.54, 0], [.65, .24], [.72, .24], [.85, -.12], [.96, 0], [1, 0]];
const tiltKeys: CycleKeys = [[0, 0], [.16, 0], [.27, .48], [.35, .48], [.46, -.10], [.56, 0], [.68, -.28], [.73, -.28], [.84, .10], [.95, 0], [1, 0]];

// Two unequal body lifts, with anticipation, a soft landing and a smaller rebound.
const bounceKeys: CycleKeys = [[0, 0], [.30, 0], [.335, -.08], [.38, .40], [.43, .02], [.455, -.07], [.49, .12], [.54, 0], [.71, 0], [.75, -.07], [.79, .30], [.825, .01], [.85, -.06], [.88, .08], [.93, 0], [1, 0]];
const squashKeys: CycleKeys = [[0, 0], [.30, 0], [.335, .32], [.38, -.25], [.43, -.02], [.455, .24], [.49, -.10], [.54, 0], [.71, 0], [.75, .24], [.79, -.19], [.825, 0], [.85, .18], [.88, -.06], [.93, 0], [1, 0]];

// Small delayed reactions share the girl's four-second beat without making the
// cat's breathing, glances, larger lifts or tail move in lockstep with her.
const reactionKeys: CycleKeys = [[0, 0], [.12, 0], [.19, -.16], [.27, .58], [.40, .02], [.47, -.10], [.57, .15], [.70, 0], [1, 0]];

// Broad swishes have unequal lengths and pauses; the tip reverses after the root.
const tailKeys: CycleKeys = [[0, 0], [.07, .16], [.18, .52], [.23, .52], [.35, -.44], [.42, -.44], [.52, .14], [.57, .14], [.66, .55], [.72, .28], [.80, -.48], [.87, -.48], [.97, 0], [1, 0]];
const curlKeys: CycleKeys = [[0, 0], [.10, .08], [.215, .38], [.28, .10], [.375, -.38], [.45, -.38], [.52, .18], [.56, -.28], [.59, .24], [.63, 0], [.70, .43], [.755, -.14], [.82, -.42], [.88, -.15], [.94, .18], [1, 0]];

// The nearer ear twitches first, then the other ear answers; quiet spans remain.
const earLKeys: CycleKeys = [[0, 0], [.115, 0], [.135, -.48], [.157, .14], [.19, 0], [.615, 0], [.635, -.34], [.66, .10], [.695, 0], [1, 0]];
const earRKeys: CycleKeys = [[0, 0], [.155, 0], [.178, -.38], [.20, .12], [.24, 0], [.80, 0], [.82, -.52], [.845, .16], [.88, 0], [1, 0]];

/** Absolute-time cat motion; every channel is intended for a replace-blend track. */
export function createCatMotionChannels(duration: number, intensity: number): Readonly<Record<string, (t: number) => number>> {
  if (!Number.isFinite(duration) || duration < 4 || duration > 1199) throw new Error("猫咪待机时长必须在 4–1199 秒内");
  if (!Number.isFinite(intensity)) throw new Error("猫咪待机幅度必须为有限数字");
  const amount = Math.max(0, Math.min(1.5, intensity));
  const phase = (t: number) => {
    if (!Number.isFinite(t)) throw new Error("猫咪采样时间必须为有限数字");
    return (t % duration + duration) % duration / duration;
  };
  const breaths = Math.max(1, Math.round(duration / 5));
  const girlBeats = Math.max(1, Math.round(duration / 4));
  const reaction = (p: number) => curve(reactionKeys, p * girlBeats - .07);
  const sample = (f: (p: number) => number) => (t: number) => amount === 0 ? 0 : amount * f(phase(t));
  return Object.freeze({
    CatBreath: sample(p => .30 * (1 - Math.cos(tau * breaths * p))),
    CatBounce: sample(p => curve(bounceKeys, p) + .09 * reaction(p)),
    CatSquash: sample(p => curve(squashKeys, p) - .035 * reaction(p)),
    CatHeadTurn: sample(p => curve(turnKeys, p)),
    CatHeadTilt: sample(p => curve(tiltKeys, p)),
    CatTailSwing: sample(p => curve(tailKeys, p)),
    CatTailCurl: sample(p => curve(curlKeys, p)),
    CatEarL: sample(p => curve(earLKeys, p)),
    CatEarR: sample(p => curve(earRKeys, p)),
  });
}
