import { motion, type FourierMotionTarget } from "@fourier-video/sdk";
import { C, FULL } from "./design";

// Adapted from sonduckMatteBlobFrames in Fourier Styles / GrainyMatteGradient.
// Keep one FourierMotion root in the Scene; this reusable visual adds none.
export function matteBlobFrames(index:number): readonly FourierMotionTarget[] {
  const d=index%2===0?1:-1;
  return [{x:-d*120,y:54-index*24,scale:.94,offset:0},{x:d*150,y:-70+index*31,scale:1.08,offset:.5},{x:-d*120,y:54-index*24,scale:.94,offset:1}];
}
export function Gradient({kind="mixed",phase=0}: {kind?:"mixed"|"teal"|"pink"|"blue";phase?:number}) {
  const colors=kind==="teal"?[C.teal,"#208299",C.navy]:kind==="pink"?[C.pink,C.coral,C.pink]:kind==="blue"?[C.navy,C.blue,C.navy]:[C.blue,C.pink,C.coral,C.teal];
  return <div style={{...FULL,overflow:"hidden",background:colors[0]}}>
    {colors.map((color,i)=><motion.div key={i} animate={matteBlobFrames(i+phase)} transition={{ease:"ease-in-out"}} style={{position:"absolute",left:`${i*29-16}%`,top:-70,width:"69%",height:280,borderRadius:"50%",background:color,filter:"blur(30px)",transformOrigin:"center"}}/>)}
  </div>;
}
