import type { AvatarTimeline, AvatarTimelineOptions } from "@fourier-video/sdk/avatar";
import { createVoidavatarTimeline } from "./natural-timeline.ts";
import { voidavatarExpressionNames, type VoidavatarExpressionName } from "./expressions.ts";
import { voidavatarHandPropNames, type VoidavatarHandPropName } from "./hand-prop-ids.ts";

/** Character-level controls. Artwork indices and grip compensation stay private. */
export interface VoidAnimationOptions extends Pick<AvatarTimelineOptions, "seed" | "lookAt" | "targets" | "actions"> {
  readonly duration?: number;
  readonly expression?: VoidavatarExpressionName;
  readonly motion?: { readonly amount?: number; readonly catAmount?: number };
  readonly hands?: {
    readonly left?: VoidavatarHandPropName;
    readonly right?: VoidavatarHandPropName;
    readonly scale?: number;
    readonly angle?: number;
  };
  readonly brows?: {
    readonly expression?: "follow" | VoidavatarExpressionName;
    readonly lift?: readonly [left: number, right: number];
    readonly tilt?: readonly [left: number, right: number];
  };
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
function number(value: number, min: number, max: number, name: string): number {
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${name} 必须在 ${min}–${max} 之间`);
  return value;
}
function index<T extends string>(names: readonly T[], value: T, name: string): number {
  const result = names.indexOf(value);
  if (result < 0) throw new Error(`${name} 无效: ${value}`);
  return result;
}

/** Bakes once, then samples deterministically in any order using host seconds. */
export function createVoidTimeline(options: VoidAnimationOptions = {}): AvatarTimeline {
  const { duration = 12, expression = "confident", seed = 7, lookAt = "camera", targets, actions, motion, hands, brows } = options;
  index(voidavatarExpressionNames, expression, "expression");
  const left = index(voidavatarHandPropNames, hands?.left ?? "none", "hands.left");
  const right = index(voidavatarHandPropNames, hands?.right ?? "none", "hands.right");
  const scale = number(hands?.scale ?? 1, .65, 1.35, "hands.scale");
  const angle = number(hands?.angle ?? 0, -30, 30, "hands.angle");
  const lift = [0, 1].map(i => number(brows?.lift?.[i] ?? 0, -1, 1, `brows.lift[${i}]`));
  const tilt = [0, 1].map(i => number(brows?.tilt?.[i] ?? 0, -1, 1, `brows.tilt[${i}]`));
  const brow = brows?.expression === undefined || brows.expression === "follow" ? undefined
    : index(voidavatarExpressionNames, brows.expression, "brows.expression");
  const base = createVoidavatarTimeline({ duration, expression, seed, lookAt,
    ...(targets === undefined ? {} : { targets }), ...(actions === undefined ? {} : { actions }) },
    number(motion?.amount ?? 1, 0, 1.5, "motion.amount"), number(motion?.catAmount ?? 1, 0, 1.5, "motion.catAmount"));
  return Object.freeze({ duration: base.duration, sample(time: number) {
    const pose = base.sample(time);
    return { ...pose,
      HandPropL: left, HandPropR: right, PropScale: scale, PropAngle: angle,
      ArmL: left === 0 ? (pose.ArmL ?? 0) : clamp(.43 + (pose.ArmL ?? 0) * .55, 0, .88),
      ArmR: right === 0 ? (pose.ArmR ?? 0) : clamp(.43 + (pose.ArmR ?? 0) * .55, 0, .88),
      BrowArt: brow ?? pose.BrowArt ?? 0,
      BrowL: clamp((pose.BrowL ?? 0) + lift[0]!, -1, 1),
      BrowR: clamp((pose.BrowR ?? 0) + lift[1]!, -1, 1),
      BrowAngleL: tilt[0]!, BrowAngleR: tilt[1]!,
    };
  } });
}
