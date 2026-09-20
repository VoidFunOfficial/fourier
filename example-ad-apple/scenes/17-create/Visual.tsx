import { defineReact } from '@fourier-video/sdk';
import { Stage, Label, Rig } from '../../components/Stage.tsx';
import { OFFICIAL } from '../../components/OfficialAssets.ts';
function Create() {
 return <Stage>
  <Rig frames={[{ scale: 1.18, x: 0, y: -55, offset: 0, easing: 'cubic-bezier(.22,1,.36,1)' }, { scale: 1, x: 0, y: 0, offset: .32 }, { scale: 1, x: 0, y: 0, offset: .72, easing: 'cubic-bezier(.7,0,.9,.3)' }, { scale: 1.12, x: -260, y: 0, offset: 1 }]}>
   <img src={OFFICIAL.agentic} alt="Apple official on-device AI workflows with Mac mini" style={{ position: 'absolute', left: 260, top: 5, width: 1400, height: 876, objectFit: 'cover' }}/>
  </Rig>
  <Label x={110} y={920} width={1200} size={68} delay={.06}>本地 AI</Label>
 </Stage>;
}
export default defineReact({ name: 'MacMiniCreate', schema: {}, component: Create, designPreview: () => ({ props: {}, composition: { width: 1920, height: 1080, durationSeconds: 2 } }) });
