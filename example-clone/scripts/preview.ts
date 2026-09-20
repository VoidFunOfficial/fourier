import { openArtifact } from "@fourier-video/sdk/testing";
import { resolve } from "node:path";
import { SHOTS } from "../shots";
const root=resolve(import.meta.dir,"..");
const wanted=process.argv.slice(2);
let start=0;
for(const shot of SHOTS){
 if(wanted.length&&!wanted.some(s=>shot.id.startsWith(s))){start+=shot.frames;continue;}
 const artifact=await openArtifact(resolve(root,`scenes/${shot.id}/Visual.tsx`),{sourceRoot:root,resourceRoots:[root]});
 try {
  const frames=[0,Math.round(shot.frames*.25),Math.round(shot.frames*.56),shot.frames-1];
  for(const f of frames){const result=await artifact.renderTime({time:{numerator:BigInt(f),denominator:24n}});await Bun.write(resolve(root,`review/${shot.id}-${f}.png`),result.png);}
  await artifact.assertDeterministic({times:[frames[2]!,frames[0]!,frames[3]!,frames[2]!].map(f=>({numerator:BigInt(f),denominator:24n}))});
  console.log(JSON.stringify({scene:shot.id,startFrame:start,frames:shot.frames,previewFrames:frames,deterministic:true}));
 } finally{await artifact.close();}
 start+=shot.frames;
}
