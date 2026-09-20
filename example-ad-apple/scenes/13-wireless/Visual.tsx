import { defineReact, motion } from '@fourier-video/sdk';
import { Stage, Label, Ink, Draw, Rig, Fine } from '../../components/Stage.tsx';
import { C, EASE } from '../../components/design.ts';
function Wireless() {
    return <Stage>
 <Rig frames={[{ rotate: -25, scale: .55, opacity: 0, easing: "cubic-bezier(.22,1,.36,1)", offset: 0 }, { rotate: 0, scale: 1, opacity: 1, easing: "cubic-bezier(.22,1,.36,1)", offset: .19 }, { rotate: 0, scale: 1, opacity: 1, easing: "cubic-bezier(.7,0,.9,.3)", offset: .8 }, { rotate: 24, scale: 1.9, opacity: 0, easing: "cubic-bezier(.22,1,.36,1)", offset: 1 }]}>
 <Ink><svg width="1920" height="1080">{[0, 1, 2].map(i => <Draw key={i} d={`M ${330 - i * 120} ${385 - i * 43} Q 610 ${125 - i * 160} ${890 + i * 120} ${385 - i * 43}`} delay={.08 + i * .065} duration={.24} width={24} color={i === 0 ? C.ink : i === 1 ? '#85878b' : '#d4d5d9'}/>)}<Draw d="M 1400 211 L 1400 645 L 1537 514 L 1265 338 L 1400 211 L 1537 338 L 1265 514" delay={.18} duration={.35} width={21}/></svg></Ink>
 <motion.div animate={[{ scale: 0, easing: "cubic-bezier(.22,1,.36,1)", offset: 0 }, { scale: 1, easing: "cubic-bezier(.22,1,.36,1)", offset: .27 }, { scale: 1, easing: "cubic-bezier(.22,1,.36,1)", offset: 1 }]} transition={{ ease: EASE }} style={{ position: 'absolute', left: 573, top: 525, width: 75, height: 75, borderRadius: '50%', background: C.ink }}/>
 <Label x={320} y={726} size={105} width={590} delay={.19} style={{ textAlign: 'center' }}>Wi-Fi 7</Label><Label x={1070} y={726} size={105} width={665} delay={.28} style={{ textAlign: 'center' }}>Bluetooth 6</Label>
 </Rig><Fine>无线功能的可用性因国家或地区而异。</Fine>
    </Stage>;
}
export default defineReact({ name: 'MacMiniWireless', schema: {}, component: Wireless, designPreview: () => ({ props: {}, composition: { width: 1920, height: 1080, durationSeconds: 4 } }) });
