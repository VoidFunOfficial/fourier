import { Audio, Canvas, defineProject, Project, Scene, Timeline } from "@fourier-video/sdk/project";
import { SHOTS, TOTAL_FRAMES, FPS } from "./shots";
export default defineProject(<Project id="work-play-reconstruction" version="1.0" audioSampleRate={48000}>
 <Canvas width={1920} height={1080} fps={FPS} background="#252326" colorSpace="sRGB"/>
 <Timeline>
  {SHOTS.map((shot,i)=><Scene key={shot.id} id={`shot-${shot.id}`} {...(i===0?{at:"0f"}:{after:`shot-${SHOTS[i-1]!.id}`})} src={`scenes/${shot.id}`} audio={false}/>)}
  <Audio id="reference-soundtrack" at="0f" duration={`${TOTAL_FRAMES}f`} src="assets/audio/reference-master.wav" sourceIn="0f" volume={1}/>
 </Timeline>
</Project>);
