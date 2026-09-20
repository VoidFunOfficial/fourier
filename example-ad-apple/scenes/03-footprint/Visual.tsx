import { defineReact, motion } from '@fourier-video/sdk';
import { Stage, Ink, Draw, Label, Rig } from '../../components/Stage.tsx';
import { Product, TOP, blendPose } from '../../components/Product.tsx';
function Footprint() {
    return <Stage>
 <Rig frames={[{ scale: 1, easing: "cubic-bezier(.22,1,.36,1)", offset: 0 }, { scale: 1, easing: "cubic-bezier(.22,1,.36,1)", offset: .77 }, { scale: .57, easing: "cubic-bezier(.22,1,.36,1)", offset: 1 }]}>
 <Product pose={() => TOP}/>
 <svg width="1920" height="1080" style={{ position: 'absolute', inset: 0 }}>
  <Draw d="M 645 892 H 768 M 1152 892 H 1275 M 645 876 V 909 M 1275 876 V 909" delay={.1} width={6}/>
  <Draw d="M 597 225 V 340 M 597 743 V 855 M 581 225 H 613 M 581 855 H 613" delay={.17} width={6}/>
 </svg>
 <Label x={820} y={863} size={54} width={280} delay={.22} style={{ textAlign: 'center' }}>5 英寸</Label>
 <Label x={343} y={510} size={54} width={220} delay={.24}>5 英寸</Label>
 </Rig>
 <motion.div animate={[{ opacity: 0, scale: .5, easing: "cubic-bezier(.22,1,.36,1)", offset: 0 }, { opacity: 0, scale: .5, easing: "cubic-bezier(.22,1,.36,1)", offset: .77 }, { opacity: 1, scale: .57, easing: "cubic-bezier(.22,1,.36,1)", offset: 1 }]} style={{ position: 'absolute', left: 660, top: 240, width: 600, height: 600, background: '#1d1d1f', borderRadius: 90 }}/>
    </Stage>;
}
export default defineReact({ name: 'MacMiniFootprint', schema: {}, component: Footprint, designPreview: () => ({ props: {}, composition: { width: 1920, height: 1080, durationSeconds: 3 } }) });
