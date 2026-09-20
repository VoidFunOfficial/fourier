import { defineReact, motion } from "@fourier-video/sdk";
import { Stage } from "../../components/Stage";
import { Progress, EXPORT_SECONDS } from "../../components/Progress";
import { EASE } from "../../components/design";
export default defineReact({name:"ExportProgress",schema:{},component(){return <Stage dark>
 <motion.div animate={[{x:196,y:280,scale:1,opacity:1,filter:"blur(0px)",offset:0},{x:196,y:280,scale:1,opacity:1,filter:"blur(0px)",offset:.385},{x:-2270,y:60,scale:3.62,opacity:1,filter:"blur(0px)",offset:.455},{x:-2364,y:60,scale:3.62,opacity:1,filter:"blur(0px)",offset:.70},{x:-2364,y:60,scale:3.62,opacity:1,filter:"blur(0px)",offset:.86},{x:-2130,y:60,scale:3.62,opacity:.65,filter:"blur(7px)",offset:1}]} transition={{ease:EASE}} style={{position:"absolute",left:0,top:0,transformOrigin:"0 0"}}><Progress/></motion.div>
 </Stage>;},designPreview(){return {props:{},composition:{width:1920,height:1080,durationSeconds:EXPORT_SECONDS}};}});
