import { Icon, type IconKind } from "./Icons";
export function ToolDisc({kind,color}: {kind:IconKind;color:string}) {
 return <div style={{width:230,height:230,position:"relative"}}>
   <div style={{position:"absolute",inset:0,background:color,borderRadius:"50%",maskImage:"radial-gradient(ellipse at 34% 30%,black 0%,black 39%,#000d 55%,transparent 75%)",transform:"scale(1.22)",filter:"blur(1px)"}}/>
   <div style={{position:"absolute",left:87,top:84}}><Icon kind={kind} size={54} color="#fff"/></div>
 </div>;
}
