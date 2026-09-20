import { Canvas, defineTemplate, Project, Scene, Timeline } from '@fourier-video/sdk/project';
const ENDING = ['18-signature', '19-all-in', '20-credits'] as const;
export default defineTemplate({ schema: {}, render: () => <Project id="mac-mini-ending" version="1.0" audioSampleRate={48000}>
 <Canvas width={1920} height={1080} fps={60} background="#f5f5f7" colorSpace="sRGB"/>
 <Timeline>{ENDING.map((id,index) => <Scene key={id} id={`shot-${id}`} {...(index === 0 ? {at:'0f'} : {after:`shot-${ENDING[index-1]!}`})} src={`scenes/${id}`} audio={false}/>)}</Timeline>
</Project> });
