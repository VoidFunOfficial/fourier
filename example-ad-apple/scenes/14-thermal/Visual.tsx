import { defineReact, motion } from '@fourier-video/sdk';
import { Stage, Label, Rig } from '../../components/Stage.tsx';
import { Product, blendPose } from '../../components/Product.tsx';
import { OFFICIAL } from '../../components/OfficialAssets.ts';
function Thermal() {
 return <Stage>
  <Product timeScale={4 / 3} pose={t => blendPose({ eye: [8, 7, 13], rotation: [2.5, 0, .3], shadow: 0 }, { eye: [0, 3, 15], rotation: [2.85, 0, 0], shadow: 0 }, t / 1.2)}/>
  <Rig style={{ background: '#ffffff' }} frames={[{ opacity: 0, scale: 1.22, y: 30, offset: 0 }, { opacity: 0, scale: 1.22, y: 30, offset: .18 }, { opacity: 1, scale: 1, y: 0, easing: 'cubic-bezier(.22,1,.36,1)', offset: .37 }, { opacity: 1, scale: 1.04, y: 0, offset: .84 }, { opacity: 1, scale: 1.12, y: 0, offset: 1 }]}>
   <img src={OFFICIAL.thermal} alt="Apple official Mac mini thermal architecture" style={{ position: 'absolute', width: 1920, height: 960, left: 0, top: -20, objectFit: 'cover' }}/>
   <svg width="1920" height="1080" style={{ position: 'absolute', inset: 0 }}>{[0, 1, 2, 3].map(i => <motion.path key={i} d={`M ${670 + i * 18} 880 C ${710 + i * 18} 766 ${572 + i * 16} 678 ${605 + i * 15} 562`} fill="none" stroke="#aebec6" strokeWidth={5} strokeLinecap="round" strokeDasharray="54 460" animate={[{ strokeDashoffset: 520, offset: 0 }, { strokeDashoffset: -520, offset: 1 }]} transition={{ duration: 1.2, repeat: 4, ease: 'linear' }}/>)}</svg>
  </Rig>
  <Label x={200} y={910} width={1520} size={60} delay={.25} style={{ textAlign: 'center' }}>气流，从底部穿行。</Label>
 </Stage>;
}
export default defineReact({ name: 'MacMiniThermal', schema: {}, component: Thermal, designPreview: () => ({ props: {}, composition: { width: 1920, height: 1080, durationSeconds: 3 } }) });
