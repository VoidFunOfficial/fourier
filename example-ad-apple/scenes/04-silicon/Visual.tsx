import { defineReact, motion } from '@fourier-video/sdk';
import { Stage, Logo, Rig, Draw } from '../../components/Stage.tsx';
import { C, EASE } from '../../components/design.ts';
function Silicon() {
    return <Stage>
 <Rig frames={[{ scale: .57, easing: "cubic-bezier(.22,1,.36,1)", offset: 0 }, { scale: 1, easing: "cubic-bezier(.22,1,.36,1)", offset: .21 }, { scale: 1.03, easing: "cubic-bezier(.22,1,.36,1)", offset: .75 }, { scale: 5, easing: "cubic-bezier(.22,1,.36,1)", offset: 1 }]}>
  <svg width="1920" height="1080">{Array.from({ length: 11 }, (_, i) => <g key={i}><Draw d={`M ${i * 56 + 680} 240 L ${i * 56 + 680} ${150 - i % 3 * 35} L ${i * 56 + 600} 40`} delay={.04 + i * .01} width={2} color="#b7b8bc"/><Draw d={`M ${i * 56 + 680} 840 L ${i * 56 + 680} ${945 + i % 3 * 25} L ${i * 56 + 740} 1080`} delay={.09 + i * .01} width={2} color="#b7b8bc"/></g>)}</svg>
  <div style={{ position: 'absolute', left: 660, top: 240, width: 600, height: 600, borderRadius: 90, background: C.ink, boxShadow: 'inset 0 2px 0 #66666a, 0 35px 90px #00000018', overflow: 'hidden' }}>
   <motion.div animate={[{ x: -550, easing: "cubic-bezier(.22,1,.36,1)", offset: 0 }, { x: -550, easing: "cubic-bezier(.22,1,.36,1)", offset: .12 }, { x: 750, easing: "cubic-bezier(.22,1,.36,1)", offset: .55 }, { x: 750, easing: "cubic-bezier(.22,1,.36,1)", offset: 1 }]} transition={{ ease: 'linear' }} style={{ position: 'absolute', top: -200, width: 170, height: 1000, background: '#ffffff09', transform: 'rotate(30deg)' }}/>
   <motion.div animate={[{ opacity: 0, y: 50, easing: "cubic-bezier(.22,1,.36,1)", offset: 0 }, { opacity: 1, y: 0, easing: "cubic-bezier(.22,1,.36,1)", offset: .23 }, { opacity: 1, y: 0, easing: "cubic-bezier(.22,1,.36,1)", offset: .77 }, { opacity: 0, y: 0, easing: "cubic-bezier(.22,1,.36,1)", offset: .95 }, { opacity: 0, y: 0, easing: "cubic-bezier(.22,1,.36,1)", offset: 1 }]} transition={{ ease: EASE }} style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 22, color: C.paper, fontSize: 210, letterSpacing: '-.055em' }}><Logo size={170} color={C.paper}/>M6</motion.div>
  </div>
 </Rig>
    </Stage>;
}
export default defineReact({ name: 'MacMiniSilicon', schema: {}, component: Silicon, designPreview: () => ({ props: {}, composition: { width: 1920, height: 1080, durationSeconds: 4 } }) });
