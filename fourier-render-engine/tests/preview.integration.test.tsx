import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderProjectPreview } from "../src/preview.ts";

const suite = Bun.env.RUN_FFMPEG_TESTS === "1" ? describe : describe.skip;
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

suite("Project TSX preview", () => {
  test("main.tsx 生成选中节点的 PNG preview", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fourier-preview-tsx-"));
    temporaryDirectories.push(directory);
    await mkdir(join(directory, "assets"), { recursive: true });
    const source = join(directory, "assets", "red.png");
    const fixture = Bun.spawn([
      "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
      "-f", "lavfi", "-i", "color=c=red:s=32x24", "-frames:v", "1", source,
    ], { stdout: "ignore", stderr: "pipe" });
    const [fixtureExit, fixtureError] = await Promise.all([
      fixture.exited,
      new Response(fixture.stderr).text(),
    ]);
    if (fixtureExit !== 0) throw new Error(fixtureError);

    const entry = join(directory, "main.tsx");
    await Bun.write(entry, `
      import { Canvas, defineProject, Image, Project, Timeline } from "@fourier-video/sdk/project";
      export default defineProject(<Project id="preview-tsx" version="1.0" audioSampleRate={48000}>
        <Canvas width={32} height={24} fps={10} background="#000000" colorSpace="sRGB" />
        <Timeline><Image id="card" at="0f" duration="1f" preview
          src="assets/red.png" fit="stretch" x={16} y={12} width={32} height={24} layer={1} /></Timeline>
      </Project>);
    `);
    const output = join(directory, "preview.png");
    const result = await renderProjectPreview(entry, {
      output,
      anchor: "0f",
      rangeStart: "0f",
      rangeEnd: "1f",
      overwrite: true,
    });
    expect(result).toMatchObject({
      projectId: "preview-tsx",
      anchorFrame: 0,
      rangeStartFrame: 0,
      rangeEndFrame: 1,
      selectedNodeIds: ["card"],
    });
    expect(await Bun.file(output).exists()).toBe(true);
  }, 30_000);
});
