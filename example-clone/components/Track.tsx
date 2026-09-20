import { motion, type FourierMotionTarget } from "@fourier-video/sdk";
import { Gradient } from "./Gradient";
import { Icon, type IconKind } from "./Icons";
import { EASE } from "./design";
export function Track({icon,kind="mixed",frames,barFrames,phase=0}: {icon:IconKind;kind?:"mixed"|"teal"|"pink"|"blue";frames:readonly FourierMotionTarget[];barFrames?:readonly FourierMotionTarget[];phase?:number}) {
 return <motion.div animate={frames} transition={{ease:"linear"}} style={{position:"absolute",left:0,top:0,width:1600,height:110}}>
  <div style={{position:"absolute",left:78,top:12}}><Icon kind={icon} size={94}/></div>
  <motion.div animate={barFrames??[{width:525,offset:0},{width:525,offset:1}]} transition={{ease:"linear"}} style={{position:"absolute",left:221,top:0,height:110,borderRadius:24,overflow:"hidden",transformOrigin:"0 50%"}}><Gradient kind={kind} phase={phase}/></motion.div>
 </motion.div>;
}
