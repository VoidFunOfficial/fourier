import { defineReact } from '@fourier-video/sdk';
import { Stage, Label, Rig } from '../../components/Stage.tsx';
import { Product, HERO, TOP, blendPose } from '../../components/Product.tsx';
function ObjectScene() {
    return <Stage>
 <Product timeScale={4 / 3} pose={t => t < 2.7 ? blendPose(HERO, { eye: [-6, 5, 13], rotation: [0, .12, 0] }, t / 2.7) : blendPose({ eye: [-6, 5, 13], rotation: [0, .12, 0] }, TOP, (t - 2.7) / 1.3)}/>
 <Rig frames={[{ opacity: 1, y: 0, easing: "cubic-bezier(.22,1,.36,1)", offset: 0 }, { opacity: 1, y: 0, easing: "cubic-bezier(.22,1,.36,1)", offset: .66 }, { opacity: 0, y: 40, easing: "cubic-bezier(.22,1,.36,1)", offset: .85 }, { opacity: 0, y: 40, easing: "cubic-bezier(.22,1,.36,1)", offset: 1 }]}><Label x={1230} y={790} size={110} width={600} delay={.04}>Mac mini</Label></Rig>
    </Stage>;
}
export default defineReact({ name: 'MacMiniObject', schema: {}, component: ObjectScene, designPreview: () => ({ props: {}, composition: { width: 1920, height: 1080, durationSeconds: 3 } }) });
