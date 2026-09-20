// Reused from fourier-styles/sonduckfilm/grainy-matte-gradient/GrainyMatteGradient.tsx.
// Local snapshot keeps all render dependencies inside the ad-clone source root.
import type { FourierMotionTarget } from '@fourier-video/sdk';
export function sonduckMatteBlobFrames(index: number): readonly FourierMotionTarget[] {
  const direction = index % 2 === 0 ? 1 : -1;
  return [
    { x: -direction * 120, y: 54 - index * 24, scale: 0.94, offset: 0 },
    { x: direction * 150, y: -70 + index * 31, scale: 1.08, offset: 0.5 },
    { x: -direction * 120, y: 54 - index * 24, scale: 0.94, offset: 1 },
  ];
}
