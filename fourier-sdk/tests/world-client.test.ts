import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WorldPackageArchive } from "../src/world-archive.ts";
import { FourierWorldApiError, FourierWorldClient } from "../src/world-client.ts";
import { loadWorldPackage } from "../src/world-manifest.ts";
import type { WorldPreviewVideo } from "../src/world-preview.ts";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function fixturePackage() {
  const directory = await mkdtemp(join(tmpdir(), "fourier-world-client-"));
  directories.push(directory);
  await Bun.write(join(directory, "MetricPanel.tsx"), "export default {};");
  await Bun.write(join(directory, "package.json"), JSON.stringify({
    name: "@studio/MetricPanel",
    version: "2.0.0",
    description: "Detailed component description.",
    license: "MIT",
    files: ["MetricPanel.tsx"],
    fourier: {
      entry: "./MetricPanel.tsx",
      type: "card",
      subtype: "metrics",
      summary: "Concise summary.",
      instruction: "Use for product metrics.",
      useCases: ["Product launch"],
      tags: ["metrics"],
      style: ["minimal"],
      languages: ["en"],
    },
  }));
  return loadWorldPackage(directory);
}

function asFetch(
  implementation: (request: Request) => Promise<Response> | Response,
): typeof globalThis.fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) =>
    implementation(new Request(input, init))) as typeof globalThis.fetch;
}

function previewVideo(): WorldPreviewVideo {
  const bytes = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]);
  return {
    bytes,
    mimeType: "video/mp4",
    sha256: createHash("sha256").update(bytes).digest("hex"),
    width: 320,
    height: 180,
    fps: 60,
    totalFrames: 60,
    durationSeconds: 1,
  };
}

