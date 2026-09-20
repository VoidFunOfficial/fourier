import { loadFont, FourierMotion, motion, useFourierContext, type CSSProperties, type ReactNode, type FourierMotionTarget } from '@fourier-video/sdk';
import sf from '../assets/fonts/SF-Pro-subset.woff';
import heiti from '../assets/fonts/Heiti-subset.woff';
import { benAnalogJitterFrames } from './reused/AnalogFrameJitter.tsx';
import { C, EASE, FULL, enter } from './design.ts';
const SF=loadFont(sf,{weight:500});
const HEITI=loadFont(heiti,{weight:500});
export function Stage({ children, dark = false }: {
    children: ReactNode;
    dark?: boolean;
}) {
    const { width, height } = useFourierContext();
    return <FourierMotion><div style={{ position: 'relative', width, height, overflow: 'hidden', background: dark ? C.ink : C.paper, color: dark ? C.paper : C.ink, fontFamily: `${SF}, ${HEITI}, sans-serif`, fontWeight: 500 }}>
    <style>{`@font-face{font-family:FilmSF;src:url('${sf}');font-weight:100 900;font-display:block}@font-face{font-family:FilmHeiti;src:url('${heiti}');font-weight:100 900;font-display:block}*{box-sizing:border-box}`}</style>
    <div style={{ position: 'absolute', width: 1920, height: 1080, transform: `scale(${width / 1920},${height / 1080})`, transformOrigin: '0 0' }}>{children}</div>
  </div></FourierMotion>;
}
export function Rig({ children, frames, style }: {
    children: ReactNode;
    frames: readonly FourierMotionTarget[];
    style?: CSSProperties;
}) {
    return <motion.div animate={frames} transition={{ ease: EASE, fill: 'both' }} style={{ ...FULL, transformOrigin: '50% 50%', ...style }}>{children}</motion.div>;
}
export function Label({ children, x = 110, y = 130, size = 56, width = 1500, delay = .07, style = {} }: {
    children: ReactNode;
    x?: number;
    y?: number;
    size?: number;
    width?: number;
    delay?: number;
    style?: CSSProperties;
}) {
    return <motion.div animate={enter(delay)} transition={{ ease: EASE, fill: 'both' }} style={{ position: 'absolute', left: x, top: y, width, fontSize: size, lineHeight: 1.12, letterSpacing: '-.045em', ...style }}>{children}</motion.div>;
}
export function Fine({ children, dark = false }: {
    children: ReactNode;
    dark?: boolean;
}) {
    return <div style={{ position: 'absolute', left: 110, right: 110, bottom: 48, fontSize: 21, lineHeight: 1.4, fontWeight: 400, color: dark ? '#aaaab0' : C.gray }}>{children}</div>;
}
export function Ink({ children, style }: {
    children: ReactNode;
    style?: CSSProperties;
}) {
    return <motion.div animate={benAnalogJitterFrames()} transition={{ ease: 'linear', fill: 'both' }} style={{ ...FULL, ...style }}>{children}</motion.div>;
}
export function Draw({ d, delay = 0, duration = .32, width = 3, color = C.ink }: {
    d: string;
    delay?: number;
    duration?: number;
    width?: number;
    color?: string;
}) {
    return <motion.path d={d} pathLength={1} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" animate={[{ strokeDashoffset: 1, easing: "cubic-bezier(.22,1,.36,1)", offset: 0 }, { strokeDashoffset: 1, easing: "cubic-bezier(.22,1,.36,1)", offset: delay }, { strokeDashoffset: 0, easing: "cubic-bezier(.22,1,.36,1)", offset: Math.min(.98, delay + duration) }, { strokeDashoffset: 0, easing: "cubic-bezier(.22,1,.36,1)", offset: 1 }]} transition={{ ease: EASE, fill: 'both' }} style={{ strokeDasharray: 1 }}/>;
}
export function Logo({ size = 100, color = C.ink }: {
    size?: number;
    color?: string;
}) { return <span style={{ fontFamily: SF, fontWeight: 400, fontSize: size, lineHeight: 1, color }}>{'\uf8ff'}</span>; }
export function CenterSquare({ dark = false, frames }: {
    dark?: boolean;
    frames: readonly FourierMotionTarget[];
}) {
    return <motion.div animate={frames} transition={{ ease: EASE, fill: 'both' }} style={{ position: 'absolute', width: 600, height: 600, left: 660, top: 240, borderRadius: 90, background: dark ? C.ink : C.paper }}/>;
}
