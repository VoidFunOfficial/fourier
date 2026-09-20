import { defineReact, motion } from "@fourier-video/sdk";
import { Stage } from "../../components/Stage";
import { GamePanel } from "../../components/GamePanel";
import { Cursor } from "../../components/Cursor";
import { C, EASE } from "../../components/design";
export default defineReact({name:"GameLoadout",schema:{},component(){return <Stage>
 <motion.div animate={[{opacity:1,offset:0},{opacity:1,offset:.12},{opacity:0,offset:.55},{opacity:0,offset:1}]} style={{position:"absolute",inset:0,background:C.navy}}/>
 <motion.div animate={[{x:0,y:0,scale:1,offset:0},{x:0,y:0,scale:1,offset:.58},{x:-2634,y:-1501,scale:3.37,offset:.72},{x:-2634,y:-1501,scale:3.37,offset:1}]} transition={{ease:EASE}} style={{position:"absolute",inset:0,transformOrigin:"0 0"}}>
  <motion.div animate={[{scaleX:.59,scaleY:.24,opacity:1,offset:0},{scaleX:.86,scaleY:.79,opacity:1,offset:.17},{scaleX:1,scaleY:1,opacity:1,offset:.35},{scaleX:1.55,scaleY:1.65,opacity:0,offset:.58},{scaleX:1.55,scaleY:1.65,opacity:0,offset:1}]} transition={{ease:EASE}} style={{position:"absolute",left:197,top:113,width:886,height:494,background:C.paper,boxShadow:`0 0 40px 25px ${C.teal},0 0 85px 80px ${C.blue}`,filter:"blur(10px)"}}/>
  <motion.div animate={[{opacity:1,offset:0},{opacity:1,offset:.22},{opacity:0,offset:.43},{opacity:0,offset:1}]} transition={{ease:"linear"}} style={{position:"absolute",inset:0}}>
   {[false,true].map((right)=><motion.div key={String(right)} animate={[{x:right?902:378,offset:0},{x:right?1083:197,offset:.35},{x:right?1083:197,offset:1}]} transition={{ease:EASE}} style={{position:"absolute",left:0,top:0,width:1,height:720,background:"#2c4a6277"}}/>)}
   {[false,true].map((bottom)=><motion.div key={String(bottom)} animate={[{y:bottom?420:300,offset:0},{y:bottom?607:113,offset:.35},{y:bottom?607:113,offset:1}]} transition={{ease:EASE}} style={{position:"absolute",left:0,top:0,width:1280,height:1,background:"#2c4a6277"}}/>)}
  </motion.div>
  <motion.div animate={[{scale:.59,clipPath:"inset(38% 0% 38% 0% round 0px)",offset:0},{scale:.85,clipPath:"inset(0% 0% 0% 0% round 0px)",offset:.17},{scale:1,clipPath:"inset(0% 0% 0% 0% round 0px)",offset:.35},{scale:1,clipPath:"inset(0% 0% 0% 0% round 0px)",offset:1}]} transition={{ease:EASE}} style={{position:"absolute",left:197,top:113,width:886,height:494}}><GamePanel/></motion.div>
  <motion.div animate={[{x:1165,y:577,scale:1,opacity:0,offset:0},{x:1165,y:577,scale:1,opacity:0,offset:.48},{x:1165,y:577,scale:1,opacity:1,offset:.56},{x:970,y:554,scale:1,opacity:1,offset:.80},{x:970,y:554,scale:.83,opacity:1,offset:.87},{x:970,y:554,scale:1,opacity:1,offset:.94},{x:970,y:554,scale:1,opacity:1,offset:1}]} transition={{ease:EASE}} style={{position:"absolute",left:0,top:0,transformOrigin:"0 0"}}><Cursor colour size={38}/></motion.div>
 </motion.div>
 </Stage>;},designPreview(){return {props:{},composition:{width:1920,height:1080,durationSeconds:53/24}};}});
