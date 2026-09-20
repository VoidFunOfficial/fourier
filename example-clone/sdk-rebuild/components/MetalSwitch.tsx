import { motion } from '@fourier-video/sdk';
import { FULL, EASE } from './Stage.tsx';
import { Dots, Icon } from './Icons.tsx';

export function MetalSwitch({seconds}:{seconds:number}){
  return <motion.div animate={[{x:180,width:'640px',offset:0},{x:350,width:'550px',offset:.16},{x:370,width:'530px',offset:.52},{x:350,width:'530px',offset:.76},{x:352,width:'530px',offset:1}]} transition={{duration:seconds,ease:'linear',fill:'both'}} style={{position:'absolute',left:0,top:280,height:160,borderRadius:85,background:'linear-gradient(110deg,#202025,#41404d)',boxShadow:'-5px 4px 4px #15141680,2px 3px 4px #9f78833b'}}>
    <div style={{...FULL,borderRadius:'inherit',background:'linear-gradient(105deg,#dfc3d340,transparent 26%,#65739f30 80%,#a2f2df90)',padding:2}}><div style={{height:'100%',width:'100%',borderRadius:85,background:'linear-gradient(100deg,#2b2a2e,#383743)'}}/></div>
    <motion.div animate={[{opacity:0,offset:0},{opacity:.16,offset:.17},{opacity:1,offset:.4},{opacity:1,offset:1}]} transition={{duration:seconds,ease:'linear',fill:'both'}} style={{position:'absolute',inset:2,borderRadius:85,overflow:'hidden',background:'linear-gradient(105deg,#bab9be 0%,#eae9ed 18%,#f7f7f9 46%,#d5d4d9 88%,#c6c5cd 100%)',boxShadow:'inset 2px 1px 2px #ffffffaa,inset -2px -2px 3px #b3b0b9aa'}}>
      <motion.div animate={[{x:420,opacity:.15,offset:0},{x:90,opacity:1,offset:.28},{x:-60,opacity:.35,offset:.53},{x:60,opacity:.4,offset:1}]} transition={{duration:seconds,ease:'ease-in-out',fill:'both'}} style={{position:'absolute',top:-70,width:260,height:310,background:'linear-gradient(90deg,transparent,#ffffff,transparent)',filter:'blur(15px)'}}/>
      <motion.div animate={[{x:160,offset:0},{x:35,offset:.4},{x:5,offset:.73},{x:20,offset:1}]} transition={{duration:seconds,ease:'linear',fill:'both'}} style={{position:'absolute',top:0,bottom:0,right:0,width:88,borderRadius:'0 80px 80px 0',borderRight:'2px solid #fafafa90',background:'linear-gradient(90deg,transparent,#f2f1f680)'}}/>
      <div style={{position:'absolute',left:'49%',top:2,bottom:2,width:2,background:'linear-gradient(transparent,#ffffff66,transparent)'}}/>
    </motion.div>
    <motion.div animate={[{opacity:0,filter:'blur(9px)',offset:0},{opacity:0,filter:'blur(9px)',offset:.1},{opacity:1,filter:'blur(0px)',offset:.38},{opacity:1,filter:'blur(0px)',offset:1}]} transition={{duration:seconds,ease:'linear',fill:'both'}} style={FULL}>
      <div style={{position:'absolute',left:'21%',top:54}}><Icon name="hourglass" size={51} color="#a3a2a7"/></div>
      <div style={{position:'absolute',left:'67%',top:49}}><Dots size={59}/></div>
    </motion.div>
  </motion.div>;
}
