import { defineReact, motion } from '@fourier-video/sdk';
import { Stage, Label, Rig } from '../../components/Stage.tsx';
import { Monitor } from '../../components/Artwork.tsx';
import { SCREENS } from '../../components/OfficialAssets.ts';
import { Product } from '../../components/Product.tsx';
import { EASE } from '../../components/design.ts';
function Displays() {
    return <Stage>
 <Product pose={() => ({ eye: [6, 7, 14], position: [0, -3.95, 0], scale: .44, shadow: 0 })}/>
 <Rig frames={[{ scale: 1, x: 0, y: 0, easing: "cubic-bezier(.22,1,.36,1)", offset: 0 }, { scale: 1, x: 0, y: 0, easing: "cubic-bezier(.22,1,.36,1)", offset: .82 }, { scale: 1.43, x: -800, y: 90, easing: "cubic-bezier(.22,1,.36,1)", offset: 1 }]}>
  {[0, 1, 2].map(i => <motion.div key={i} animate={[{ x: (1 - i) * 580, y: 90, scale: .25, rotateY: 70, opacity: 0, easing: "cubic-bezier(.22,1,.36,1)", offset: 0 }, { x: (1 - i) * 580, y: 90, scale: .25, rotateY: 70, opacity: 0, easing: "cubic-bezier(.22,1,.36,1)", offset: i * .04 }, { x: 0, y: 0, scale: .81, rotateY: 0, opacity: 1, easing: "cubic-bezier(.22,1,.36,1)", offset: .27 + i * .04 }, { x: 0, y: 0, scale: .81, rotateY: 0, opacity: 1, easing: "cubic-bezier(.22,1,.36,1)", offset: 1 }]} transition={{ ease: EASE, fill: 'both' }} style={{ position: 'absolute', left: 75 + i * 585, top: 273, transformOrigin: '50% 50%' }}><Monitor variant={i} screen={SCREENS[i]}/></motion.div>)}
  <Label x={350} y={110} width={1220} size={65} delay={.2} style={{ textAlign: 'center' }}>最多 3 台外接显示器</Label>
 </Rig>
    </Stage>;
}
export default defineReact({ name: 'MacMiniDisplays', schema: {}, component: Displays, designPreview: () => ({ props: {}, composition: { width: 1920, height: 1080, durationSeconds: 4 } }) });
