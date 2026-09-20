import { defineReact } from '@fourier-video/sdk';
import { Stage } from '../../components/Stage.tsx';
import { MetalSwitch } from '../../components/MetalSwitch.tsx';
function SwitchScene(){return <Stage dark><MetalSwitch seconds={85/60}/></Stage>;}
export default defineReact({name:'WorkPlaySwitch',schema:{},component:SwitchScene,designPreview:()=>({props:{},composition:{width:1920,height:1080,durationSeconds:2}})});
