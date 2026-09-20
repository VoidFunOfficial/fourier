import { motion } from "@fourier-video/sdk";
import { Character } from "./Character";
import { Icon, type IconKind } from "./Icons";
import { Gradient } from "./Gradient";
import { C } from "./design";

export function Button(){return <div style={{width:126,height:29,borderRadius:5,background:`linear-gradient(100deg,${C.navy},${C.blue})`,display:"flex",justifyContent:"center",alignItems:"center",color:"#fff",fontSize:13,lineHeight:1}}>Continue</div>;}
function Skill({icon,x,y,width,value,kind,delay}:{icon:IconKind;x:number;y:number;width:number;value:number;kind:"mixed"|"blue"|"pink"|"teal";delay:number}) {
 return <div style={{position:"absolute",left:x,top:y,width:width+32,height:20}}><Icon kind={icon} size={19}/><div style={{position:"absolute",left:27,top:5,width,height:10,borderRadius:3,overflow:"hidden",background:"#bfbdc4"}}><motion.div animate={[{scaleX:0,offset:0},{scaleX:0,offset:delay},{scaleX:1,offset:delay+.18},{scaleX:1,offset:1}]} transition={{ease:"ease-out"}} style={{position:"absolute",inset:0,width:`${value}%`,transformOrigin:"left",overflow:"hidden"}}><Gradient kind={kind}/></motion.div></div></div>;
}
export function GamePanel(){return <div style={{position:"relative",width:886,height:494,border:"1.4px solid #333235",borderRadius:34,overflow:"hidden",background:C.paper}}>
 <div style={{position:"absolute",left:48,right:49,top:28,display:"flex",justifyContent:"space-between",fontSize:15,fontWeight:500}}>{["Weapons","Armor","Skills","Map","Goals","Codex"].map(t=><span key={t}>{t}</span>)}</div>
 <div style={{position:"absolute",left:132,top:12}}><Character/></div>
 <div style={{position:"absolute",left:443,top:109,fontSize:10,letterSpacing:1}}>XP: ◉ 24583&nbsp; ◉ 12355</div><div style={{position:"absolute",right:47,top:109,fontSize:10,letterSpacing:.7}}>HS:43863</div>
 <Skill icon="square" x={443} y={153} width={363} value={85} kind="blue" delay={.16}/><Skill icon="shield" x={443} y={182} width={363} value={60} kind="mixed" delay={.20}/><Skill icon="swords" x={443} y={211} width={97} value={71} kind="teal" delay={.24}/><Skill icon="heart" x={587} y={211} width={97} value={43} kind="mixed" delay={.26}/><Skill icon="hourglass" x={443} y={240} width={97} value={49} kind="blue" delay={.28}/><Skill icon="cube" x={587} y={240} width={97} value={64} kind="teal" delay={.30}/>
 {(["swords","star","swords","cube"] as IconKind[]).map((icon,i)=><div key={i} style={{position:"absolute",left:48,top:216+i*67,display:"flex",alignItems:"center",gap:8}}><div style={{width:36,height:36,position:"relative",overflow:"hidden",borderRadius:"50%",background:`linear-gradient(130deg,${[C.blue,C.blue,C.pink,C.pink][i]},${i%2?C.teal:C.blue})`,display:"grid",placeItems:"center"}}><Icon kind={icon} color={C.paper} size={26}/></div><span style={{fontSize:10,letterSpacing:.5}}>LVL&nbsp; {[9,8,9,7][i]}</span></div>)}
 <div style={{position:"absolute",left:708,top:423}}><Button/></div>
 </div>;}
