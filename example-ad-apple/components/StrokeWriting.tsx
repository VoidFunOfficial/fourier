import { motion } from '@fourier-video/sdk';

type PenStroke = { id: string; d: string; width: number; startFrame: number; endFrame: number };

/** Stage.Draw's normalized SVG paths, with explicit pen lifts.
 * The scene owns FourierMotion; sound uses the same stroke frame data.
 */
export function StrokeWriting({ strokes, durationFrames, color, label }: {
 strokes: readonly PenStroke[]; durationFrames: number; color: string; label: string;
}) {
 return <svg width={1920} height={1080} viewBox="0 0 1920 1080" role="img" aria-label={label}>
  {strokes.map(s => <motion.path key={s.id} data-stroke={s.id} d={s.d}
   fill="none" stroke={color} strokeWidth={s.width} strokeLinecap="round" strokeLinejoin="round"
   pathLength={1} style={{ strokeDasharray: '1 1' }}
   animate={[
    { strokeDashoffset: 1, opacity: 0, offset: 0 },
    { strokeDashoffset: 1, opacity: 0, offset: (s.startFrame - .05) / durationFrames },
    { strokeDashoffset: 1, opacity: 1, offset: s.startFrame / durationFrames },
    { strokeDashoffset: 0, opacity: 1, offset: s.endFrame / durationFrames },
    { strokeDashoffset: 0, opacity: 1, offset: 1 },
   ]} transition={{ ease: 'linear', fill: 'both' }}/>) }
 </svg>;
}
