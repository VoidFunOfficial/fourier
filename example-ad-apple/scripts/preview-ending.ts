import { openArtifact } from '@fourier-video/sdk/testing';
import { resolve } from 'node:path';
import { sceneDirectory } from '../shots.ts';
const root=resolve(import.meta.dir,'..');
const samples=[
 {id:'18-signature',times:[.35,1.05,1.75,2.45,3.15,3.85]},
 {id:'19-all-in',times:[.1,.8,1.6,2.5,3.3,4.1,4.9]},
 {id:'20-credits',times:[.2,.7,1.4,3.9]},
];
for(const sample of samples.filter(s=>process.argv.length<=2||process.argv.slice(2).some(id=>s.id.startsWith(id)))){
 const fixture=await openArtifact(resolve(root,sceneDirectory(sample.id),'Visual.tsx'),{sourceRoot:root,resourceRoots:[root]});
 try{
  for(const seconds of sample.times){
   const frame=await fixture.renderFrame({frame:Math.round(seconds*60)});
   await Bun.write(resolve(root,`review/v4-${sample.id}-${seconds}.png`),frame.png);
  }
  await fixture.assertDeterministic({frames:[6,48,96]});
  console.log(JSON.stringify({scene:sample.id,samples:sample.times,deterministic:true}));
 }finally{await fixture.close();}
}
