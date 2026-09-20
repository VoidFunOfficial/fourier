import { defineReact, motion, type FourierMotionTarget } from "@fourier-video/sdk";
import { Stage } from "../../components/Stage";
import { ToolDisc } from "../../components/ToolDisc";
import { C } from "../../components/design";
import type { IconKind } from "../../components/Icons";

const tools: {kind:IconKind;color:string}[]=[{kind:"square",color:C.navy},{kind:"film",color:C.blue},{kind:"contrast",color:C.pink},{kind:"star",color:C.teal},{kind:"video",color:C.blue},{kind:"record",color:C.pink},{kind:"cube",color:C.coral},{kind:"text",color:C.teal}];
const smooth=(x:number)=>{const p=Math.max(0,Math.min(1,x));return p*p*(3-2*p);};
const mix=(a:number,b:number,p:number)=>a+(b-a)*p;

// A tilted orbit sampled into declarative Motion keyframes. Every disc owns its
// trajectory, depth, focus and final tool-stack position within this Scene.
function discFrames(i:number): FourierMotionTarget[] {
 return Array.from({length:77},(_,f)=>{
  const t=f/24,theta=(i/8)*Math.PI*2+Math.PI*1.12+(t-1.25)*2.6;
  const radius=235*smooth(t/.75),tilt=t<1.3?mix(.82,.50,smooth(t/1.3)):mix(.50,0,smooth((t-1.3)/.24));
  let x=640+Math.cos(theta)*radius*(t<1.5?1:.08),y=360+Math.sin(theta)*radius*tilt;
  let scale=.86+Math.sin(theta)*.15,opacity=smooth((t-.07)/.28);
  if(t<.9){x=mix(650,x,smooth(t/.7));y=mix(330,y,smooth(t/.9))-(1-smooth(t/.9))*55;scale*=mix(.06,1,smooth(t/.8));}
  if(t>=1.5){y=360+Math.sin(theta)*225;scale=.8+Math.cos(theta)*.18;}
  const slot=({video:0,star:1,contrast:2,film:3} as Record<string,number>)[tools[i]!.kind];
  const settle=smooth((t-1.98)/.32);
  if(slot!==undefined){x=mix(x,640,settle);y=mix(y,145+slot*145,settle);scale=mix(scale,1.2-slot*.17,settle);}
  else opacity*=1-settle;
  const zoom=t<2.75?mix(1,2.05,smooth((t-2.28)/.23)):mix(2.05,1,smooth((t-2.78)/.26));
  x=640+(x-640)*zoom-365*smooth((t-2.85)/.18);y=360+(y-360)*zoom;scale*=zoom;
  const blur=t<.55?mix(30,0,smooth(t/.55)):t>1.35&&t<2.18?Math.max(0,Math.cos(theta))*5:0;
  return {x:x-115,y:y-115,scale,opacity,filter:`blur(${blur}px)`,zIndex:Math.round((Math.sin(theta)+1)*10),offset:f/76};
 });
}
export default defineReact({name:"CreativeToolOrbit",schema:{},component(){return <Stage>
 <motion.div animate={[{opacity:0,scale:.1,offset:0},{opacity:.8,scale:.8,offset:.065},{opacity:.5,scale:1.2,offset:.12},{opacity:0,scale:1.4,offset:.23},{opacity:0,offset:1}]} transition={{ease:"linear"}} style={{position:"absolute",left:370,top:80,width:540,height:540,borderRadius:"50%",background:`radial-gradient(circle,${C.coral},${C.teal} 28%,${C.navy} 44%,transparent 70%)`,filter:"blur(45px)"}}/>
 {tools.map((tool,i)=><motion.div key={tool.kind} animate={discFrames(i)} transition={{ease:"linear"}} style={{position:"absolute",left:0,top:0,width:230,height:230}}><ToolDisc {...tool}/></motion.div>)}
 </Stage>;},designPreview(){return {props:{},composition:{width:1920,height:1080,durationSeconds:76/24}};}});
