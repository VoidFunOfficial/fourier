import { motion } from '@fourier-video/sdk';
import { C, FULL, EASE } from './Stage.tsx';
import { ColorBar, ChromaticFill, type Palette } from './Chromatic.tsx';
import { Icon, type IconName } from './Icons.tsx';
import warrior from '../assets/vector/warrior.svg';

function SkillMeter({name,x,y,width,value,palette,delay,seconds}:{name:IconName;x:number;y:number;width:number;value:number;palette:Palette;delay:number;seconds:number}){
  return <div style={{position:'absolute',left:x,top:y,width,height:12}}>
    <Icon name={name} size={21} style={{position:'absolute',left:-28,top:-4}}/>
    <div style={{...FULL,borderRadius:3,background:'#bfbcc5',overflow:'hidden'}}>
      <ColorBar palette={palette} seconds={seconds} frames={[{width:0,offset:0},{width:0,offset:delay},{width:`${value}px`,offset:delay+.18},{width:`${value}px`,offset:1}]} style={{left:0,top:0,height:12,borderRadius:0}}/>
    </div>
  </div>;
}

export function ContinueButton({seconds,click=.88}:{seconds:number;click?:number}){
  return <motion.div animate={[{scale:1,offset:0},{scale:1,offset:click-.028},{scale:.96,offset:click},{scale:1,offset:click+.035},{scale:1,offset:1}]} transition={{duration:seconds,ease:EASE,fill:'both'}} style={{position:'absolute',left:905,top:537,width:126,height:29,borderRadius:5,background:`linear-gradient(100deg,${C.navy},${C.blue})`,color:'white',fontSize:13,display:'grid',placeItems:'center',boxShadow:'inset 0 .5px .5px #7889c5',transformOrigin:'50% 50%'}}>Continue</motion.div>;
}

export function GamePanel({seconds}:{seconds:number}){
  const badgeIcons:IconName[]=['fist','swords','swords','star'];
  return <div style={{...FULL}}>
    <div style={{position:'absolute',left:197,top:112,width:886,height:496,border:'1.35px solid #343237',borderRadius:31,overflow:'hidden',background:C.paper}}/>
    <div style={{position:'absolute',left:235,top:143,width:802,display:'flex',justifyContent:'space-between',fontSize:16}}>{['Weapons','Armor','Skills','Map','Goals','Codex'].map((label,index)=><span key={label} style={{minWidth:index===0?100:55,textAlign:'center'}}>{label}</span>)}</div>
    <img src={warrior} width={410} height={475} style={{position:'absolute',left:330,top:132}}/>
    <div style={{position:'absolute',left:642,top:226,fontSize:11,letterSpacing:.6}}>XP: ◉ 24293 ◉ 12320</div>
    <div style={{position:'absolute',left:980,top:227,fontSize:10}}>HS: 43741</div>
    <SkillMeter name="fist" x={667} y={272} width={364} value={330} palette="navy" delay={.14} seconds={seconds}/>
    <SkillMeter name="shield" x={667} y={301} width={364} value={236} palette="all" delay={.17} seconds={seconds}/>
    <SkillMeter name="swords" x={667} y={330} width={97} value={56} palette="mint" delay={.2} seconds={seconds}/>
    <SkillMeter name="heart" x={813} y={330} width={97} value={45} palette="video" delay={.22} seconds={seconds}/>
    <SkillMeter name="hourglass" x={667} y={359} width={97} value={38} palette="navy" delay={.24} seconds={seconds}/>
    <SkillMeter name="cube" x={813} y={359} width={97} value={51} palette="navy" delay={.26} seconds={seconds}/>
    {badgeIcons.map((name,i)=><div key={i} style={{position:'absolute',left:245,top:332+i*66,width:82,height:36,display:'flex',alignItems:'center',gap:8}}>
      <div style={{position:'relative',width:36,height:36,borderRadius:'50%',overflow:'hidden',flexShrink:0}}><ChromaticFill palette={(['navy','mint','video','coral'] as Palette[])[i]} seconds={seconds}/><Icon name={name} size={26} color="#dfe5e5" style={{position:'absolute',left:5,top:5}}/></div>
      <div style={{fontSize:10,letterSpacing:1,whiteSpace:'nowrap',color:i>1?[C.mint,C.coral][i-2]:C.ink}}>LVL {i===1?8:i===3?7:9}</div>
    </div>)}
    <ContinueButton seconds={seconds}/>
  </div>;
}
