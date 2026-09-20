import { defineReact, motion } from '@fourier-video/sdk';
import { Stage, Label, Rig, Draw } from '../../components/Stage.tsx';
import { C, EASE } from '../../components/design.ts';
function Memory() {
    return <Stage>
 <Rig frames={[{ scale: .85, opacity: 0, x: 0, easing: "cubic-bezier(.22,1,.36,1)", offset: 0 }, { scale: 1, opacity: 1, x: 0, easing: "cubic-bezier(.22,1,.36,1)", offset: .18 }, { scale: 1, opacity: 1, x: 0, easing: "cubic-bezier(.22,1,.36,1)", offset: .82 }, { scale: 1.6, opacity: 1, x: -570, easing: "cubic-bezier(.22,1,.36,1)", offset: 1 }]}>
  {Array.from({ length: 32 }, (_, i) => <motion.div key={i} animate={[{ x: (i % 4 - 1.5) * 240, y: Math.floor(i / 4) * 40 - 200, rotate: i % 2 ? 25 : -25, opacity: 0, scaleX: 1, easing: "cubic-bezier(.22,1,.36,1)", offset: 0 }, { x: 0, y: 0, rotate: 0, opacity: 1, scaleX: 1, easing: "cubic-bezier(.22,1,.36,1)", offset: .19 + i * .008 }, { x: 0, y: 0, rotate: 0, opacity: 1, scaleX: 1, easing: "cubic-bezier(.7,0,.9,.3)", offset: .82 }, { x: 900, y: 0, rotate: 0, opacity: 0, scaleX: 5, easing: "cubic-bezier(.22,1,.36,1)", offset: 1 }]} transition={{ ease: EASE, fill: 'both' }} style={{ position: 'absolute', left: 1055, top: 264 + i * 15, width: 590, height: 38, borderRadius: 13, background: i === 31 ? C.ink : i % 5 === 0 ? '#e6e6ea' : '#c9cacf', boxShadow: 'inset 0 1px 0 #ffffff', transform: 'skewY(-10deg)' }}/>)}
  <Label x={140} y={260} size={42} delay={.11}>最高</Label><Label x={126} y={315} size={230} width={860} delay={.12}>32GB</Label><Label x={142} y={597} size={65} width={770} delay={.20}>统一内存</Label>
  <Label x={1120} y={845} size={35} width={520} delay={.3} style={{ letterSpacing: '.02em' }}>CPU　　↔　　GPU</Label>
 </Rig>
    </Stage>;
}
export default defineReact({ name: 'MacMiniMemory', schema: {}, component: Memory, designPreview: () => ({ props: {}, composition: { width: 1920, height: 1080, durationSeconds: 4 } }) });
