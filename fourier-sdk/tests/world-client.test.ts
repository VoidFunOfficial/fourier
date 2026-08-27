import { describe, expect, test } from "bun:test";

import { FourierWorldClient } from "../src/world-client.ts";
import type { PreparedWorldPackage } from "../src/world-publish.ts";

function asFetch(implementation: (request: Request) => Promise<Response> | Response): typeof globalThis.fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) =>
    implementation(new Request(input, init))) as typeof globalThis.fetch;
}

function prepared(): PreparedWorldPackage {
  const preview = {
    bytes: new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]),
    mimeType: "video/mp4" as const,
    sha256: "a".repeat(64),
    width: 32,
    height: 24,
    fps: 60,
    totalFrames: 60,
    durationSeconds: 1,
  };
  const component = (name: string) => ({
    componentPackage: {} as never,
    preview,
    artifact: {
      name,
      kind: "react" as const,
      sdkAbiVersion: 1 as const,
      renderer: "dom-timeline" as const,
      dependencies: [],
    },
  });
  return {
    npmPackage: {
      reference: {
        packageUrl: "https://www.npmjs.com/package/@studio/components/v/1.2.3",
        packageName: "@studio/components",
        namespace: "@studio",
        version: "1.2.3",
      },
      integrity: "sha512-test",
      tarballUrl: "https://registry.npmjs.org/@studio/components/-/components-1.2.3.tgz",
      fileCount: 6,
      unpackedSize: 400,
      rootDirectory: "/tmp/test",
      components: [],
      cleanup: async () => {},
    },
    components: [component("MetricPanel"), component("LaunchTitle")],
    cleanup: async () => {},
  };
}

describe("Fourier World npm client", () => {
  test("解析普通用户登录", async () => {
    const client = new FourierWorldClient({
      worldUrl: "https://world.test",
      fetch: asFetch(() => Response.json({
        token: "token",
        user: { id: 7, email: "author@example.com", name: "@studio", role: "user" },
      })),
    });
    expect(await client.login("author@example.com", "secret")).toMatchObject({
      user: { id: 7, name: "@studio", role: "user" },
    });
  });

  test("上传每个预览并一次提交 npm release", async () => {
    let mediaId = 30;
    let publishBody: unknown;
    const client = new FourierWorldClient({
      worldUrl: "https://world.test",
      token: "token",
      fetch: asFetch(async (request) => {
        const path = new URL(request.url).pathname;
        if (path === "/api/users/me") {
          return Response.json({ user: { id: 7, email: "author@example.com", name: "@studio", role: "user" } });
        }
        if (path === "/api/media") {
          expect(request.method).toBe("POST");
          const form = await request.formData();
          expect(form.get("file")).toBeInstanceOf(File);
          return Response.json({ doc: { id: ++mediaId } }, { status: 201 });
        }
        if (path === "/api/npm-packages/publish") {
          publishBody = await request.json();
          return Response.json({
            created: true,
            packageId: 9,
            components: [
              { id: 41, namespace: "@studio", name: "MetricPanel", version: "1.2.3", status: "review" },
              { id: 42, namespace: "@studio", name: "LaunchTitle", version: "1.2.3", status: "review" },
            ],
          }, { status: 201 });
        }
        throw new Error(`unexpected ${path}`);
      }),
    });
    const result = await client.publish(prepared());
    expect(result.components).toHaveLength(2);
    expect(publishBody).toMatchObject({
      npmPackageUrl: "https://www.npmjs.com/package/@studio/components/v/1.2.3",
      integrity: "sha512-test",
      previews: [{ name: "MetricPanel", mediaId: 31 }, { name: "LaunchTitle", mediaId: 32 }],
    });
  });

  test("上传预览前拒绝跨 namespace npm scope", async () => {
    let requests = 0;
    const client = new FourierWorldClient({
      worldUrl: "https://world.test",
      token: "token",
      fetch: asFetch(() => {
        requests += 1;
        return Response.json({ user: { id: 8, email: "other@example.com", name: "@other", role: "user" } });
      }),
    });
    await expect(client.publish(prepared())).rejects.toMatchObject({ status: 403 });
    expect(requests).toBe(1);
  });

  test("只接受 World 已发布的精确 npm release", async () => {
    const npmPackageUrl = "https://www.npmjs.com/package/@studio/components/v/1.2.3";
    const client = new FourierWorldClient({
      worldUrl: "https://world.test",
      fetch: asFetch((request) => {
        expect(new URL(request.url).pathname).toBe("/api/npm-packages/resolve");
        return Response.json({
          npmPackageUrl,
          integrity: "sha512-test",
          components: [{ name: "MetricPanel", npmComponentUrl: `${npmPackageUrl}#MetricPanel` }],
        });
      }),
    });
    expect(await client.approvedNpmPackage(`${npmPackageUrl}#MetricPanel`)).toMatchObject({
      npmPackageUrl,
      components: [{ name: "MetricPanel" }],
    });
  });
});
