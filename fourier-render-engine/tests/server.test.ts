import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequestHandler, startServer } from "../src/server.ts";

let directory = "";
let handleRequest: ReturnType<typeof createRequestHandler>;

async function waitForJob(
  handler: ReturnType<typeof createRequestHandler>,
  id: string,
  expected: string,
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + 10_000;
  for (;;) {
    const response = await handler(new Request(`http://local/v1/jobs/${id}`));
    const value = await response.json() as Record<string, unknown>;
    if (value.status === expected) return value;
    if (Date.now() >= deadline) throw new Error(`job ${id} did not reach ${expected}: ${JSON.stringify(value)}`);
    await Bun.sleep(25);
  }
}

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
    handleRequest = createRequestHandler({
      projectRoots: [directory],
      outputRoots: [directory],
    });
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
    const payload = await response.json();
    expect(response.status, JSON.stringify(payload)).toBe(200);
    expect(payload).toMatchObject({
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

  test("远程监听缺少 TLS/token/roots 时在 bind 前 fail closed", () => {
    expect(() => startServer({ hostname: "0.0.0.0", port: 0 })).toThrow(
      "非 loopback Server 必须配置",
    );
  });

  test("安全 limits 只能收紧，不能突破硬上限", () => {
    expect(() => createRequestHandler({
      projectRoots: [directory],
      outputRoots: [directory],
      limits: { bodyBytes: 64 * 1024 + 1 },
    })).toThrow("bodyBytes");
    expect(() => createRequestHandler({
      projectRoots: [directory],
      outputRoots: [directory],
      limits: { renderConcurrency: 2 },
    })).toThrow("renderConcurrency");
  });

  test("Bearer、Origin、未知字段与路径根使用稳定 HTTP 错误", async () => {
    const remote = createRequestHandler({
      projectRoots: [directory],
      outputRoots: [directory],
      remote: {
        enabled: true,
        bearerToken: "01234567890123456789012345678901",
        tls: { cert: "unused", key: "unused" },
      },
    });
    const missing = await remote(new Request("https://local/v1/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project: join(directory, "main.tsx") }),
    }));
    expect(missing.status).toBe(401);
    expect(await missing.json()).toMatchObject({ error: { code: "AUTH_REQUIRED" } });

    const invalid = await remote(new Request("https://local/v1/validate", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer wrong" },
      body: JSON.stringify({ project: join(directory, "main.tsx") }),
    }));
    expect(invalid.status).toBe(403);
    expect(await invalid.json()).toMatchObject({ error: { code: "AUTH_INVALID" } });

    const forbiddenOrigin = await handleRequest(new Request("http://local/v1/validate", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://evil.invalid" },
      body: JSON.stringify({ project: join(directory, "main.tsx") }),
    }));
    expect(forbiddenOrigin.status).toBe(403);

    const unknown = await handleRequest(new Request("http://local/v1/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project: join(directory, "main.tsx"), surprise: true }),
    }));
    expect(unknown.status).toBe(400);

    const outside = await handleRequest(new Request("http://local/v1/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project: import.meta.path }),
    }));
    expect(outside.status).toBe(403);
    expect(await outside.json()).toMatchObject({ error: { code: "PROJECT_PATH_NOT_ALLOWED" } });
  });

  test("chunked body 超过 64 KiB 返回 413", async () => {
    const response = await handleRequest(new Request("http://local/v1/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project: join(directory, "main.tsx"), padding: "x".repeat(70_000) }),
    }));
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: { code: "PAYLOAD_TOO_LARGE" } });
  });

  test("拒绝压缩体、输出 symlink 与默认 overwrite", async () => {
    const compressed = await handleRequest(new Request("http://local/v1/validate", {
      method: "POST",
      headers: { "content-type": "application/json", "content-encoding": "gzip" },
      body: "{}",
    }));
    expect(compressed.status).toBe(400);

    const target = join(directory, "existing.mp4");
    const linked = join(directory, "linked.mp4");
    await Bun.write(target, "existing");
    await symlink(target, linked);
    for (const output of [target, linked]) {
      const response = await handleRequest(new Request("http://local/v1/render", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ project: join(directory, "main.tsx"), output }),
      }));
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ error: { code: "OUTPUT_PATH_NOT_ALLOWED" } });
    }
  });

  test("render 队列饱和、多 handler 隔离与 cancelling->cancelled", async () => {
    const stuckDirectory = join(directory, "stuck");
    await mkdir(stuckDirectory, { recursive: true });
    const stuckProject = join(stuckDirectory, "main.tsx");
    const validProjectSource = await Bun.file(join(directory, "main.tsx")).text();
    await Bun.write(stuckProject, `while (true) {}\n${validProjectSource}`);
    const firstHandler = createRequestHandler({
      projectRoots: [directory],
      outputRoots: [directory],
    });
    const secondHandler = createRequestHandler({
      projectRoots: [directory],
      outputRoots: [directory],
    });
    const ids: string[] = [];
    for (let index = 0; index < 10; index += 1) {
      const response = await firstHandler(new Request("http://local/v1/render", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ project: stuckProject }),
      }));
      if (index === 9) {
        expect(response.status).toBe(429);
        expect(await response.json()).toMatchObject({ error: { code: "SERVER_BUSY" } });
      } else {
        expect(response.status).toBe(202);
        const job = await response.json() as { id: string };
        ids.push(job.id);
      }
    }

    const isolated = await secondHandler(new Request(`http://local/v1/jobs/${ids[0]}`));
    expect(isolated.status).toBe(404);
    await Bun.sleep(250);
    const running = await firstHandler(new Request(`http://local/v1/jobs/${ids[0]}`));
    expect(await running.json()).toMatchObject({ status: "running" });
    const cancelling = await firstHandler(new Request(`http://local/v1/jobs/${ids[0]}`, { method: "DELETE" }));
    expect(await cancelling.json()).toMatchObject({ status: "cancelling" });
    for (const id of ids.slice(1)) {
      await firstHandler(new Request(`http://local/v1/jobs/${id}`, { method: "DELETE" }));
    }
    for (const id of ids) await waitForJob(firstHandler, id, "cancelled");

    const timeoutHandler = createRequestHandler({
      projectRoots: [directory],
      outputRoots: [directory],
      limits: { renderTimeoutMs: 100 },
    });
    const timeoutResponse = await timeoutHandler(new Request("http://local/v1/render", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project: stuckProject }),
    }));
    const timeoutJob = await timeoutResponse.json() as { id: string };
    expect(await waitForJob(timeoutHandler, timeoutJob.id, "failed"))
      .toMatchObject({ error: { code: "RENDER_TIMEOUT" } });
  }, 15_000);
});
