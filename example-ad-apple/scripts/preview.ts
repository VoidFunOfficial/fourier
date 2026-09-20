import { openArtifact } from "@fourier-video/sdk/testing";
import { resolve } from "node:path";
import { SHOTS, sceneDirectory } from "../shots";
const root = resolve(import.meta.dir, "..");
const names = process.argv.slice(2);
for (const shot of SHOTS.filter(
  (s) => names.length === 0 || names.some((n) => s.id.startsWith(n)),
)) {
  const fixture = await openArtifact(
    resolve(root, sceneDirectory(shot.id), "Visual.tsx"),
    { sourceRoot: resolve(root, ".."), resourceRoots: [resolve(root, "..")] },
  );
  try {
    const representative = await fixture.renderTime({
      time: {
        numerator: BigInt(Math.round(shot.seconds * 0.56 * 100)),
        denominator: 100n,
      },
    });
    await Bun.write(
      resolve(root, "review", shot.id + ".png"),
      representative.png,
    );
    // Jump to the end, back to the reveal and return to the representative time.
    const end = await fixture.renderFrame({ frame: shot.seconds * 60 - 2 });
    await Bun.write(resolve(root, "review", shot.id + "-end.png"), end.png);
    await fixture.renderFrame({ frame: 15 });
    const again = await fixture.renderTime({ time: representative.time });
    if (again.sha256 !== representative.sha256)
      throw new Error(`${shot.id}: non-deterministic seek`);
    console.log(
      JSON.stringify({
        scene: shot.id,
        sha256: representative.sha256,
        deterministic: true,
        width: representative.width,
        height: representative.height,
      }),
    );
  } finally {
    await fixture.close();
  }
}
