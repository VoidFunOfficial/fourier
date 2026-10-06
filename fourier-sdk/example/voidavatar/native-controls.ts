import type { AvatarParameters, AvatarTimeline, CubismParameterBinding } from "@fourier-video/sdk/avatar";
import { voidavatarNativeHeadMap } from "./native-head.ts";

/** Fourier timeline channels drive the exported native keyforms; no physics3 evaluator. */
export const voidavatarNativeParameterMap: Readonly<Record<string, CubismParameterBinding | null>> = Object.freeze({
  ...voidavatarNativeHeadMap,
  EyeOpenL: { id: "ParamEyeLOpen" }, EyeOpenR: { id: "ParamEyeROpen" },
  BrowL: { id: "ParamBrowLY" }, BrowR: { id: "ParamBrowRY" },
  EyeArt: { id: "ParamEyeStyle" },
  NativeBrowStyleL: { id: "ParamBrowLStyle" }, NativeBrowStyleR: { id: "ParamBrowRStyle" },
  Breath: { id: "ParamBreath" },
  // These body/cat/sleeve controls require the next native export; v2 lacks the
  // new IDs and authored forms. Rotation signs are already handled in Cubism.
  BodyYaw: { id: "ParamBodyAngleX", scale: 10 }, BodyPitch: { id: "ParamBodyAngleY", scale: 10 },
  BodyRoll: { id: "ParamBodyAngleZ", scale: 10 },
  BodyBounce: { id: "ParamBodyBounce" }, BodySquash: { id: "ParamBodySquash" },
  ArmL: { id: "ParamArmL" }, ArmR: { id: "ParamArmR" },
  HandL: { id: "ParamHandL" }, HandR: { id: "ParamHandR" }, SleeveFollow: { id: "ParamSleeveFollow" },
  CatBreath: { id: "ParamCatBreath" }, CatBounce: { id: "ParamCatBounce" }, CatSquash: { id: "ParamCatSquash" },
  CatHeadTurn: { id: "ParamCatHeadTurn" }, CatHeadTilt: { id: "ParamCatHeadTilt" },
  CatTailSwing: { id: "ParamCatTailSwing" }, CatTailCurl: { id: "ParamCatTailCurl" },
  CatEarL: { id: "ParamCatEarL" }, CatEarR: { id: "ParamCatEarR" },
  CatEyeOpenL: { id: "ParamCatEyeLOpen" }, CatEyeOpenR: { id: "ParamCatEyeROpen" },
  NativeHairFront: { id: "ParamHairFront" }, NativeHairBack: { id: "ParamHairBack" },
  NativeHairSideL: { id: "ParamHairSideL" }, NativeHairSideR: { id: "ParamHairSideR" },
  NativeHairAhoge: { id: "ParamHairAhoge" },
  NativeHairFlyawayL: { id: "ParamHairFlyawayL" }, NativeHairFlyawayR: { id: "ParamHairFlyawayR" },
  NativeHairShineL: { id: "ParamHairShineL" }, NativeHairShineR: { id: "ParamHairShineR" },
});

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
function channel(pose: AvatarParameters, key: string, min = -1, max = 1): number {
  const value = pose[key] ?? 0;
  if (!Number.isFinite(value)) throw new Error(`voidavatar native: ${key} 必须为有限数字`);
  return clamp(value, min, max);
}

/** Reuses one absolute-time sample, including its existing baked spring response. */
export function createNativeSourceTimeline(timeline: AvatarTimeline): AvatarTimeline {
  return Object.freeze({ duration: timeline.duration, sample(time: number): AvatarParameters {
    const pose = timeline.sample(time);
    const front = channel(pose, "HairFront"), back = channel(pose, "HairBack"), side = channel(pose, "HairSide");
    const sway = channel(pose, "HairSway"), fan = channel(pose, "HairFan", 0), curl = channel(pose, "HairCurl");
    const browStyle = Math.round(channel(pose, "BrowArt", 0, 12));
    return { ...pose,
      EyeArt: Math.round(channel(pose, "EyeArt", 0, 12)),
      NativeBrowStyleL: pose.NativeBrowStyleL === undefined ? browStyle : Math.round(channel(pose, "NativeBrowStyleL", 0, 12)),
      NativeBrowStyleR: pose.NativeBrowStyleR === undefined ? browStyle : Math.round(channel(pose, "NativeBrowStyleR", 0, 12)),
      NativeHairFront: clamp(.45 * front + .22 * sway + .08 * curl, -.55, .55),
      NativeHairBack: clamp(.45 * back + .20 * sway, -.55, .55),
      NativeHairSideL: clamp(.45 * side + .20 * sway - .10 * fan + .06 * curl, -.60, .60),
      NativeHairSideR: clamp(.45 * side + .20 * sway + .10 * fan - .06 * curl, -.60, .60),
      NativeHairAhoge: clamp(.48 * front + .22 * sway + .10 * curl, -.60, .60),
      // These details already inherit front/side movement from their native parents.
      NativeHairFlyawayL: clamp(.10 * front + .12 * sway + .05 * curl, -.25, .25),
      NativeHairFlyawayR: clamp(.10 * side + .11 * sway - .05 * curl, -.25, .25),
      NativeHairShineL: clamp(.08 * front + .06 * sway, -.15, .15),
      NativeHairShineR: clamp(.08 * side + .06 * sway, -.15, .15),
    };
  } });
}
