import { defineReact, motion, type FourierMotionTarget } from '@fourier-video/sdk';
import { Stage, Logo } from '../../../../components/Stage.tsx';
import { DESKTOPS } from '../../../../components/OfficialAssets.ts';
import { C } from '../../../../components/design.ts';
// All five official desktop photos use the same 1240 × 1200 registration.
// The product crop is a single stationary layer above the changing desktop images.
// It receives no animated properties, ensuring the enclosure never shifts or morphs.
const SWITCH_SECONDS = [0, .7, 1.4, 2.1, 2.8] as const;
function phaseFrames(index: number): readonly FourierMotionTarget[] {
 const start = SWITCH_SECONDS[index]! / 4, end = (SWITCH_SECONDS[index + 1] ?? 4) / 4, frame = 1 / 240;
 return [
  { opacity: index === 0 ? 1 : 0, offset: 0 },
  ...(index ? [{ opacity: 0, offset: start - frame }, { opacity: 1, offset: start }] : []),
  { opacity: 1, offset: end - frame }, { opacity: index === 4 ? 1 : 0, offset: end },
  ...(index === 4 ? [] : [{ opacity: 0, offset: 1 }]),
 ];
}
function Signature() {
 return <Stage>
  {DESKTOPS.map((item, i) => <motion.div key={item.name} animate={phaseFrames(i)} transition={{ ease: 'linear', fill: 'both' }} style={{ position: 'absolute', inset: 0 }}>
   <img src={item.desk} alt={`${item.name} official Mac mini desktop`} style={{ position: 'absolute', left: 0, top: 0, width: 960, height: 929.0323 }}/>
   <img src={item.screen} alt={`${item.name} official application workflow`} style={{ position: 'absolute', left: 960, top: 0, width: 960, height: 929.0323 }}/>
   <div style={{ position: 'absolute', left: 72, top: 964, fontSize: 72, lineHeight: 1, letterSpacing: '-.048em' }}>{item.name}</div>
  </motion.div>)}
  <div data-pinned-product="true" style={{ position: 'absolute', left: 323.6129, top: 308.129, width: 314.3226, height: 314.3226, borderRadius: 68, overflow: 'hidden' }}>
   <img src={DESKTOPS[0].desk} alt="Mac mini, fixed position throughout all five workflows" style={{ position: 'absolute', left: -323.6129, top: -308.129, width: 960, height: 929.0323, maxWidth: 'none' }}/>
  </div>
  <div style={{ position: 'absolute', right: 72, top: 971, display: 'flex', alignItems: 'center', gap: 23, fontSize: 55, lineHeight: 1, letterSpacing: '-.04em' }}>
   <span>Mac mini</span><span style={{ height: 54, width: 2, background: '#c7c7cc', margin: '0 3px' }}/><Logo size={46} color={C.ink}/><span>M6</span>
  </div>
 </Stage>;
}
export default defineReact({ name: 'MacMiniSignature', schema: {}, component: Signature, designPreview: () => ({ props: {}, composition: { width: 1920, height: 1080, durationSeconds: 4 } }) });
