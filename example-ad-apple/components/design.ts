import type { FourierMotionTarget } from '@fourier-video/sdk';
export const C = { paper: '#f5f5f7', white: '#ffffff', ink: '#1d1d1f', gray: '#86868b', silver: '#c9cbcf', pale: '#e8e8ed', peach: '#efb69c', mint: '#bdd2be', blue: '#b4c9dc' };
export const EASE = 'linear';
export const FULL = { position: 'absolute', inset: 0 } as const;
export const clamp = (n: number) => Math.max(0, Math.min(1, n));
export const smooth = (n: number) => { const p = clamp(n); return p * p * (3 - 2 * p); };
export const out = (n: number) => 1 - Math.pow(1 - clamp(n), 3);
export const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
export function enter(delay = 0, distance = 50): readonly FourierMotionTarget[] {
    return [
        { opacity: 0, y: distance, easing: "cubic-bezier(.22,1,.36,1)", offset: 0 }, { opacity: 0, y: distance, easing: "cubic-bezier(.22,1,.36,1)", offset: delay },
        { opacity: 1, y: 0, easing: "cubic-bezier(.22,1,.36,1)", offset: delay + .18 }, { opacity: 1, y: 0, easing: "cubic-bezier(.22,1,.36,1)", offset: 1 }
    ];
}
