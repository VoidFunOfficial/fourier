import { motion, type CSSProperties, type FourierMotionTarget } from '@fourier-video/sdk';
import { FULL, C } from './Stage.tsx';
import { Icon, type IconName } from './Icons.tsx';
import { sonduckMatteBlobFrames } from './reused/matte-motion.ts';

export type Palette = 'video'|'mint'|'coral'|'navy'|'all';
const palettes:Record<Palette,string[]>={video:[C.blue,C.coral,C.blue],mint:['#2d839b','#58b99f','#3b9aab'],coral:[C.coral,C.peach,'#f77b84'],navy:[C.navy,C.blue,'#364f7c'],all:[C.blue,C.coral,C.mint]};

export function ChromaticFill({palette='all',seconds=5,phase=0}:{palette?:Palette;seconds?:number;phase?:number}) {
  const colors=palettes[palette];
  return <div style={{...FULL,overflow:'hidden',borderRadius:'inherit',background:colors[0]}}>
    {colors.map((color,i)=><motion.div key={i} animate={sonduckMatteBlobFrames(i+phase)} transition={{duration:seconds,ease:'ease-in-out',fill:'both'}} style={{position:'absolute',left:`${i*38-18}%`,top:-160+i*48,width:'78%',height:450,borderRadius:'45%',background:color,filter:'blur(32px)',transform:'rotate(-28deg)'}}/>)}
  </div>;
}

export function ColorBar({palette='all',seconds,frames,style={}}:{palette?:Palette;seconds:number;frames?:readonly FourierMotionTarget[];style?:CSSProperties}) {
  return <motion.div {...(frames?{animate:frames}:{})} transition={{duration:seconds,ease:'linear',fill:'both'}} style={{position:'absolute',height:110,width:1200,borderRadius:24,overflow:'hidden',...style}}><ChromaticFill palette={palette} seconds={seconds}/></motion.div>;
}

export function Orb({name,color,size=216}:{name:IconName;color:string;size?:number}) {
  return <div style={{position:'relative',width:size,height:size}}>
    <div style={{position:'absolute',inset:'3%',borderRadius:'50%',background:color,filter:'blur(5px)'}}/>
    <div style={{position:'absolute',inset:'1%',borderRadius:'50%',background:color,transform:'translate(14px,18px)',filter:'blur(18px)',opacity:.66}}/>
    <div style={{position:'absolute',inset:0,borderRadius:'50%',background:`radial-gradient(circle at 32% 28%, ${color} 0%, ${color} 40%, ${color}d0 65%, ${color}00 77%)`}}/>
    <div style={{position:'absolute',left:'50%',top:'50%',transform:'translate(-50%,-50%)'}}><Icon name={name} size={size*.225} color="#fffdfd"/></div>
  </div>;
}
