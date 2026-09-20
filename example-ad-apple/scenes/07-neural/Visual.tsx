import { defineReact, motion } from '@fourier-video/sdk';
import { Stage, Label, Draw, Rig } from '../../components/Stage.tsx';
import { C, EASE } from '../../components/design.ts';
function Neural() {
    return <Stage>
 <Rig frames={[{ scale: 1.5, rotate: -12, opacity: 0, easing: "cubic-bezier(.22,1,.36,1)", offset: 0 }, { scale: 1, rotate: 0, opacity: 1, easing: "cubic-bezier(.22,1,.36,1)", offset: .19 }, { scale: 1, rotate: 0, opacity: 1, easing: "cubic-bezier(.7,0,.9,.3)", offset: .82 }, { scale: .25, rotate: 90, opacity: 0, easing: "cubic-bezier(.22,1,.36,1)", offset: 1 }]}>
  {[0, 1].map(side => <div key={side} style={{ position: 'absolute', left: 310 + side * 760, top: 214, width: 520, height: 520 }}>
   <svg width="520" height="520" style={{ position: 'absolute', inset: 0 }}>{Array.from({ length: 4 }, (_, i) => <g key={i}><Draw d={`M 57 ${57 + i * 135} L 462 ${57 + i * 135}`} delay={.06 + i * .025} width={3} color="#b8bac0"/><Draw d={`M ${57 + i * 135} 57 L ${57 + i * 135} 462`} delay={.1 + i * .025} width={3} color="#b8bac0"/></g>)}</svg>
   {Array.from({ length: 16 }, (_, i) => <motion.div key={i} animate={[{ scale: 0, rotate: 90, easing: "cubic-bezier(.22,1,.36,1)", offset: 0 }, { scale: 0, rotate: 90, easing: "cubic-bezier(.22,1,.36,1)", offset: .025 * i }, { scale: 1.05, rotate: 0, easing: "cubic-bezier(.22,1,.36,1)", offset: .025 * i + .12 }, { scale: 1, rotate: 0, easing: "cubic-bezier(.22,1,.36,1)", offset: .62 }, { scale: 1, rotate: 0, easing: "cubic-bezier(.22,1,.36,1)", offset: 1 }]} transition={{ ease: EASE, fill: 'both' }} style={{ position: 'absolute', left: i % 4 * 135, top: Math.floor(i / 4) * 135, width: 114, height: 114, borderRadius: 28, background: side === 0 ? C.ink : C.silver, boxShadow: side === 0 ? 'inset 0 1px 0 #5c5c61' : 'inset 0 1px 0 white' }}/>)}
   <Label x={0} y={560} width={520} size={56} delay={.28} style={{ textAlign: 'center' }}>16 核</Label>
  </div>)}
  <svg width="1920" height="1080"><Draw d="M 863 475 C 960 370 955 635 1057 535 M 863 525 C 960 630 955 365 1057 465" delay={.3} duration={.26} width={4}/></svg>
  <Label x={585} y={906} width={750} size={62} delay={.32} style={{ textAlign: 'center' }}>Neural Engine</Label>
 </Rig>
    </Stage>;
}
export default defineReact({ name: 'MacMiniNeural', schema: {}, component: Neural, designPreview: () => ({ props: {}, composition: { width: 1920, height: 1080, durationSeconds: 4 } }) });
