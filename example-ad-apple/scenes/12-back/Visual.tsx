import { defineReact } from '@fourier-video/sdk';
import { Stage, Label, Rig, Draw } from '../../components/Stage.tsx';
import { Product, blendPose, type Pose } from '../../components/Product.tsx';
import { smooth, lerp } from '../../components/design.ts';
const BACK: Pose = { eye: [0, 1.4, -11], target: [0, 0, 0], fov: 34 };
function Back() {
 return <Stage>
  <Product pose={t => {
   if (t >= 1.05) return t < 3.35 ? BACK : blendPose(BACK, { eye: [-.6, 2, -11.2] }, (t - 3.35) / .65);
   const p = smooth(t / 1.05), angle = lerp(Math.PI / 4, Math.PI, p), radius = lerp(Math.sqrt(128), 11, p);
   return { eye: [Math.sin(angle) * radius, lerp(3, 1.4, p), Math.cos(angle) * radius], fov: 34 };
  }}/>
  <Rig frames={[{ opacity: 0, offset: 0 }, { opacity: 0, offset: .26 }, { opacity: 1, offset: .38 }, { opacity: 1, offset: .82 }, { opacity: 0, offset: .94 }, { opacity: 0, offset: 1 }]}>
   <Label x={1137} y={786} width={720} size={47} delay={.27}>3 × Thunderbolt 4</Label>
   <Label x={938} y={786} width={184} size={44} delay={.28} style={{ textAlign: 'center' }}>HDMI</Label>
   <Label x={480} y={786} width={465} size={44} delay={.29} style={{ textAlign: 'center' }}>2.5Gb Ethernet</Label>
   <svg width="1920" height="1080"><Draw d="M 1145 679 V 743 M 1215 679 V 743 M 1285 679 V 743 M 1030 676 V 743 M 881 676 L 851 743" delay={.3} width={6}/></svg>
  </Rig>
 </Stage>;
}
export default defineReact({ name: 'MacMiniBack', schema: {}, component: Back, designPreview: () => ({ props: {}, composition: { width: 1920, height: 1080, durationSeconds: 4 } }) });
