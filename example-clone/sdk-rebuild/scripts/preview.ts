import { openArtifact } from '@fourier-video/sdk/testing';
import { resolve } from 'node:path';
import { SHOTS } from '../shots.ts';
const root=resolve(import.meta.dir,'..');
const selected=process.argv.slice(2);
for(const shot of SHOTS.filter(s=>!selected.length||selected.some(n=>s.id.startsWith(n)))){
  const fixture=await openArtifact(resolve(root,'scenes',shot.id,'Visual.tsx'),{sourceRoot:root,resourceRoots:[root]});
  try{
    const samples=shot.id==='01-orbit'?[0,15,30,45,60,75,90,105,120,135,150,180,189]:[0,Math.round(shot.sample*60),shot.frames-1];
    const result=[];
    for(const frame of samples){
      const sample=await fixture.renderFrame({frame});
      await Bun.write(resolve(root,'review',`${shot.id}-${frame}.png`),sample.png);
      result.push({frame,sha256:sample.sha256,width:sample.width,height:sample.height});
    }
    // Verify non-monotonic seeks, including a full jump backward from the end.
    for(const expected of result.slice().reverse()){
      const actual=await fixture.renderFrame({frame:expected.frame});
      if(actual.sha256!==expected.sha256)throw new Error(`${shot.id}: seek mismatch at ${expected.frame}`);
    }
    await Bun.write(resolve(root,'review',`${shot.id}-verification.json`),JSON.stringify({scene:shot.id,kind:fixture.kind,deterministic:true,samples:result},null,2));
    console.log(JSON.stringify({scene:shot.id,deterministic:true,samples}));
  }finally{await fixture.close();}
}
