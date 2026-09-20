import { defineReact, motion } from '@fourier-video/sdk';
import { Stage, Label, Rig, Fine } from '../../components/Stage.tsx';
import { Counter } from '../../components/Counter.tsx';
import { C, EASE } from '../../components/design.ts';
function Bandwidth() {
    return <Stage dark>
 {Array.from({ length: 14 }, (_, i) => <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: 95 + i * 66, height: 2, background: '#ffffff0c' }}><motion.div animate={[{ x: -700, offset: 0 }, { x: 2100, offset: 1 }]} transition={{ duration: .85 + i % 3 * .13, delay: -i * .13, repeat: 5, ease: 'linear' }} style={{ position: 'absolute', width: 200 + i % 3 * 150, height: 2, background: i % 3 === 0 ? '#dcdde1' : '#717279' }}/></div>)}
 <Rig frames={[{ y: 60, opacity: 0, easing: "cubic-bezier(.22,1,.36,1)", offset: 0 }, { y: 0, opacity: 1, easing: "cubic-bezier(.22,1,.36,1)", offset: .14 }, { y: 0, opacity: 1, easing: "cubic-bezier(.7,0,.9,.3)", offset: .86 }, { y: 0, opacity: 0, easing: "cubic-bezier(.22,1,.36,1)", offset: 1 }]}>
  <div style={{ position: 'absolute', left: 410, top: 312, padding: '0 75px 35px', background: C.ink, borderRadius: 40 }}><div style={{ fontSize: 40, color: '#b4b4bb' }}>最高</div><div style={{ display: 'flex', alignItems: 'baseline', gap: 25 }}><Counter value={170} size={270}/><span style={{ fontSize: 95, letterSpacing: '-.06em' }}>GB/s</span></div><div style={{ fontSize: 51, letterSpacing: '-.035em' }}>内存带宽</div></div>
 </Rig>
 <Fine dark>170GB/s 适用于 24GB 或 32GB 统一内存配置；16GB 配置为 153GB/s。</Fine>
    </Stage>;
}
export default defineReact({ name: 'MacMiniBandwidth', schema: {}, component: Bandwidth, designPreview: () => ({ props: {}, composition: { width: 1920, height: 1080, durationSeconds: 4 } }) });
