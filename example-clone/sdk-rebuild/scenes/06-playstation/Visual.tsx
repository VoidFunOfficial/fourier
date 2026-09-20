import { defineReact, motion } from '@fourier-video/sdk';
import { Stage } from '../../components/Stage.tsx';
import playstation from '../../assets/vector/playstation.svg';
function PlayStationScene(){return <Stage dark><motion.img src={playstation} animate={[{scale:1.05,offset:0},{scale:.98,offset:.28},{scale:.9,offset:1}]} transition={{duration:1,ease:'cubic-bezier(.15,.7,.3,1)',fill:'both'}} style={{position:'absolute',left:549,top:287,width:182,height:143}}/></Stage>;}
export default defineReact({name:'WorkPlayPlayStationMark',schema:{},component:PlayStationScene,designPreview:()=>({props:{},composition:{width:1920,height:1080,durationSeconds:1}})});
