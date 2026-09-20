import { defineReact } from '@fourier-video/sdk';
import { Stage, Label, Rig, Draw } from '../../components/Stage.tsx';
import { Product, blendPose, type Pose } from '../../components/Product.tsx';
const FRONT: Pose = { eye: [0, .7, 9], target: [0, -.1, 0], fov: 34 };
export const FRONT_EXIT: Pose = { eye: [8, 3, 8], target: [0, 0, 0], fov: 34 };
function Front() {
 return <Stage>
  <Product pose={t => t < .8 ? blendPose({ eye: [-.6, .1, 5.2], target: [-.1, -.05, 1] }, FRONT, t / .8) : t < 3 ? FRONT : blendPose(FRONT, FRONT_EXIT, t - 3)}/>
  <Rig frames={[{ opacity: 0, offset: 0 }, { opacity: 1, offset: .22 }, { opacity: 1, offset: .70 }, { opacity: 0, offset: .79 }, { opacity: 0, offset: 1 }]}>
   <Label x={410} y={405} width={540} size={62} delay={.16} style={{ textAlign: 'center' }}>2 × USB-C</Label>
   <Label x={1140} y={760} width={640} size={49} delay={.2} style={{ textAlign: 'center' }}>3.5 mm 耳机插孔</Label>
   <svg width="1920" height="1080"><Draw d="M 573 490 V 565 M 731 490 V 565 M 1340 662 V 730" delay={.22} width={6}/></svg>
  </Rig>
 </Stage>;
}
export default defineReact({ name: 'MacMiniFront', schema: {}, component: Front, designPreview: () => ({ props: {}, composition: { width: 1920, height: 1080, durationSeconds: 4 } }) });
