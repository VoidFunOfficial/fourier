import { defineReact, motion } from '@fourier-video/sdk';
import { Stage, Label, Rig, Fine, Draw } from '../../components/Stage.tsx';
import { OFFICIAL } from '../../components/OfficialAssets.ts';
function Continuity() {
 return <Stage>
  <Rig frames={[{ scale: 1.4, x: -290, y: -15, offset: 0, easing: 'cubic-bezier(.22,1,.36,1)' }, { scale: 1, x: 0, y: 0, offset: .25 }, { scale: 1, x: 0, y: 0, offset: .76, easing: 'cubic-bezier(.7,0,.9,.3)' }, { scale: 1.18, x: 0, y: -50, offset: 1 }]}>
   <img src={OFFICIAL.mirroring} alt="Apple official iPhone Mirroring on Mac mini" style={{ position: 'absolute', left: 110, top: 72, width: 1700, height: 850, objectFit: 'cover' }}/>
   <motion.div animate={[{ opacity: 0, offset: 0 }, { opacity: 1, offset: .25 }, { opacity: 1, offset: .70 }, { opacity: 0, offset: .84 }, { opacity: 0, offset: 1 }]}>
    <svg width="1920" height="1080"><Draw d="M 631 283 H 731 M 714 266 L 731 283 L 714 300" delay={.18} width={6} color="#ffffff"/></svg>
   </motion.div>
  </Rig>
  <Label x={115} y={930} width={1200} size={64} delay={.12}>iPhone 镜像</Label>
  <Fine>需兼容的 iPhone、Mac 与软件版本；功能可用性因国家或地区而异。</Fine>
 </Stage>;
}
export default defineReact({ name: 'MacMiniContinuity', schema: {}, component: Continuity, designPreview: () => ({ props: {}, composition: { width: 1920, height: 1080, durationSeconds: 4 } }) });
