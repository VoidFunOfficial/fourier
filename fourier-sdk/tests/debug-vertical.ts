import { join } from "node:path";
import { openArtifact } from "../src/testing.ts";

const fixture = await openArtifact(join(import.meta.dir, "../example/VerticalChooser.tsx"));
try {
  for (const frame of [40, 66, 67, 68, 69, 70, 71, 72]) {
    const result = await fixture.renderFrame({ frame });
    await Bun.write(`/tmp/vertical-${frame}.png`, result.png);
    console.log(frame, result.time, result.sha256);
  }
} finally {
  await fixture.close();
}
