import { defineReact, motion } from "@fourier-video/sdk";
import { Stage } from "../../components/Stage";
import { Capsule } from "../../components/Capsule";
export default defineReact({name:"WorkPlaySwitch",schema:{},component(){return <Stage dark><motion.div animate={[{x:178,y:280,scaleX:1.36,offset:0},{x:369,y:280,scaleX:1,offset:.28},{x:355,y:280,scaleX:.98,offset:1}]} transition={{ease:"cubic-bezier(.16,1,.3,1)"}} style={{position:"absolute",left:0,top:0,transformOrigin:"0 50%"}}><Capsule/></motion.div></Stage>;},designPreview(){return {props:{},composition:{width:1920,height:1080,durationSeconds:34/24}};}});
