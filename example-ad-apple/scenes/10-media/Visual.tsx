import { defineReact, motion } from '@fourier-video/sdk';
import { Stage, Label, Rig, Draw } from '../../components/Stage.tsx';
import { SCREENS } from '../../components/OfficialAssets.ts';
import { C, EASE } from '../../components/design.ts';
function Media() {
    return <Stage>
 <Rig frames={[{ rotate: -9, scale: 1.8, x: 420, y: 0, easing: "cubic-bezier(.22,1,.36,1)", offset: 0 }, { rotate: 0, scale: 1, x: 0, y: 0, easing: "cubic-bezier(.22,1,.36,1)", offset: .24 }, { rotate: 0, scale: 1, x: 0, y: 0, easing: "cubic-bezier(.22,1,.36,1)", offset: .79 }, { rotate: 0, scale: 3.8, x: 220, y: -290, easing: "cubic-bezier(.22,1,.36,1)", offset: 1 }]}>
  {Array.from({ length: 5 }, (_, i) => <motion.div key={i} animate={[{ x: -1800, rotate: -8, easing: "cubic-bezier(.22,1,.36,1)", offset: 0 }, { x: -1800, rotate: -8, easing: "cubic-bezier(.22,1,.36,1)", offset: i * .035 }, { x: 0, rotate: 0, easing: "cubic-bezier(.22,1,.36,1)", offset: .22 + i * .035 }, { x: 0, rotate: 0, easing: "cubic-bezier(.22,1,.36,1)", offset: .8 }, { x: 0, rotate: 0, easing: "cubic-bezier(.22,1,.36,1)", offset: 1 }]} transition={{ ease: EASE, fill: 'both' }} style={{ position: 'absolute', left: -330 + i * 540, top: 164, width: 510, height: 324, overflow: 'hidden', borderRadius: 20 }}><img src={SCREENS[i % 3]} alt="Apple official creative workflow" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/></motion.div>)}
  <Label x={720} y={555} size={145} width={900} delay={.14}>ProRes</Label><Label x={630} y={737} size={48} width={700} delay={.23} style={{ textAlign: 'center' }}>硬件加速编码与解码</Label>
  <svg width="1920" height="1080"><Draw d="M 235 850 L 235 902 L 1668 902 L 1668 850" delay={.2} width={6}/></svg>
  {Array.from({ length: 9 }, (_, i) => <motion.div key={i} animate={[{ scaleX: 0, easing: "cubic-bezier(.22,1,.36,1)", offset: 0 }, { scaleX: 0, easing: "cubic-bezier(.22,1,.36,1)", offset: .08 + i * .025 }, { scaleX: 1, easing: "cubic-bezier(.22,1,.36,1)", offset: .25 + i * .025 }, { scaleX: 1, easing: "cubic-bezier(.22,1,.36,1)", offset: 1 }]} transition={{ ease: EASE }} style={{ position: 'absolute', left: 264 + i * 155, top: 858, width: 145, height: 27, borderRadius: 7, background: i % 3 === 0 ? C.peach : i % 3 === 1 ? C.mint : C.blue, transformOrigin: '0 50%' }}/>)}
 </Rig>
    </Stage>;
}
export default defineReact({ name: 'MacMiniMedia', schema: {}, component: Media, designPreview: () => ({ props: {}, composition: { width: 1920, height: 1080, durationSeconds: 4 } }) });
