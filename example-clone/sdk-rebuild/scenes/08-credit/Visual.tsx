import { defineReact, motion } from '@fourier-video/sdk';
import { Stage, MONTSERRAT } from '../../components/Stage.tsx';
function CreditScene(){return <Stage dark><motion.div animate={[{scale:1,offset:0},{scale:.98,offset:1}]} transition={{duration:50/60,ease:'linear',fill:'both'}} style={{position:'absolute',left:540,top:342,width:200,height:36,textAlign:'center',fontFamily:MONTSERRAT,fontSize:22,fontWeight:500,letterSpacing:-.9,lineHeight:'30px'}}>yukaji</motion.div></Stage>;}
export default defineReact({name:'WorkPlayOriginalCredit',schema:{},component:CreditScene,designPreview:()=>({props:{},composition:{width:1920,height:1080,durationSeconds:1}})});
