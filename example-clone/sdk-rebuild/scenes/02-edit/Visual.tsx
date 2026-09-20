import { defineReact, motion, type FourierMotionTarget } from '@fourier-video/sdk';
import { C, Stage, FULL, EASE } from '../../components/Stage.tsx';
import { ColorBar, Orb, type Palette } from '../../components/Chromatic.tsx';
import { Cursor, Icon, type IconName } from '../../components/Icons.tsx';

const seconds=305/60;
// Scene-local lane geometry measured from the reference; source origin is 3 1/6 s.
const times=[0,.083,.333,.583,.833,1.133,1.333,1.583,1.833,2.083,2.333,2.583,2.833,3.083,3.333,3.583,4.083,4.583,4.833,5.083333];
const ys=[
  [70,70,70,70,70,70,70,50,-86,-86,-86,15,42,42,-95,-150,-150,-150,-130,-88],
  [226,226,226,226,226,226,226,208,70,70,70,171,198,198,198,198,198,198,203,212],
  [226,226,226,226,226,226,226,226,226,304,226,328,354,354,354,354,354,354,352,346],
  [382,382,382,382,382,382,382,382,382,382,382,484,511,511,511,511,511,511,502,482],
  [382,382,382,382,382,382,382,382,382,461,539,640,668,668,668,668,668,668,652,617],
  [539,539,539,539,539,539,539,539,539,617,696,797,825,825,116,42,42,42,52,77],
];
const palettes:Palette[]=['video','mint','mint','mint','coral','navy'];
const names:IconName[]=['video','star','star','star','contrast','film'];

function rowFrames(row:number):FourierMotionTarget[]{
  return times.map((t,j)=>{
    let x=220,w=1300,opacity=1;
    if(row===1){x=t<1.583?220:t<1.833?220+(t-1.583)/.25*150:t<2.083?370:t<2.333?370+(t-2.083)/.25*148:518;w=t<1.133?1300:t<1.333?1300-(t-1.133)/.2*714:t<1.833?586-(t-1.333)/.5*60:526;}
    if(row===2){x=t<2.083?220:t<2.333?220+(t-2.083)/.25*150:370;w=526;opacity=t<1.5?0:1;}
    if(row===3){w=526;opacity=t<2.03?0:1;}
    if(t<.833 && [0,1,4,5].includes(row)){w=t<=.333?110:t<=.583?110+(t-.333)/.25*[55,100,0,0,165,260][row]!:Math.min(1300,220+(t-.583)/.25*1080);}
    const initialHeight=row===0?12:row===1?32:row===4?64:84;
    const h=t<.333?initialHeight+(110-initialHeight)*t/.333:110;
    return {x,y:ys[row]![j]!,width:`${w}px`,height:`${h}px`,opacity,borderRadius:24,offset:t/seconds};
  });
}

function EditingScene(){
  return <Stage>
    <motion.div animate={[{scaleY:1,offset:0},{scaleY:1,offset:.965},{scaleY:.82,offset:1}]} transition={{duration:seconds,ease:'linear',fill:'both'}} style={{...FULL,transformOrigin:'50% 50%'}}>
      {ys.map((_,row)=><motion.div key={row} animate={rowFrames(row)} transition={{duration:seconds,ease:'linear',fill:'both'}} style={{position:'absolute',left:0,top:0}}>
        <ColorBar palette={palettes[row]} seconds={seconds} style={{inset:0,width:'100%',height:'100%'}}/>
        <motion.div animate={[{scale:.52,x:44,opacity:0,offset:0},{scale:.6,x:44,opacity:1,offset:.025},{scale:.6,x:44,opacity:1,offset:.075},{scale:1,x:0,opacity:1,offset:.16},{scale:1,x:0,opacity:1,offset:1}]} transition={{duration:seconds,ease:EASE,fill:'both'}} style={{position:'absolute',left:-145,top:8,width:92,height:92}}>
          {row===5?<><motion.div animate={[{opacity:1,offset:0},{opacity:1,offset:.605},{opacity:0,offset:.675},{opacity:0,offset:1}]} transition={{duration:seconds,ease:'linear',fill:'both'}}><Icon name="film" size={92}/></motion.div><motion.div animate={[{opacity:0,offset:0},{opacity:0,offset:.605},{opacity:1,offset:.675},{opacity:1,offset:1}]} transition={{duration:seconds,ease:'linear',fill:'both'}} style={FULL}><Icon name="cube" size={92}/></motion.div></>:<Icon name={names[row]!} size={92}/>}
        </motion.div>
      </motion.div>)}
    </motion.div>
    {(['video','star','contrast','film'] as IconName[]).map((name,i)=><motion.div key={name} animate={[{opacity:1,scale:.72,offset:0},{opacity:0,scale:.6,offset:.048+i*.008},{opacity:0,offset:1}]} transition={{duration:seconds,ease:'linear',fill:'both'}} style={{position:'absolute',left:167,top:17+i*156}}><Orb name={name} color={[C.blue,C.mint,C.coral,C.navy][i]!}/></motion.div>)}
    <motion.div animate={[
      {x:1470,y:290,opacity:0,offset:0},{x:1470,y:290,opacity:0,offset:.205},{x:1240,y:282,opacity:1,offset:.23},
      {x:800,y:282,opacity:1,offset:.263},{x:747,y:282,opacity:1,offset:.31},{x:892,y:152,opacity:1,offset:.36},
      {x:892,y:152,opacity:1,offset:.4},{x:1044,y:154,opacity:1,offset:.46},{x:1044,y:278,opacity:1,offset:.55},
      {x:465,y:114,opacity:1,offset:.60},{x:382,y:108,opacity:1,offset:.66},{x:386,y:112,opacity:1,offset:.73},
      {x:386,y:112,opacity:0,offset:.76},{x:386,y:112,opacity:0,offset:1}
    ]} transition={{duration:seconds,ease:'linear',fill:'both'}} style={{position:'absolute',left:0,top:0}}><Cursor size={57}/></motion.div>
    <motion.div animate={[{x:74,opacity:0,offset:0},{x:74,opacity:0,offset:.791},{x:74,opacity:1,offset:.798},{x:1410,opacity:1,offset:.93},{x:1410,opacity:0,offset:.95},{x:1410,opacity:0,offset:1}]} transition={{duration:seconds,ease:'linear',fill:'both'}} style={{position:'absolute',left:0,top:0,height:720,width:3,background:'#f5768b'}}/>
  </Stage>;
}
export default defineReact({name:'WorkPlayEditing',schema:{},component:EditingScene,designPreview:()=>({props:{},composition:{width:1920,height:1080,durationSeconds:6}})});
