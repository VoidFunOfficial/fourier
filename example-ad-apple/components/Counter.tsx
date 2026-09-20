import { motion } from '@fourier-video/sdk';
import { EASE } from './design.ts';
export function Counter({ value, size = 240 }: {
    value: number;
    size?: number;
}) {
    const height = size * 1.14;
    return <div style={{ display: 'flex', fontSize: size, fontWeight: 600, lineHeight: `${height}px`, fontVariantNumeric: 'tabular-nums', letterSpacing: '-.06em', height, overflow: 'hidden' }}>
  {String(value).split('').map((digit, i) => { const stop = 20 + Number(digit); return <div key={i} style={{ width: size * .61, height, overflow: 'hidden' }}><motion.div animate={[{ y: 0, easing: "cubic-bezier(.22,1,.36,1)", offset: 0 }, { y: 0, easing: "cubic-bezier(.22,1,.36,1)", offset: i * .025 }, { y: -stop * height, easing: "cubic-bezier(.22,1,.36,1)", offset: .42 + i * .025 }, { y: -stop * height, easing: "cubic-bezier(.22,1,.36,1)", offset: 1 }]} transition={{ ease: EASE, fill: 'both' }}>{Array.from({ length: stop + 1 }, (_, j) => <div key={j} style={{ height }}>{j % 10}</div>)}</motion.div></div>; })}
 </div>;
}
