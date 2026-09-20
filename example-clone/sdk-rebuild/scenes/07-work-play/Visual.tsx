import { defineReact, motion } from '@fourier-video/sdk';
import { Stage, FULL } from '../../components/Stage.tsx';
import { Dots } from '../../components/Icons.tsx';
function WorkPlayScene(){return <Stage dark><motion.div animate={[{scale:1.03,offset:0},{scale:1,offset:.22},{scale:.955,offset:1}]} transition={{duration:155/60,ease:'linear',fill:'both'}} style={{...FULL,transformOrigin:'640px 360px'}}>
  <div style={{position:'absolute',left:489,top:331,width:112,textAlign:'right',fontSize:40,lineHeight:'52px',letterSpacing:.1}}>Work</div>
  <div style={{position:'absolute',left:616,top:334}}><Dots size={48}/></div>
  <div style={{position:'absolute',left:690,top:331,fontSize:40,lineHeight:'52px',letterSpacing:.1}}>Play</div>
</motion.div></Stage>;}
export default defineReact({name:'WorkPlaySignature',schema:{},component:WorkPlayScene,designPreview:()=>({props:{},composition:{width:1920,height:1080,durationSeconds:3}})});
