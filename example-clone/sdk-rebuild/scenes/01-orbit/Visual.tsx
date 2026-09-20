import { defineReact, motion, type FourierMotionTarget } from '@fourier-video/sdk';
import { C, Stage } from '../../components/Stage.tsx';
import { Orb } from '../../components/Chromatic.tsx';
import { type IconName } from '../../components/Icons.tsx';

const seconds=190/60;
const tools: {name:IconName;color:string;x:number;y:number;size:number}[]=[
  {name:'video',color:C.blue,x:783,y:165,size:213},
  {name:'star',color:C.mint,x:626,y:223,size:186},
  {name:'contrast',color:C.coral,x:482,y:345,size:187},
  {name:'film',color:C.blue,x:412,y:485,size:190},
  {name:'square',color:C.navy,x:472,y:573,size:217},
  {name:'text',color:C.mint,x:657,y:533,size:240},
  {name:'cube',color:C.peach,x:843,y:370,size:247},
  {name:'camera',color:C.coral,x:887,y:216,size:234},
];

// Tool-centre observations from the reference, in the local 1280 × 720 canvas.
// Each row is a visual pose; FourierMotion interpolates independently per orb.
const poses = [
  {time:0, centres:[[640,360],[640,360],[640,360],[640,360],[640,360],[640,360],[640,360],[640,360]], scale:.015, opacity:0, blur:65},
  {time:.24, centres:[[640,380],[640,360],[650,350],[630,395],[648,374],[628,391],[660,344],[638,369]], scale:.2, opacity:.65, blur:26},
  {time:.5, centres:[[544,552],[689,490],[780,373],[788,325],[740,183],[624,235],[525,338],[484,467]], scale:.74, opacity:.8, blur:10},
  {time:.75, centres:[[519,281],[410,474],[420,593],[576,602],[804,436],[918,218],[850,116],[690,153]], scale:.91, opacity:1, blur:1.2},
  {time:1, centres:tools.map(tool=>[tool.x,tool.y]), scale:1, opacity:1, blur:0},
  {time:1.25, centres:[[882,432],[822,341],[697,289],[546,272],[428,300],[432,400],[570,478],[760,492]], scale:.95, opacity:1, blur:.5},
  {time:1.5, centres:[[702,528],[730,552],[683,419],[642,306],[610,220],[528,168],[556,202],[604,376]], scale:1.02, opacity:1, blur:.5},
  {time:1.75, centres:[[818,336],[826,523],[822,594],[770,528],[706,370],[654,226],[747,90],[798,159]], scale:1.13, opacity:1, blur:.8},
  {time:2, centres:[[838,206],[860,390],[860,564],[832,660],[804,553],[789,454],[770,119],[808,129]], scale:1.16, opacity:1, blur:.6},
  {time:2.25, centres:[[529,122],[526,274],[542,428],[550,567],[555,580],[556,570],[545,184],[552,275]], scale:1.16, opacity:1, blur:0},
  {time:2.48, centres:[[650,95],[570,270],[510,438],[458,609],[555,580],[556,570],[545,184],[552,275]], scale:2.04, opacity:1, blur:1},
  {time:2.74, centres:[[650,95],[570,270],[510,438],[458,609],[555,580],[556,570],[545,184],[552,275]], scale:2.04, opacity:1, blur:1},
  {time:3.04, centres:[[275,125],[275,281],[275,437],[275,593],[275,593],[275,593],[275,593],[275,593]], scale:.8, opacity:1, blur:0},
  {time:seconds, centres:[[275,125],[275,281],[275,437],[275,593],[275,593],[275,593],[275,593],[275,593]], scale:.72, opacity:1, blur:1},
];
function orbFrames(index:number): FourierMotionTarget[] {
  const item=tools[index]!;
  const sampled=Array.from({length:136},(_,frame)=>frame/60);
  const result:FourierMotionTarget[]=sampled.map(time=>{
    let right=1;
    while(right<poses.length-1&&poses[right]!.time<time)right++;
    const left=right-1,a=poses[left]!,b=poses[right]!;
    const prev=poses[Math.max(0,left-1)]!,next=poses[Math.min(poses.length-1,right+1)]!;
    const u=(time-a.time)/(b.time-a.time),dt=b.time-a.time;
    // Cubic Hermite interpolation preserves measured poses and smooth velocity.
    const coordinate=(axis:number)=>{
      const av=a.centres[index]![axis]!,bv=b.centres[index]![axis]!;
      const va=(b.centres[index]![axis]!-prev.centres[index]![axis]!)/(b.time-prev.time);
      const vb=(next.centres[index]![axis]!-a.centres[index]![axis]!)/(next.time-a.time);
      return (2*u*u*u-3*u*u+1)*av+(u*u*u-2*u*u+u)*dt*va+(-2*u*u*u+3*u*u)*bv+(u*u*u-u*u)*dt*vb;
    };
    const opacityA=index>3&&a.time>=2.25?0:a.opacity;
    const opacityB=index>3&&b.time>=2.25?0:b.opacity;
    const order=time<.9?[3,1,2,4,8,9,10,11]:time<1.4?[6,5,8,2,3,4,7,6]:time<1.7?[12,10,3,2,1,6,8,11]:[9,10,11,2,1,3,4,8];
    return {x:coordinate(0)-item.size/2,y:coordinate(1)-item.size/2,scale:a.scale+(b.scale-a.scale)*u,opacity:opacityA+(opacityB-opacityA)*u,filter:`blur(${a.blur+(b.blur-a.blur)*u}px)`,zIndex:order[index],offset:time/seconds};
  });
  for(const pose of poses.filter(p=>p.time>2.25)){
    const [x,y]=pose.centres[index]!;
    result.push({x:x!-item.size/2,y:y!-item.size/2,scale:pose.scale,opacity:index>3?0:1,filter:`blur(${index===2?0:pose.blur}px)`,zIndex:[9,10,11,2,1,3,4,8][index],offset:pose.time/seconds,easing:pose.time>=2.74?'cubic-bezier(.65,0,.2,1)':'cubic-bezier(.15,.85,.3,1)'});
  }
  return result;
}

