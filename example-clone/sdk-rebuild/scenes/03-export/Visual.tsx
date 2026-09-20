import { defineReact, motion } from '@fourier-video/sdk';
import { Stage, FULL, C } from '../../components/Stage.tsx';
import { ChromaticFill } from '../../components/Chromatic.tsx';

const seconds=165/60;
const percentStops=[[0,0],[.375,0],[.5,2],[.75,32],[.875,57],[1,78],[1.0833,85],[1.25,92],[1.5,97],[1.7083,100],[2.75,100]];

function percentTime(value:number){
  for(let i=1;i<percentStops.length;i++){
    const a=percentStops[i-1]!,b=percentStops[i]!;
    if(value<=b[1]!)return a[0]!+(b[0]!-a[0]!)*(value-a[1]!)/(b[1]!-a[1]!);
  }
  return seconds;
}

function ExportScene(){
  return <Stage dark>
    <motion.div animate={[
      {x:0,scale:1,offset:0},{x:0,scale:1,offset:.29},{x:-60,scale:1,offset:.382},
      {x:-440,scale:7.6,offset:.39394},{x:-372,scale:7.6,offset:.53},{x:-390,scale:7.6,offset:.63},
      {x:-305,scale:7.6,offset:.89},{x:-310,scale:7.6,offset:1}
    ]} transition={{duration:seconds,ease:'linear',fill:'both'}} style={{...FULL,transformOrigin:'1012px 360px'}}>
      <motion.div animate={[{height:'62px',y:0,offset:0},{height:'20px',y:21,offset:.095},{height:'20px',y:21,offset:1}]} transition={{duration:seconds,ease:'cubic-bezier(.2,.9,.3,1)',fill:'both'}} style={{position:'absolute',left:195,top:329,width:817,borderRadius:40,overflow:'hidden',background:'#f2f2f3',boxShadow:'0 .5px 1px #ffffffa0'}}>
        <motion.div animate={[{opacity:0,offset:0},{opacity:0,offset:.38},{opacity:1,offset:.394},{opacity:1,offset:1}]} transition={{duration:seconds,ease:'linear',fill:'both'}} style={{...FULL,background:'#e7d4d1'}}/>
        <motion.div animate={percentStops.map(([t,p])=>({width:`${p}%`,offset:t!/seconds}))} transition={{duration:seconds,ease:'linear',fill:'both'}} style={{...FULL,overflow:'hidden',borderRadius:'inherit',filter:'blur(2.6px)'}}><div style={{...FULL,width:817}}><ChromaticFill palette="all" seconds={seconds}/><motion.div animate={[{opacity:0,backgroundPosition:'0px 0px',offset:0},{opacity:0,backgroundPosition:'0px 0px',offset:.38},{opacity:1,backgroundPosition:'0px 0px',offset:.394},{opacity:1,backgroundPosition:'240px 30px',offset:1}]} transition={{duration:seconds,ease:'linear',fill:'both'}} style={{...FULL,backgroundImage:'repeating-linear-gradient(32deg,#4f71dd 0px,#4f71dd 24px,#6cc0ac 46px,#fe9b90 60px,#f86780 81px,#5679e4 112px)',backgroundSize:'224px 90px'}}/></div></motion.div>
        <motion.div animate={[{opacity:0,offset:0},{opacity:0,offset:.87},{opacity:.82,offset:1}]} transition={{duration:seconds,ease:'linear',fill:'both'}} style={{...FULL,background:'linear-gradient(105deg,#2b2d38,#373443)',borderRadius:'inherit'}}/>
        <div style={{...FULL,borderRadius:'inherit',boxShadow:'inset 0 .6px .7px #ffffff80, inset 0 -.6px .8px #5f5b6870'}}/>
      </motion.div>
      <motion.div animate={[{opacity:1,filter:'blur(0px)',offset:0},{opacity:1,filter:'blur(0px)',offset:.9},{opacity:0,filter:'blur(3px)',offset:1}]} transition={{duration:seconds,ease:'linear',fill:'both'}} style={{position:'absolute',left:1028,top:351,width:65,height:44,color:C.paper,fontSize:17,lineHeight:'23px',fontVariantNumeric:'tabular-nums',letterSpacing:.15}}>
        {Array.from({length:101},(_,n)=>{
          const start=n===0?0:percentTime(n)/seconds;
          const end=n===100?1:percentTime(n+1)/seconds;
          return <motion.div key={n} animate={[{opacity:0,offset:0},{opacity:0,offset:Math.max(0,start-.00001)},{opacity:1,offset:start},{opacity:1,offset:Math.max(start,end-.00001)},{opacity:n===100?1:0,offset:end},{opacity:n===100?1:0,offset:1}]} transition={{duration:seconds,ease:'linear',fill:'both'}} style={{...FULL,whiteSpace:'nowrap'}}>{n}{n<90?' ':''}%</motion.div>;
        })}
      </motion.div>
    </motion.div>
  </Stage>;
}
export default defineReact({name:'WorkPlayExport',schema:{},component:ExportScene,designPreview:()=>({props:{},composition:{width:1920,height:1080,durationSeconds:3}})});
