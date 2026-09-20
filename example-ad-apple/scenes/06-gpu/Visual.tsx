import { defineReact } from '@fourier-video/sdk';
import { Stage, Label, Rig, Ink, Draw } from '../../components/Stage.tsx';
import { Sculpture } from '../../components/Sculpture.tsx';
function GPU() {
    return <Stage>
 <Sculpture />
 <Rig frames={[{ opacity: 0, x: -100, easing: "cubic-bezier(.22,1,.36,1)", offset: 0 }, { opacity: 1, x: 0, easing: "cubic-bezier(.22,1,.36,1)", offset: .18 }, { opacity: 1, x: 0, easing: "cubic-bezier(.22,1,.36,1)", offset: .8 }, { opacity: 0, x: -160, easing: "cubic-bezier(.22,1,.36,1)", offset: 1 }]}><Label x={120} y={342} size={146} width={740}>12 核 GPU</Label><Label x={130} y={535} size={48} width={630} delay={.26}>硬件加速光线追踪</Label></Rig>
 <Rig frames={[{ opacity: 1, easing: "cubic-bezier(.22,1,.36,1)", offset: 0 }, { opacity: 1, easing: "cubic-bezier(.22,1,.36,1)", offset: .27 }, { opacity: 0, easing: "cubic-bezier(.22,1,.36,1)", offset: .46 }, { opacity: 0, easing: "cubic-bezier(.22,1,.36,1)", offset: 1 }]}><Ink><svg width="1920" height="1080"><Draw d="M 1190 146 Q 1600 115 1677 429 Q 1745 699 1474 894 M 1474 894 L 1516 831 M 1474 894 L 1550 903" delay={.05} width={3}/></svg></Ink></Rig>
    </Stage>;
}
export default defineReact({ name: 'MacMiniGPU', schema: {}, component: GPU, designPreview: () => ({ props: {}, composition: { width: 1920, height: 1080, durationSeconds: 4 } }) });
