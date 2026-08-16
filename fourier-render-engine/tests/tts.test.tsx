import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadProject } from "../src/project-compiler.ts";

const projectSource = `
import { Canvas, defineProject, Project, Subtitle, Timeline } from "@fourier-video/sdk/project";
export default defineProject(
  <Project id="tts-load-test" version="1.0" audioSampleRate={48000}>
    <Canvas width={320} height={180} fps={30} background="#000000" colorSpace="sRGB" />
    <Timeline>
      <Subtitle id="first" at="0f" content="第一句" tts={{}}
        x={160} y={150} width={280} height={40} layer={2}
        font="fonts/test.ttf" fontSize={24} lineHeight={1.2} color="#FFFFFF" align="center" />
      <Subtitle id="second" after="first" content="第二句" tts={{}}
        x={160} y={150} width={280} height={40} layer={2}
        font="fonts/test.ttf" fontSize={24} lineHeight={1.2} color="#FFFFFF" align="center" />
    </Timeline>
  </Project>,
);
`;

describe("TSX TTS 预处理与缓存", () => {
  test("通过 HTTP 批量合成后用缓存求解连续字幕时间线", async () => {
    const directory = await mkdtemp(join(tmpdir(), "render-tts-test-"));
    let requestCount = 0;
    let requestBody: Record<string, unknown> | undefined;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (_input, init) => {
      requestCount++;
      const body = JSON.parse(String(init?.body)) as {
        items: Array<{ id: string; outputPath: string }>;
      };
      requestBody = body;
      const items = [];
      for (const [index, item] of body.items.entries()) {
        await Bun.write(item.outputPath, new Uint8Array([82, 73, 70, 70]));
        const samples = index === 0 ? 48_000 : 24_001;
        items.push({
          id: item.id,
          outputPath: item.outputPath,
          samples,
          sampleRate: 48_000,
          durationSeconds: samples / 48_000,
        });
      }
      return Response.json({ items });
    }) as typeof fetch;
    try {
      const projectPath = join(directory, "main.tsx");
      await Bun.write(projectPath, projectSource);
      const tts = { baseUrl: "http://tts.test" };
      const firstLoad = await loadProject(projectPath, {
        validateAssets: false,
        tts,
      });
      expect(firstLoad.nodes.map((node) => ({
        id: node.id,
        start: node.startFrame,
        end: node.endFrame,
      }))).toEqual([
        { id: "first", start: 0, end: 30 },
        { id: "second", start: 30, end: 46 },
      ]);
      expect(requestCount).toBe(1);
      expect(requestBody).not.toHaveProperty("modelPath");
      expect(requestBody?.items).toEqual([
        expect.not.objectContaining({ style: expect.anything() }),
        expect.not.objectContaining({ style: expect.anything() }),
      ]);

      globalThis.fetch = (async () => {
        throw new Error("HTTP should not be called on a cache hit");
      }) as unknown as typeof fetch;
      const cachedLoad = await loadProject(projectPath, {
        validateAssets: false,
        tts,
      });
      expect(cachedLoad.totalFrames).toBe(46);
      expect(requestCount).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
      await rm(directory, { recursive: true, force: true });
    }
  });
});
