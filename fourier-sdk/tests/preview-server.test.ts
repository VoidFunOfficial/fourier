import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { startPreviewServer, type PreviewServerHandle } from "../src/preview.ts";

const directories: string[] = [];
const servers: PreviewServerHandle[] = [];
const ONE_PIXEL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+Xq2pAAAAAElFTkSuQmCC";

function configSource(color: string): string {
  return `import { React, defineReact, useFourierTimeline, useLayoutEffect, useRef } from "@fourier-video/sdk";

const artifact = defineReact({
  name: "ServerPanel",
  schema: {},
  component() {
    const root = useRef(null);
    const timeline = useFourierTimeline();
    useLayoutEffect(() => {
      timeline.animate(root.current, [
        { background: "${color}" },
        { background: "#00ff00" },
      ]);
    }, [timeline]);
    return React.createElement("div", {
      ref: root,
      style: { width: 24, height: 16, display: "flex" },
    });
  },
  designPreview() {
    return {
      props: {},
      composition: { width: 24, height: 16, durationSeconds: 1 },
    };
  },
});

export default artifact;`;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop()));
  await Promise.all(
    directories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })),
  );
});

describe("browser DOM preview server", () => {
  test("提供 React 组件库、session、DOM runtime 和 stale snapshot 协议", async () => {
    const directory = await mkdtemp(join(import.meta.dir, ".preview-server-"));
    directories.push(directory);
    const path = join(directory, "Panel.tsx");
    await Bun.write(path, configSource("#ff0000"));
    const server = await startPreviewServer({
      entryPath: path,
      port: 0,
      watch: false,
    });
    servers.push(server);

    const player = await fetch(server.url);
    expect(player.status).toBe(200);
    const playerHtml = await player.text();
    expect(playerHtml).toContain("Fourier Studio");
    expect(playerHtml).toContain("/preview-app.js?v=");

    const app = await fetch(`${server.url}/preview-app.js`);
    expect(app.status).toBe(200);
    expect(app.headers.get("content-type")).toContain("text/javascript");
    expect(app.headers.get("cache-control")).toContain("immutable");
    const appSource = await app.text();
    expect(appSource.length).toBeGreaterThan(10_000);
    expect(appSource).toContain("requestAnimationFrame");
    expect(appSource).toContain("IntersectionObserver");
    expect(appSource).toContain("visibilitychange");

    const styles = await fetch(`${server.url}/preview-app.css`);
    expect(styles.status).toBe(200);
    expect(styles.headers.get("cache-control")).toContain("immutable");
    expect(await styles.text()).toContain(".component-grid");

    const artifacts = await (await fetch(`${server.url}/api/artifacts`)).json() as {
      artifacts: Array<{ id: string; name: string; status: string }>;
    };
    expect(artifacts.artifacts).toEqual([
      expect.objectContaining({ id: "Panel.tsx", name: "ServerPanel", status: "ready" }),
    ]);

    const sessionResponse = await fetch(`${server.url}/api/session`);
    expect(sessionResponse.status).toBe(200);
    const session = await sessionResponse.json() as {
      snapshotId: string;
      renderMode: string;
      runtime: { scriptUrl: string; styleUrl: string };
      composition: {
        durationSeconds: number;
        durationInFrames: number;
        fps: number;
        static: boolean;
      };
    };
    expect(session.composition).toMatchObject({
      durationSeconds: 1,
      durationInFrames: 60,
      fps: 60,
      static: false,
    });
    expect(session.renderMode).toBe("browser-dom");

    const runtime = await fetch(new URL(session.runtime.scriptUrl, server.url));
    expect(runtime.status).toBe(200);
    expect(runtime.headers.get("content-type")).toContain("text/javascript");
    expect(await runtime.text()).toContain("__fourierDomTimeline");

    const runtimeStyles = await fetch(new URL(session.runtime.styleUrl, server.url));
    expect(runtimeStyles.status).toBe(200);
    expect(runtimeStyles.headers.get("content-type")).toContain("text/css");

    const stale = await fetch(
      `${server.url}/api/runtime.js?snapshot=old`,
    );
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({
      snapshotId: session.snapshotId,
      error: { code: "STALE_PREVIEW_SNAPSHOT" },
    });

    const directFrame = await fetch(
      `${server.url}/api/frames/0.png?snapshot=${session.snapshotId}`,
    );
    expect(directFrame.status).toBe(404);
    expect(await directFrame.json()).toMatchObject({
      error: { code: "DOM_PREVIEW_DIRECT" },
    });

    const events = await fetch(`${server.url}/api/events`);
    expect(events.headers.get("content-type")).toContain("text/event-stream");
    const reader = events.body!.getReader();
    const firstEvent = await reader.read();
    expect(new TextDecoder().decode(firstEvent.value)).toContain("retry: 500");
    await reader.cancel();
  });

  test("目录入口递归发现全部组件并按路径稳定排序", async () => {
    const directory = await mkdtemp(join(import.meta.dir, ".preview-gallery-"));
    directories.push(directory);
    await mkdir(join(directory, "nested"));
    await Bun.write(join(directory, "Zulu.tsx"), configSource("#ff0000").replace("ServerPanel", "Zulu"));
    await Bun.write(join(directory, "nested", "Alpha.tsx"), configSource("#0000ff").replace("ServerPanel", "Alpha"));
    await Bun.write(join(directory, "ignored.test.tsx"), configSource("#ffffff"));
    const server = await startPreviewServer({ entryPath: directory, port: 0, watch: false });
    servers.push(server);

    const result = await (await fetch(`${server.url}/api/artifacts`)).json() as {
      artifacts: Array<{ id: string; name: string }>;
    };
    expect(result.artifacts.map((artifact) => artifact.id)).toEqual([
      "nested/Alpha.tsx",
      "Zulu.tsx",
    ]);
    expect(result.artifacts.map((artifact) => artifact.name)).toEqual(["Alpha", "Zulu"]);
  });

  test("DOM runtime 把本地图片虚拟 URL 内联为 data URI", async () => {
    const directory = await mkdtemp(join(import.meta.dir, ".preview-image-"));
    directories.push(directory);
    const imagePath = join(directory, "poster.png");
    const artifactPath = join(directory, "ImagePanel.tsx");
    await Promise.all([
      Bun.write(imagePath, Buffer.from(ONE_PIXEL_PNG_BASE64, "base64")),
      Bun.write(artifactPath, `import posterUrl from "./poster.png";
import { defineReact } from "@fourier-video/sdk";

export default defineReact({
  name: "PreviewImagePanel",
  schema: {},
  static: true,
  component() {
    return <img src={posterUrl} width={1} height={1} />;
  },
  designPreview() {
    return { props: {}, composition: { width: 1, height: 1, durationSeconds: 0 } };
  },
});`),
    ]);
    const server = await startPreviewServer({
      entryPath: artifactPath,
      port: 0,
      watch: false,
    });
    servers.push(server);

    const session = await (await fetch(`${server.url}/api/session`)).json() as {
      runtime: { scriptUrl: string };
    };
    const runtime = await fetch(new URL(session.runtime.scriptUrl, server.url));
    expect(runtime.status).toBe(200);
    const javascript = await runtime.text();
    expect(javascript).toContain(`data:image/png;base64,${ONE_PIXEL_PNG_BASE64}`);
    expect(javascript).not.toContain(
      "https://fourier.invalid/__fourier_image_assets__/",
    );
  });

  test("重编译切换 snapshot，失败时保留最后成功画面并可恢复", async () => {
    const directory = await mkdtemp(join(import.meta.dir, ".preview-reload-"));
    directories.push(directory);
    const path = join(directory, "Panel.tsx");
    await Bun.write(path, configSource("#ff0000"));
    const server = await startPreviewServer({
      entryPath: path,
      port: 0,
      watch: false,
    });
    servers.push(server);
    const first = await (await fetch(`${server.url}/api/session`)).json() as {
      status?: string;
      snapshotId: string;
      diagnostic?: unknown;
    };
    if (first.status !== "ready") throw new Error(JSON.stringify(first.diagnostic));
    expect(first.status).toBe("ready");
    expect(typeof first.snapshotId).toBe("string");

    await Bun.write(path, configSource("#0000ff"));
    await server.reload();
    const second = await (await fetch(`${server.url}/api/session`)).json() as {
      snapshotId: string;
    };
    expect(second.snapshotId).not.toBe(first.snapshotId);

    await Bun.write(path, "export default ???");
    await server.reload();
    const failedResponse = await fetch(`${server.url}/api/session`);
    expect(failedResponse.status).toBe(200);
    expect(await failedResponse.json()).toMatchObject({
      status: "ready",
      snapshotId: second.snapshotId,
      diagnostic: { code: "ARTIFACT_COMPILE_FAILED" },
    });

    await Bun.write(path, configSource("#ffffff"));
    await server.reload();
    const recovered = await (await fetch(`${server.url}/api/session`)).json() as {
      snapshotId: string;
      diagnostic?: unknown;
    };
    expect(recovered.snapshotId).not.toBe(second.snapshotId);
    expect(recovered.diagnostic).toBeUndefined();
  });

  test("watch 模式在源码保存后自动发布新 snapshot", async () => {
    const directory = await mkdtemp(join(import.meta.dir, ".preview-watch-"));
    directories.push(directory);
    const path = join(directory, "Panel.tsx");
    await Bun.write(path, configSource("#ff0000"));
    const server = await startPreviewServer({
      entryPath: path,
      port: 0,
      watch: true,
    });
    servers.push(server);
    const first = await (await fetch(`${server.url}/api/session`)).json() as {
      status?: string;
      snapshotId: string;
      diagnostic?: unknown;
    };
    if (first.status !== "ready") throw new Error(JSON.stringify(first.diagnostic));
    expect(first.status).toBe("ready");
    expect(typeof first.snapshotId).toBe("string");

    await Bun.write(path, configSource("#0000ff"));
    let latest = first.snapshotId;
    for (let attempt = 0; attempt < 40 && latest === first.snapshotId; attempt++) {
      await Bun.sleep(50);
      const value = await (await fetch(`${server.url}/api/session`)).json() as {
        snapshotId: string;
      };
      latest = value.snapshotId;
    }
    expect(latest).not.toBe(first.snapshotId);
  });

  test("watch 模式只重编并通知依赖发生变化的组件", async () => {
    const directory = await mkdtemp(join(import.meta.dir, ".preview-incremental-"));
    directories.push(directory);
    const alphaPath = join(directory, "Alpha.tsx");
    await Bun.write(alphaPath, configSource("#ff0000").replace("ServerPanel", "Alpha"));
    await Bun.write(
      join(directory, "Zulu.tsx"),
      configSource("#0000ff").replace("ServerPanel", "Zulu"),
    );
    const server = await startPreviewServer({ entryPath: directory, port: 0, watch: true });
    servers.push(server);

    const events = await fetch(`${server.url}/api/events`);
    const reader = events.body!.getReader();
    await reader.read();
    await Bun.write(alphaPath, configSource("#00ffff").replace("ServerPanel", "Alpha"));

    let eventText = "";
    let pendingRead = reader.read();
    const deadline = Date.now() + 1_500;
    while (Date.now() < deadline && !eventText.includes("Alpha.tsx")) {
      const remaining = Math.max(1, deadline - Date.now());
      const result = await Promise.race([
        pendingRead,
        Bun.sleep(Math.min(100, remaining)).then(() => undefined),
      ]);
      if (result !== undefined && !result.done) {
        eventText += new TextDecoder().decode(result.value);
        pendingRead = reader.read();
      }
    }
    await Bun.sleep(250);
    await reader.cancel();
    expect(eventText).toContain("Alpha.tsx");
    expect(eventText).not.toContain("Zulu.tsx");
  });
});
