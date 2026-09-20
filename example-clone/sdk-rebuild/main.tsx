import {Audio,Canvas,defineProject,Project,Scene,Timeline} from '@fourier-video/sdk/project';
import { SHOTS, TOTAL_FRAMES } from './shots.ts';
export default defineProject(<Project id="work-play-reference-rebuild" version="1.0" audioSampleRate={48000}>
  <Canvas width={1920} height={1080} fps={60} background="#dfdde0" colorSpace="sRGB"/>
  <Timeline>
    {SHOTS.map((shot,index)=><Scene key={shot.id} id={`shot-${shot.id}`} {...(index===0?{at:'0f'}:{after:`shot-${SHOTS[index-1]!.id}`})} src={`scenes/${shot.id}`} audio={false}/>)}
    <Audio id="film-soundtrack" at="0f" duration={`${TOTAL_FRAMES}f`} src="assets/audio/film-master.wav" sourceIn="0f" volume={1}/>
  </Timeline>
</Project>);
