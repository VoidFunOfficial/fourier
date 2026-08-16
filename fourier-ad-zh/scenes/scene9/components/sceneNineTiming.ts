export const SCENE_NINE_MONTAGE_FRAMES = 110;
export const SCENE_NINE_MONTAGE_DURATION_SECONDS =
  SCENE_NINE_MONTAGE_FRAMES / 30;

/** Each interval is shorter than the last, so every Review swipe accelerates. */
export const SCENE_NINE_POSTER_CUT_SECONDS = Object.freeze([
  0,
  0.46,
  0.86,
  1.21,
  1.51,
  1.77,
  1.99,
  2.18,
  2.34,
  2.47,
] as const);
