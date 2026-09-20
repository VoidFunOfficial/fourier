import { motion } from '@fourier-video/sdk';
import { benCornerMorphFrames } from './reused/MorphingCornerTile.tsx';
import { C, EASE } from './design.ts';
import { OFFICIAL } from './OfficialAssets.ts';
// Original flat artwork, reused as the identical content across all display surfaces.
export function Artwork({ variant = 0, animated = true }: {
    variant?: number;
    animated?: boolean;
}) {
    const colors = [C.peach, C.mint, C.blue];
    const color = colors[variant % 3]!;
    return <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: color }}>
  <motion.div animate={animated ? benCornerMorphFrames() : [{ rotate: 0 }, { rotate: 0 }]} transition={{ ease: EASE, fill: 'both' }} style={{ position: 'absolute', left: '18%', top: '-15%', width: '72%', height: '130%', background: C.paper, borderRadius: '50%', transformOrigin: '50% 50%' }}/>
  <motion.div animate={[{ rotate: -20, x: -30, offset: 0 }, { rotate: 35, x: 20, offset: 1 }]} transition={{ ease: 'linear' }} style={{ position: 'absolute', width: '95%', height: '16%', left: '6%', top: '43%', borderRadius: 200, background: C.ink }}/>
  <div style={{ position: 'absolute', width: '26%', aspectRatio: '1', left: '18%', top: '18%', borderRadius: '50%', background: color }}/>
 </div>;
}
export function Monitor({ variant = 0, screen }: {
    variant?: number;
    screen?: string;
}) {
    if (screen) return <div style={{ position: 'relative', width: 650, height: 510 }}>
      <img src={OFFICIAL.display} alt="Apple Studio Display" style={{ position: 'absolute', inset: 0, width: 650, height: 510 }}/>
      <img src={screen} alt="Official creative workflow on Mac" style={{ position: 'absolute', left: 16.5, top: 16.5, width: 617, height: 347, objectFit: 'cover' }}/>
    </div>;
    return <div style={{ position: 'relative', width: 650, height: 480 }}>
  <div style={{ position: 'absolute', left: 280, top: 350, width: 88, height: 116, background: '#c6c7c9', clipPath: 'polygon(15% 0,85% 0,100% 100%,0 100%)' }}/>
  <div style={{ position: 'absolute', left: 196, top: 463, width: 250, height: 13, borderRadius: 12, background: '#bbbcc0' }}/>
  <div style={{ position: 'absolute', width: 650, height: 384, background: '#252527', borderRadius: 20, padding: 13, boxShadow: '0 22px 42px #0000000f' }}><div style={{ position: 'relative', height: '100%', overflow: 'hidden', borderRadius: 6 }}><Artwork variant={variant}/></div></div>
 </div>;
}
export function Phone({ variant = 0 }: {
    variant?: number;
}) {
    return <div style={{ position: 'relative', width: 252, height: 516, borderRadius: 48, padding: 12, background: C.ink, boxShadow: '0 20px 42px #00000016' }}>
  <div style={{ position: 'relative', height: '100%', borderRadius: 38, overflow: 'hidden' }}><Artwork variant={variant}/><div style={{ position: 'absolute', top: 10, left: 75, width: 80, height: 23, borderRadius: 15, background: C.ink }}/></div>
 </div>;
}
