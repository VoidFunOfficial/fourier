import { Audio,Canvas,defineProject,Project,Scene,Template,Timeline } from '@fourier-video/sdk/project';
import { SHOTS } from './shots.ts';
export default defineProject(<Project id="mac-mini-m6-film" version="1.0" audioSampleRate={48000}>
 <Canvas width={1920} height={1080} fps={60} background="#f5f5f7" colorSpace="sRGB"/>
 <Timeline>{SHOTS.slice(0,17).map((s,i)=><Scene key={s.id} id={`shot-${s.id}`} {...(i===0?{at:'0f'}:{after:`shot-${SHOTS[i-1]!.id}`})} src={`scenes/${s.id}`} audio={false}/>)}<Template id="ending" after="shot-17-create" src="templates/ending" audio={false}/>
  <Audio id="motion-sfx" at="0f" duration="4500f" src="assets/audio/sfx-master.wav" sourceIn="0f" volume={1}/>
 </Timeline>
</Project>);
