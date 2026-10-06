import type { AvatarParameters, AvatarTimeline } from "@fourier-video/sdk/avatar";
import { createVoidavatarTimeline } from "./natural-timeline.ts";
import { voidavatarHandPropNames } from "./hand-prop-ids.ts";

const [, ...heldPropNames] = voidavatarHandPropNames;
export const voidavatarPropShowcaseOrder = Object.freeze(heldPropNames);
export type VoidavatarShowcaseProp = typeof voidavatarPropShowcaseOrder[number];
export const propsShowcaseDuration = 30;
export const propsShowcaseSegmentDuration = 3;
const tau = Math.PI * 2;
const smooth = (n: number): number => { const t = Math.max(0, Math.min(1, n)); return t * t * (3 - 2 * t); };

/** Small prop-specific gestures stay below the face and use the pinned sleeve joints. */
function propGesture(id: VoidavatarShowcaseProp, phase: number): AvatarParameters {
  const sway = Math.sin(tau * phase), beat = Math.sin(tau * phase * 3);
  switch (id) {
    case "magicWand": return { ArmR: .56 + .055 * sway, HandR: .22 * Math.sin(tau * phase * 2),
      HeadYaw: .055 * sway, HeadPitch: .025, BodyRoll: .025 * sway, PropAngle: 9 * sway };
    case "conductorBaton": return { ArmR: .56 + .045 * beat, HandR: .26 * beat,
      HeadPitch: .025 * beat, BodyBounce: .035 * beat, PropAngle: 10 * beat };
    case "microphone": return { ArmR: .61 + .022 * sway, HandR: .055 * sway,
      HeadPitch: .035, HeadRoll: -.035 * sway, BodyBounce: .04 * Math.sin(Math.PI * phase) ** 2, PropAngle: -3 };
    case "bouquet": return { ArmR: .48 + .018 * sway, HandR: -.045,
      HeadRoll: .10, HeadYaw: -.045, HeadPitch: -.055, BodyRoll: -.03, ExprGazeX: .12, PropAngle: 4 };
    case "heartSign": return { ArmR: .56 + .026 * sway, HandR: .045 * sway,
      HeadPitch: .055, HeadRoll: -.035, BodyBounce: .065 * Math.sin(Math.PI * phase) ** 2, PropAngle: 3 * sway };
    case "lollipop": return { ArmR: .49 + .022 * sway, HandR: .11 * sway,
      HeadRoll: -.07, HeadYaw: .035, BodyRoll: .025 * sway, PropAngle: 7 * sway };
    case "coffeeCup": return { ArmR: .49 + .012 * sway, HandR: .015 * sway,
      HeadPitch: -.035, HeadRoll: .025, BodyBounce: .015 * sway, PropAngle: 2 * sway };
    case "book": return { ArmR: .53 + .015 * sway, HandR: -.07,
      HeadPitch: -.06, HeadYaw: .025, ExprGazeY: .12, PropAngle: -4 };
    case "paintbrush": return { ArmR: .585 + .03 * sway, HandR: .19 * Math.sin(tau * phase * 2),
      HeadYaw: .045 * sway, HeadPitch: -.02, BodyRoll: .022 * sway, PropAngle: 10 * Math.sin(tau * phase * 2) };
    case "foldingFan": return { ArmL: .56 + .032 * sway, HandL: .17 * Math.sin(tau * phase * 4),
      HeadRoll: .055, HeadYaw: -.03, BodyRoll: -.02 * sway, PropAngle: 8 * Math.sin(tau * phase * 4) };
  }
}

/** Ten 3-second hand-held prop studies, with deterministic seeking and soft swaps.
 * Selecting one prop holds it for the complete 30 seconds; its small gesture repeats.
 */
export function createPropsTimeline(selection: "all" | VoidavatarShowcaseProp = "all"): AvatarTimeline {
  const selected = selection === "all" ? -1 : voidavatarPropShowcaseOrder.indexOf(selection);
  if (selection !== "all" && selected < 0) throw new Error("voidavatar 道具示例包含未知道具");
  const idle = createVoidavatarTimeline({ duration: propsShowcaseDuration, expression: "neutral", lookAt: "camera", seed: 7 }, .62, .85);
  return Object.freeze({ duration: propsShowcaseDuration, sample(time: number): AvatarParameters {
    if (!Number.isFinite(time)) throw new Error("voidavatar 道具示例时间必须为有限数字");
    const t = Math.max(0, Math.min(propsShowcaseDuration, time));
    const segment = Math.min(voidavatarPropShowcaseOrder.length - 1, Math.floor(t / propsShowcaseSegmentDuration));
    const index = selected < 0 ? segment : selected;
    const id = voidavatarPropShowcaseOrder[index]!;
    const local = t === propsShowcaseDuration ? propsShowcaseSegmentDuration : t % propsShowcaseSegmentDuration;
    const phase = local / propsShowcaseSegmentDuration;
    const fadeTime = selected < 0 ? local : t;
    const fadeDuration = selected < 0 ? propsShowcaseSegmentDuration : propsShowcaseDuration;
    const opacity = smooth(fadeTime / .25) * smooth((fadeDuration - fadeTime) / .25);
    const envelope = smooth(fadeTime / .38) * smooth((fadeDuration - fadeTime) / .38);
    const gesture = propGesture(id, phase);
    const pose: Record<string, number> = { ...idle.sample(t), HandPropL: 0, HandPropR: 0, PropScale: 1, PropAngle: 0, PropOpacity: opacity };
    for (const [channel, value] of Object.entries(gesture)) pose[channel] = (pose[channel] ?? 0) + value * envelope;
    if (opacity > 0) pose[id === "foldingFan" ? "HandPropL" : "HandPropR"] = index + 1;
    // The artwork can be swapped independently; shoulders use the same continuous arm field.
    pose.ArmL = Math.max(0, Math.min(.65, pose.ArmL ?? 0));
    pose.ArmR = Math.max(0, Math.min(.65, pose.ArmR ?? 0));
    return pose;
  } });
}
