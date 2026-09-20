import { motion } from "@fourier-video/sdk";
import { Gradient } from "./Gradient";
import { C } from "./design";

export const EXPORT_SECONDS=66/24;
// Values measured from the reference: 32% at 9.00, 78% at 9.25, 92% at
// 9.50, 97% at 9.75; 100% is held before the capsule transformation.
export function exportValue(t:number) {
 const keys=[[0,0],[.5,0],[.58,2],[.75,32],[1,78],[1.25,92],[1.5,97],[1.75,100],[2.75,100]];
 for(let i=1;i<keys.length;i++){const [b,vb]=keys[i]!,[a,va]=keys[i-1]!;if(t<=b)return Math.round(va+(vb-va)*(t-a)/(b-a));}return 100;
}
export function Progress() {
 const samples=Array.from({length:67},(_,i)=>({v:exportValue(i/24),offset:i/66}));
 return <div style={{width:820,height:160,position:"relative"}}>
  <motion.div animate={[{height:62,y:49,borderRadius:9,offset:0},{height:20,y:70,borderRadius:12,offset:.085},{height:20,y:70,borderRadius:12,offset:.39},{height:44,y:58,borderRadius:30,offset:.45},{height:44,y:58,borderRadius:30,offset:1}]} transition={{ease:"linear"}} style={{position:"absolute",left:0,top:0,width:820,overflow:"hidden",background:C.white,boxShadow:"inset 0 2px 4px #fff9,0 1px 1px #000a"}}>
   <motion.div animate={samples.map(s=>({width:`${s.v}%`,offset:s.offset}))} transition={{ease:"linear"}} style={{position:"absolute",inset:0,right:"auto",overflow:"hidden",borderRadius:"inherit"}}><div style={{position:"absolute",inset:0,width:820}}><Gradient/></div></motion.div>
   <div style={{position:"absolute",inset:0,borderRadius:"inherit",boxShadow:"inset 0 1px 1px #fff6,inset 0 -1px 1px #554b6066"}}/>
  </motion.div>
  <div style={{position:"absolute",left:854,top:61,width:130,height:44,fontSize:34,lineHeight:"44px",fontVariantNumeric:"tabular-nums",letterSpacing:"-.04em"}}>
   {Array.from(new Set(samples.map(s=>s.v))).map(v=><motion.span key={v} animate={samples.map(s=>({opacity:s.v===v?1:0,offset:s.offset,easing:"steps(1,end)"}))} transition={{ease:"linear"}} style={{position:"absolute",left:0,top:0,whiteSpace:"nowrap",background:"linear-gradient(#e6e4e7 48%,#878589)",backgroundClip:"text",color:"transparent"}}>{v}%</motion.span>)}
  </div>
 </div>;
}
