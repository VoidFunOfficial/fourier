import { defineReact, motion } from '@fourier-video/sdk';
import { Stage, Label, Rig } from '../../components/Stage.tsx';
import { C, EASE } from '../../components/design.ts';
function CPU() {
    return <Stage dark>
 <Rig frames={[{ scale: 2.6, rotate: 12, x: 0, opacity: 1, easing: "cubic-bezier(.22,1,.36,1)", offset: 0 }, { scale: 1, rotate: 0, x: 0, opacity: 1, easing: "cubic-bezier(.22,1,.36,1)", offset: .24 }, { scale: 1, rotate: 0, x: 0, opacity: 1, easing: "cubic-bezier(.7,0,.9,.3)", offset: .8 }, { scale: 1.18, rotate: -9, x: 500, opacity: 0, easing: "cubic-bezier(.22,1,.36,1)", offset: 1 }]}>
  {Array.from({ length: 12 }, (_, i) => <motion.div key={i} animate={[{ scale: .55, y: 70, opacity: 0, easing: "cubic-bezier(.22,1,.36,1)", offset: 0 }, { scale: .55, y: 70, opacity: 0, easing: "cubic-bezier(.22,1,.36,1)", offset: .04 + i * .012 }, { scale: 1, y: 0, opacity: 1, easing: "cubic-bezier(.22,1,.36,1)", offset: .22 + i * .012 }, { scale: 1, y: 0, opacity: 1, easing: "cubic-bezier(.22,1,.36,1)", offset: 1 }]} transition={{ ease: EASE }} style={{ position: 'absolute', left: 790 + (i % 4) * 210, top: 190 + Math.floor(i / 4) * 220, width: 192, height: 192, borderRadius: 32, background: i < 2 ? C.paper : i < 6 ? '#bdbfc4' : '#6b6d72', boxShadow: 'inset 0 2px 1px #ffffff70, 0 10px 0 #00000030' }}>
   <div style={{ position: 'absolute', inset: 24, borderRadius: 14, border: '1px solid #1d1d1f20' }}/>
  </motion.div>)}
  <Label x={120} y={335} size={152} width={680} delay={.12}>12 核 CPU</Label>
  <Label x={126} y={540} size={36} width={570} delay={.22} style={{ lineHeight: 1.7, color: '#b4b4bb' }}>2 个超级核心<br />4 个性能核心<br />6 个能效核心</Label>
 </Rig>
    </Stage>;
}
export default defineReact({ name: 'MacMiniCPU', schema: {}, component: CPU, designPreview: () => ({ props: {}, composition: { width: 1920, height: 1080, durationSeconds: 4 } }) });
