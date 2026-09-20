// Frame boundaries are rounded from the 24 fps reference into the 60 fps master.
// The entry point uses only this scene order; all motion belongs to its own scene.
export const SHOTS = [
  {id:'01-orbit', frames:190, reference:[0,76], sample:1.0},
  {id:'02-edit', frames:305, reference:[76,198], sample:2.35},
  {id:'03-export', frames:165, reference:[198,264], sample:1.5},
  {id:'04-switch', frames:85, reference:[264,298], sample:.8},
  {id:'05-play', frames:133, reference:[298,351], sample:1.0},
  {id:'06-playstation', frames:60, reference:[351,375], sample:.5},
  {id:'07-work-play', frames:155, reference:[375,437], sample:1.4},
  {id:'08-credit', frames:50, reference:[437,457], sample:.5},
  {id:'09-this-video', frames:240, reference:null, sample:1.5},
] as const;
export const TOTAL_FRAMES = SHOTS.reduce((total,shot)=>total+shot.frames,0);
