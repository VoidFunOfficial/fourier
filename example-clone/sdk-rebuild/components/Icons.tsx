import { type CSSProperties } from '@fourier-video/sdk';
import cursor from '../assets/vector/cursor.svg';
export type IconName = 'video'|'star'|'contrast'|'film'|'square'|'text'|'cube'|'camera'|'hourglass'|'shield'|'swords'|'heart'|'fist';

export function Icon({name,size=48,color='currentColor',style={}}:{name:IconName;size?:number;color?:string;style?:CSSProperties}) {
  return <svg width={size} height={size} viewBox="0 0 64 64" style={{display:'block',...style}} fill={color}>
    {name==='video'&&<path d="M5 15Q3 15 3 18V46Q3 49 6 49H41Q44 49 44 46V39L59 47Q63 49 63 44V20Q63 16 59 18L44 26V18Q44 15 41 15Z"/>}
    {name==='star'&&<path d="M32 2 40 23 63 24 45 39 51 61 32 48 13 61 19 39 1 24 24 23Z" stroke={color} strokeWidth="1" strokeLinejoin="round"/>}
    {name==='contrast'&&<><circle cx="32" cy="32" r="27" fill="none" stroke={color} strokeWidth="6"/><path d="M52 12A28 28 0 0 1 12 52Z"/></>}
    {name==='film'&&<><path d="M3 4H7V60H3ZM57 4H61V60H57ZM15 4H49V60H15Z"/>{[8,21,34,47].map(y=><path key={y} d={`M5 ${y}H17V${y+5}H5ZM47 ${y}H59V${y+5}H47Z`}/>)}</>}
    {name==='square'&&<rect x="8" y="8" width="48" height="48" rx="3"/>}
    {name==='text'&&<path d="M7 7H57V23H54Q53 11 40 11H38V52Q38 57 46 57V60H18V57Q26 57 26 52V11H24Q11 11 10 23H7Z"/>}
    {name==='cube'&&<path d="M32 3 58 18V47L32 62 6 47V18ZM6 18 32 33 58 18M32 33V62" fill="none" stroke={color} strokeWidth="4" strokeLinejoin="round"/>}
    {name==='camera'&&<path fillRule="evenodd" d="M10 6H54Q58 6 58 10V54Q58 58 54 58H10Q6 58 6 54V10Q6 6 10 6ZM32 15A17 17 0 1 0 32 49A17 17 0 1 0 32 15Z"/>}
    {name==='hourglass'&&<path d="M12 5H52V12L38 30V34L52 52V59H12V52L26 34V30L12 12Z"/>}
    {name==='shield'&&<><path d="M7 6 32 9 57 6V29Q58 47 32 61Q6 47 7 29Z" fill="none" stroke={color} strokeWidth="4"/><path d="M15 14 32 17 49 14V29Q49 42 32 53Q15 42 15 29Z"/></>}
    {name==='swords'&&<path d="M8 3 53 47M56 3 11 47M3 42 22 61M42 61 61 42M2 63 15 50M49 50 62 63" fill="none" stroke={color} strokeWidth="5"/>}
    {name==='heart'&&<path d="M32 60 8 33Q-8 13 11 5Q24 0 32 14Q40 0 53 5Q72 13 56 33Z"/>}
    {name==='fist'&&<path d="M8 3H17V27H21V0H30V25H34V2H43V29H47V10H57V38L39 47V62H22V48L6 37 2 22H10L15 32V16H8Z"/>}
  </svg>;
}

export function Dots({size=48}:{size?:number}) {
  return <svg width={size} height={size} viewBox="0 0 64 64"><circle cx="32" cy="11" r="9" fill="#5caabd"/><circle cx="11" cy="32" r="9" fill="#5a8bdc"/><circle cx="53" cy="32" r="9" fill="#7a81d6"/><circle cx="32" cy="53" r="9" fill="#df6799"/></svg>;
}

export function Cursor({colorful=false,size=58}:{colorful?:boolean;size?:number}) {
  if(!colorful) return <img src={cursor} width={size*1.8} height={size*1.8} style={{display:'block',marginLeft:-size*.56,marginTop:-size*.39,filter:'drop-shadow(5px 9px 8px #44476670)'}}/>;
  return <svg width={size} height={size} viewBox="0 0 64 64" style={{filter:'drop-shadow(5px 9px 7px #526ee478)'}}><path d="M3 3Q1 0 7 2L58 22Q65 25 57 29L35 35 25 60Q22 65 19 57Z" fill="#6878e9"/><path d="M3 3 7 2 40 15 6 19Z" fill="#f76e86"/><path d="M6 19 40 15 58 22 35 35 25 60Z" fill="#5e79e3" opacity=".8"/></svg>;
}
