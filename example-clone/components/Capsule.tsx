import { motion } from "@fourier-video/sdk";
import { Dots, Icon } from "./Icons";
import { C } from "./design";
export function Capsule() {
 return <div style={{position:"relative",width:530,height:160,borderRadius:84,background:"linear-gradient(140deg,#505255,#35313d 30%,#486176 64%,#a39bac)",padding:2,boxShadow:"-3px -4px 7px #0006,1px 5px 2px #716676"}}>
  <div style={{position:"absolute",inset:2,borderRadius:82,overflow:"hidden",background:"linear-gradient(110deg,#252528,#302b36 70%,#77717e)"}}>
   <motion.div animate={[{x:570,opacity:0,offset:0},{x:390,opacity:.12,offset:.1},{x:0,opacity:1,offset:.44},{x:0,opacity:1,offset:1}]} transition={{ease:"cubic-bezier(.25,.8,.2,1)"}} style={{position:"absolute",inset:-2,borderRadius:82,background:"linear-gradient(90deg,#d4d2d5,#fafbfb 52%,#d2d0d3)",boxShadow:"inset -16px 0 0 #ffffff65,inset 2px 1px 5px white",filter:"blur(.6px)"}}/>
   <motion.div animate={[{opacity:0,offset:0},{opacity:0,offset:.13},{opacity:1,offset:.42},{opacity:1,offset:1}]} transition={{ease:"linear"}} style={{position:"absolute",left:111,top:55}}><Icon kind="hourglass" size={46} color="#a5a5a5"/></motion.div>
   <motion.div animate={[{opacity:.25,rotate:40,offset:0},{opacity:1,rotate:0,offset:.46},{opacity:1,rotate:12,offset:1}]} transition={{ease:"ease-out"}} style={{position:"absolute",left:352,top:48}}><Dots size={59}/></motion.div>
   <motion.div animate={[{x:100,opacity:0,offset:0},{x:100,opacity:0,offset:.2},{x:0,opacity:.5,offset:.5},{x:0,opacity:.2,offset:1}]} transition={{ease:"ease-out"}} style={{position:"absolute",left:268,top:5,bottom:5,width:2,background:"white",filter:"blur(2px)"}}/>
  </div>
 </div>;
}
