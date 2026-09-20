import { Canvas, defineProject, Project, ReactLayer, Timeline } from "@fourier-video/sdk/project";
export default defineProject(<Project id="clone-03-export" version="1.0" audioSampleRate={48000}>
 <Canvas width={1920} height={1080} fps={24} background="#252326" colorSpace="sRGB"/>
 <Timeline><ReactLayer id="visual" preview at="0f" duration="66f" component="Visual.tsx" x={960} y={540} width={1920} height={1080} layer={1}/></Timeline>
</Project>);
