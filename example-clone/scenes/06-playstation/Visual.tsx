import { defineReact, motion } from "@fourier-video/sdk";
import { Stage } from "../../components/Stage";
import { PlayStation } from "../../components/PlayStation";
export default defineReact({name:"PlayStationSignature",schema:{},component(){return <Stage dark><motion.div animate={[{scale:1,offset:0},{scale:.8,offset:1}]} transition={{ease:"ease-out"}} style={{position:"absolute",left:543,top:283,width:194,height:151}}><PlayStation/></motion.div></Stage>;},designPreview(){return {props:{},composition:{width:1920,height:1080,durationSeconds:26/24}};}});
