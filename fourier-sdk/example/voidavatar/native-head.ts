import { CUBISM_PARAMETER_MAP, type CubismParameterBinding } from "@fourier-video/sdk/avatar";

/** Drive native head XYZ only; other MOC parameters retain their exported defaults. */
export const voidavatarNativeHeadMap: Readonly<Record<string, CubismParameterBinding | null>> = Object.freeze({
  ...Object.fromEntries(Object.keys(CUBISM_PARAMETER_MAP).map(parameter => [parameter, null])),
  BodyRoll: null, HairSide: null, SleeveFollow: null,
  BodyBounce: null, BodySquash: null, HairSway: null, HairFan: null, HairCurl: null,
  CatBreath: null, CatBounce: null, CatSquash: null, CatHeadTurn: null, CatHeadTilt: null,
  CatTailSwing: null, CatTailCurl: null, CatEarL: null, CatEarR: null,
  CatEyeOpenL: null, CatEyeOpenR: null,
  EyeArt: null, BrowArt: null, BrowAngleL: null, BrowAngleR: null,
  ExprGazeX: null, ExprGazeY: null,
  HeadYaw: { id: "ParamAngleX", scale: 30 },
  HeadPitch: { id: "ParamAngleY", scale: 30 },
  // The generated rotation parameter is distinct from the unbound ParamAngleZ.
  // Core's positive Z is counterclockwise in canvas pixels; the timeline's
  // positive roll is clockwise. Half range preserves the prior restrained motion.
  HeadRoll: { id: "Param_Angle_Rotation2", scale: -15 },
});
