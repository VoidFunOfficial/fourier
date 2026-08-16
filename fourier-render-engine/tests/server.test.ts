import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequestHandler } from "../src/server.ts";

let directory = "";
const handleRequest = createRequestHandler();

describe("HTTP API", () => {
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "render-api-test-"));
    await mkdir(join(directory, "images"), { recursive: true });
    await Bun.write(join(directory, "images", "placeholder.png"), "asset");
    await Bun.write(
      join(directory, "main.tsx"),
      `import { Canvas, defineProject, Image, Project, Timeline } from "@fourier-video/sdk/project";
export default defineProject(
  <Project id="api-test" version="1.0" audioSampleRate={48000}>
    <Canvas width={64} height={64} fps={10} background="#000000" colorSpace="sRGB" />
    <Timeline>
      <Image id="still" at="0f" duration="10f" src="images/placeholder.png"
        fit="stretch" x={32} y={32} width={64} height={64} layer={0} />
    </Timeline>
  </Project>,
);`,
    );
  });

  afterAll(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  test("健康检查", async () => {
    const response = await handleRequest(new Request("http://local/health"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "ok",
      service: "render-engine",
    });
  });

  test("返回求解后的工程 IR", async () => {
    const response = await handleRequest(new Request("http://local/v1/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        project: join(directory, "main.tsx"),
        validateMedia: false,
      }),
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      valid: true,
      ir: {
        totalFrames: 10,
        project: { id: "api-test" },
        nodes: [
          {
            id: "still",
            startFrame: 0,
            endFrame: 10,
          },
        ],
      },
    });
  });

  test("请求格式错误返回 400", async () => {
    const response = await handleRequest(new Request("http://local/v1/validate", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "{}",
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: "BAD_REQUEST" },
    });
  });
});
