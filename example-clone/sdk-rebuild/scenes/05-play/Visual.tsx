import { defineReact, motion } from '@fourier-video/sdk';
import { C, Stage, FULL, EASE } from '../../components/Stage.tsx';
import { GamePanel } from '../../components/GamePanel.tsx';
import { Cursor } from '../../components/Icons.tsx';

const seconds=133/60;
function PlayScene(){
  const camera=[{scale:.72,x:0,y:0,offset:0},{scale:1,x:0,y:0,offset:.27},{scale:1,x:0,y:0,offset:.60},{scale:3.36,x:-1107,y:-646,offset:.72},{scale:3.36,x:-1107,y:-646,offset:1}];
  return <Stage>
    <motion.div animate={[{opacity:1,offset:0},{opacity:0,offset:.32},{opacity:0,offset:.56},{opacity:0,offset:1}]} transition={{duration:seconds,ease:'linear',fill:'both'}} style={{...FULL,background:C.navy}}/>
    <motion.div animate={[{scale:.72,opacity:1,offset:0},{scale:1,opacity:1,offset:.23},{scale:1.23,opacity:.7,offset:.45},{scale:1.8,opacity:0,offset:.60},{scale:1.8,opacity:0,offset:1}]} transition={{duration:seconds,ease:'linear',fill:'both'}} style={{position:'absolute',left:140,top:70,width:1000,height:580,borderRadius:66,filter:'blur(27px)',background:'#e5e5e5',boxShadow:'0 0 45px 18px #d9f3e7,0 0 90px 38px #6acaab,0 0 135px 75px #4873fa'}}/>
    <motion.div animate={camera.map(frame=>({...frame,easing:EASE}))} transition={{duration:seconds,ease:'linear',fill:'both'}} style={{...FULL,transformOrigin:'640px 360px'}}>
      <motion.div animate={[{opacity:1,offset:0},{opacity:1,offset:.21},{opacity:0,offset:.41},{opacity:0,offset:1}]} transition={{duration:seconds,ease:'linear',fill:'both'}} style={FULL}>
        <svg width={1280} height={720} style={FULL}><path d="M197 -150V870M1083 -150V870M-100 112H1380M-100 608H1380" stroke="#324b6670" strokeWidth="1"/><path d="M197 96V128M181 112H213M1083 96V128M1067 112H1099M197 592V624M181 608H213M1083 592V624M1067 608H1099" stroke="#e8fcf4" strokeWidth="1"/></svg>
      </motion.div>
      <GamePanel seconds={seconds}/>
      <motion.div animate={[
        {x:1335,y:563,scale:.75,rotate:-32,opacity:0,offset:0},
        {x:1335,y:563,scale:.75,rotate:-32,opacity:1,offset:.43},
        {x:1225,y:551,scale:.75,rotate:-28,opacity:1,offset:.48},
        {x:1060,y:572,scale:.75,rotate:-8,opacity:1,offset:.65},
        {x:1002,y:562,scale:.75,rotate:0,opacity:1,offset:.73},
        {x:967,y:553,scale:.75,rotate:0,opacity:1,offset:.85},
        {x:967,y:553,scale:.61,rotate:0,opacity:1,offset:.88},
        {x:967,y:553,scale:.75,rotate:0,opacity:1,offset:.925},
        {x:967,y:553,scale:.75,rotate:0,opacity:1,offset:1}
      ]} transition={{duration:seconds,ease:'linear',fill:'both'}} style={{position:'absolute',left:0,top:0,transformOrigin:'0 0'}}><Cursor colorful size={43}/></motion.div>
    </motion.div>
  </Stage>;
}
export default defineReact({name:'WorkPlayGameInterface',schema:{},component:PlayScene,designPreview:()=>({props:{},composition:{width:1920,height:1080,durationSeconds:3}})});
