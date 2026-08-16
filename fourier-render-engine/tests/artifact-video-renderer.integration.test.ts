import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderVisualArtifactVideo } from "../src/artifact-video-renderer.ts";

const directories: string[] = [];
const run = Bun.env.RUN_DOM_TESTS === "1" && Bun.env.RUN_FFMPEG_TESTS === "1";
const describeIntegration = run ? describe : describe.skip;

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })));
});

describeIntegration("Render Engine artifact MP4", () => {
  test("通过确定性 DOM timeline 渲染并编码 H.264 MP4", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fourier-artifact-video-test-"));
    directories.push(directory);
    const output = join(directory, "preview.mp4");

    const result = await renderVisualArtifactVideo({
      entryPath: join(import.meta.dir, "components/DomTimelinePanel.tsx"),
    }, { output, crf: 30, preset: "ultrafast", domPages: 3 });

    expect(result).toMatchObject({
      output,
      width: 64,
      height: 64,
      fps: 60,
      totalFrames: 60,
      durationSeconds: 1,
    });
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
    const bytes = await readFile(output);
    expect(bytes.byteLength).toBe(result.byteLength);
    expect(bytes.subarray(4, 8).toString()).toBe("ftyp");

    const probe = Bun.spawn([
      "ffprobe",
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=codec_name,pix_fmt,width,height,nb_frames",
      "-of", "json",
      output,
    ], { stdout: "pipe", stderr: "pipe" });
    const [exitCode, probeText, probeError] = await Promise.all([
      probe.exited,
      new Response(probe.stdout).text(),
      new Response(probe.stderr).text(),
    ]);
    expect(probeError).toBe("");
    expect(exitCode).toBe(0);
    const stream = JSON.parse(probeText).streams[0];
    expect(stream).toEqual({
      codec_name: "h264",
      width: 64,
      height: 64,
      pix_fmt: "yuv420p",
      nb_frames: "60",
    });
  }, 30_000);
});