describe("Fourier World Payload client", () => {
  test("使用 Payload users 登录并解析账号", async () => {
    let received: unknown;
    const fetcher = asFetch(async (request) => {
      expect(new URL(request.url).pathname).toBe("/api/users/login");
      received = await request.json();
      return Response.json({
        token: "test-token",
        exp: 2_000_000_000,
        user: { id: 7, email: "author@example.com", name: "Author", role: "reviewer" },
      });
    });
    const result = await new FourierWorldClient({ worldUrl: "https://world.test", fetch: fetcher }).login(
      "author@example.com",
      "secret",
    );
    expect(received).toEqual({ email: "author@example.com", password: "secret" });
    expect(result).toEqual({
      token: "test-token",
      exp: 2_000_000_000,
      user: { id: 7, email: "author@example.com", name: "Author", role: "reviewer" },
    });
  });

  test("上传源码归档并以 review 状态创建组件", async () => {
    const componentPackage = await fixturePackage();
    const requests: Array<{ method: string; path: string; authorization: string | null; body?: unknown }> = [];
    const archive: WorldPackageArchive = {
      bytes: new Uint8Array([1, 2, 3]),
      sha256: createHash("sha256").update(new Uint8Array([1, 2, 3])).digest("hex"),
      fileCount: 2,
      unpackedSize: 200,
    };
    const fetcher = asFetch(async (request) => {
      const url = new URL(request.url);
      const item: { method: string; path: string; authorization: string | null; body?: unknown } = {
        method: request.method,
        path: `${url.pathname}${url.search}`,
        authorization: request.headers.get("authorization"),
      };
      if (request.method !== "GET" && request.headers.get("content-type")?.includes("application/json")) {
        item.body = await request.json();
      }
      requests.push(item);
      if (url.pathname === "/api/authors") return Response.json({ docs: [{ id: 12, namespace: "@studio" }] });
      if (url.pathname === "/api/component-packages" && request.method === "GET") return Response.json({ docs: [] });
      if (url.pathname === "/api/component-packages" && request.method === "POST") {
        const form = await request.formData();
        expect(JSON.parse(String(form.get("_payload")))).toMatchObject({
          packageName: "@studio/MetricPanel",
          version: "2.0.0",
          sha256: archive.sha256,
        });
        expect(form.get("file")).toBeInstanceOf(File);
        return Response.json({ doc: { id: 31 } }, { status: 201 });
      }
      if (url.pathname === "/api/media" && request.method === "POST") {
        const form = await request.formData();
        expect(JSON.parse(String(form.get("_payload")))).toEqual({
          alt: "MetricPanel · Fourier Render Engine preview",
        });
        const file = form.get("file");
        expect(file).toBeInstanceOf(File);
        expect((file as File).type).toBe("video/mp4");
        expect((file as File).name).toBe("studio-MetricPanel-2.0.0-preview.mp4");
        return Response.json({ doc: { id: 32 } }, { status: 201 });
      }
      if (url.pathname === "/api/components" && request.method === "GET") return Response.json({ docs: [] });
      if (url.pathname === "/api/components" && request.method === "POST") {
        const body = item.body as Record<string, unknown>;
        return Response.json({ doc: { id: 44, ...body } }, { status: 201 });
      }
      return Response.json({ message: "not found" }, { status: 404 });
    });
    const result = await new FourierWorldClient({
      worldUrl: "https://world.test",
      token: "JWT publish-token",
      fetch: fetcher,
    }).publish(componentPackage, archive, previewVideo());

    expect(result).toEqual({
      created: true,
      component: {
        id: 44,
        namespace: "@studio",
        name: "MetricPanel",
        version: "2.0.0",
        status: "review",
      },
    });
    expect(requests.every((request) => request.authorization === "JWT publish-token")).toBe(true);
    expect(requests[0]!.path).toContain("where%5Bnamespace%5D%5Bequals%5D=%40studio");
    expect(requests[5]!.body).toMatchObject({
      namespace: "@studio",
      name: "MetricPanel",
      version: "2.0.0",
      author: 12,
      packageArchive: 31,
      preview: 32,
      status: "review",
      description: "Detailed component description.",
    });
  });

  test("校验公开下载的 package 元数据和 SHA-256", async () => {
    const bytes = new Uint8Array([4, 5, 6]);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const fetcher = asFetch((request) => {
      expect(new URL(request.url).pathname).toBe("/api/packages/%40studio/MetricPanel");
      return new Response(bytes, { headers: {
        "content-length": String(bytes.byteLength),
        "x-fourier-component-id": "44",
        "x-fourier-package-name": "@studio/MetricPanel",
        "x-fourier-package-sha256": sha256,
        "x-fourier-package-version": "2.0.0",
      } });
    });
    const downloaded = await new FourierWorldClient({ worldUrl: "https://world.test", fetch: fetcher })
      .download("@studio/MetricPanel");
    expect(downloaded).toMatchObject({
      packageName: "@studio/MetricPanel",
      version: "2.0.0",
      sha256,
      componentId: "44",
    });
    expect(downloaded.bytes).toEqual(bytes);
  });

  test("拒绝用不同内容覆盖同名同版本归档", async () => {
    const componentPackage = await fixturePackage();
    const archive: WorldPackageArchive = {
      bytes: new Uint8Array([1]),
      sha256: "a".repeat(64),
      fileCount: 2,
      unpackedSize: 100,
    };
    const fetcher = asFetch((request) => {
      const path = new URL(request.url).pathname;
      if (path === "/api/authors") return Response.json({ docs: [{ id: 12 }] });
      if (path === "/api/component-packages") {
        return Response.json({ docs: [{ id: 31, sha256: "b".repeat(64) }] });
      }
      throw new Error(`unexpected request: ${path}`);
    });
    await expect(new FourierWorldClient({
      worldUrl: "https://world.test",
      token: "token",
      fetch: fetcher,
    }).publish(componentPackage, archive, previewVideo())).rejects.toThrow("已存在且内容不同；请提升 version");
  });

  test("组件写入失败时清理本次上传的源码包和预览视频", async () => {
    const componentPackage = await fixturePackage();
    const archive: WorldPackageArchive = {
      bytes: new Uint8Array([1, 2, 3]),
      sha256: "a".repeat(64),
      fileCount: 2,
      unpackedSize: 100,
    };
    const deleted: string[] = [];
    const fetcher = asFetch((request) => {
      const url = new URL(request.url);
      if (request.method === "DELETE") {
        deleted.push(url.pathname);
        return new Response(null, { status: 204 });
      }
      if (url.pathname === "/api/authors") return Response.json({ docs: [{ id: 12 }] });
      if (url.pathname === "/api/component-packages" && request.method === "GET") {
        return Response.json({ docs: [] });
      }
      if (url.pathname === "/api/component-packages" && request.method === "POST") {
        return Response.json({ doc: { id: 31 } }, { status: 201 });
      }
      if (url.pathname === "/api/media" && request.method === "POST") {
        return Response.json({ doc: { id: 32 } }, { status: 201 });
      }
      if (url.pathname === "/api/components" && request.method === "GET") {
        return Response.json({ docs: [] });
      }
      if (url.pathname === "/api/components" && request.method === "POST") {
        return Response.json({ errors: [{ message: "component rejected" }] }, { status: 422 });
      }
      throw new Error(`unexpected request: ${request.method} ${url.pathname}`);
    });

    await expect(new FourierWorldClient({
      worldUrl: "https://world.test",
      token: "token",
      fetch: fetcher,
    }).publish(componentPackage, archive, previewVideo())).rejects.toThrow("component rejected");
    expect(deleted.sort()).toEqual([
      "/api/component-packages/31",
      "/api/media/32",
    ]);
  });

  test("保留 World 返回的权限错误", async () => {
    const fetcher = asFetch(() =>
      Response.json({ errors: [{ message: "Invalid login credentials" }] }, { status: 401 }));
    let thrown: unknown;
    try {
      await new FourierWorldClient({ worldUrl: "https://world.test", fetch: fetcher }).login("a@b.co", "bad");
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(FourierWorldApiError);
    expect((thrown as Error).message).toContain("Invalid login credentials");
  });
});
