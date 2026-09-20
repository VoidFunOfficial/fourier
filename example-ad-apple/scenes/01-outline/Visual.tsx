import { defineReact, motion } from '@fourier-video/sdk';
import { Stage, Ink, Draw, Rig } from '../../components/Stage.tsx';
import { Product, HERO, blendPose } from '../../components/Product.tsx';
import { EASE } from '../../components/design.ts';
function Outline() {
    return <Stage>
 <motion.div animate={[{ opacity: 0, easing: "cubic-bezier(.22,1,.36,1)", offset: 0 }, { opacity: 0, easing: "cubic-bezier(.22,1,.36,1)", offset: .33 }, { opacity: 1, easing: "cubic-bezier(.22,1,.36,1)", offset: .57 }, { opacity: 1, easing: "cubic-bezier(.22,1,.36,1)", offset: 1 }]} style={{ position: 'absolute', inset: 0 }}>
  <Product timeScale={4 / 3} pose={t => blendPose({ eye: [10, 8, 15], rotation: [0, -.15, 0] }, HERO, (t - 1.4) / 2.6)}/>
 </motion.div>
 <Rig frames={[{ scale: .7, rotate: -14, opacity: 1, easing: "cubic-bezier(.22,1,.36,1)", offset: 0 }, { scale: 1, rotate: 0, opacity: 1, easing: "cubic-bezier(.22,1,.36,1)", offset: .28 }, { scale: 1.06, rotate: 0, opacity: 0, easing: "cubic-bezier(.22,1,.36,1)", offset: .58 }, { scale: 1.06, rotate: 0, opacity: 0, easing: "cubic-bezier(.22,1,.36,1)", offset: 1 }]}>
  <Ink><svg width="1920" height="1080"><Draw d="M 562 440 Q 546 403 590 378 L 912 244 Q 955 228 1000 252 L 1340 420 Q 1370 438 1356 470 L 1021 673 Q 979 699 936 680 L 598 516 Q 561 500 562 440 Z" duration={.3} width={4}/><Draw d="M 562 440 L 559 619 Q 560 648 595 664 L 936 832 Q 978 850 1018 827 L 1350 624 Q 1366 612 1360 584 L 1358 451 M 978 692 L 979 842" delay={.1} duration={.25} width={3}/><Draw d="M 569 455 Q 589 421 622 414 M 1320 474 Q 1312 479 1305 485" delay={.15} width={2}/></svg></Ink>
 </Rig>
    </Stage>;
}
export default defineReact({ name: 'MacMiniOutline', schema: {}, component: Outline, designPreview: () => ({ props: {}, composition: { width: 1920, height: 1080, durationSeconds: 3 } }) });