function OrbitScene(){
  return <Stage>
    <motion.div animate={[{scale:1.4,opacity:0,filter:'blur(80px)',offset:0},{scale:1,opacity:.75,filter:'blur(76px)',offset:.06},{scale:.9,opacity:.7,filter:'blur(60px)',offset:.14},{scale:1.3,opacity:.5,filter:'blur(50px)',offset:.235},{scale:1.3,opacity:0,filter:'blur(50px)',offset:.31},{opacity:0,offset:1}]} transition={{duration:seconds,ease:'linear',fill:'both'}} style={{position:'absolute',left:325,top:45,width:630,height:630,borderRadius:'50%',background:`radial-gradient(circle,${C.mint} 0 15%,${C.navy} 40%,${C.blue} 60%,transparent 72%)`}}/>
    {[0,1,3,4,5,7,6,2].map(i=><motion.div key={i} animate={orbFrames(i)} transition={{duration:seconds,ease:'linear',fill:'both'}} style={{position:'absolute',left:0,top:0,width:tools[i]!.size,height:tools[i]!.size,transformOrigin:'50% 50%'}}><Orb {...tools[i]!}/>{i===3&&<motion.div animate={[{opacity:0,offset:0},{opacity:0,offset:2.1/seconds},{opacity:1,offset:2.27/seconds},{opacity:1,offset:1}]} transition={{duration:seconds,ease:'linear',fill:'both'}} style={{position:'absolute',inset:0}}><Orb {...tools[i]!} color={C.navy}/></motion.div>}</motion.div>)}
  </Stage>;
}

export default defineReact({name:'WorkPlayOrbit',schema:{},component:OrbitScene,designPreview:()=>({props:{},composition:{width:1920,height:1080,durationSeconds:4}})});
