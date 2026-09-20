import { defineReact, motion } from '@fourier-video/sdk';
import { Stage } from '../../../../components/Stage.tsx';
import { C, enter } from '../../../../components/design.ts';

function Credits() {
 return <Stage>
  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 38 }}>
   <motion.div animate={enter(0, 20)} transition={{ ease: 'linear', fill: 'both' }} style={{ fontSize: 54, lineHeight: 1.1, letterSpacing: '-.035em', color: C.gray }}>this video</motion.div>
   <motion.div animate={enter(.07, 24)} transition={{ ease: 'linear', fill: 'both' }} style={{ fontSize: 84, lineHeight: 1.15, letterSpacing: '-.035em', whiteSpace: 'nowrap' }}>完全由 Fourier Harness + GPT6</motion.div>
   <motion.div animate={enter(.15, 20)} transition={{ ease: 'linear', fill: 'both' }} style={{ fontSize: 58, lineHeight: 1.15, letterSpacing: '-.035em' }}>独立完成</motion.div>
  </div>
 </Stage>;
}

export default defineReact({ name: 'MacMiniCredits', schema: {}, component: Credits, designPreview: () => ({ props: {}, composition: { width: 1920, height: 1080, durationSeconds: 4 } }) });
