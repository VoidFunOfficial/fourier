import { defineReact } from '@fourier-video/sdk';
import { Stage } from '../../../../components/Stage.tsx';
import { StrokeWriting } from '../../../../components/StrokeWriting.tsx';
import { C } from '../../../../components/design.ts';
import lettering from '../../../../assets/handwriting/all-in-strokes.json';

function AllIn() {
 return <Stage><StrokeWriting strokes={lettering.strokes} durationFrames={lettering.durationFrames}
  color={C.ink} label={lettering.text}/></Stage>;
}

export default defineReact({ name: 'MacMiniAllIn', schema: {}, component: AllIn, designPreview: () => ({ props: {}, composition: { width: 1920, height: 1080, durationSeconds: 5 } }) });
