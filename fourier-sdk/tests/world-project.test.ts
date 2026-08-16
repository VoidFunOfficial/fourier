import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addWorldComponent, deleteWorldComponent, WORLD_PROJECT_LOCK } from "../src/world-project.ts";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function asFetch(implementation: (request: Request) => Response): typeof globalThis.fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(implementation(new Request(input, init)))) as typeof globalThis.fetch;
}

describe("Fourier World project add/del", () => {
  test("下载、校验、安装并将 del 移到可恢复目录", async () => {
    const project = await mkdtemp(join(tmpdir(), "fourier-world-project-"));
    directories.push(project);
    const packageJson = JSON.stringify({ name: "@studio/MetricPanel", version: "1.0.0" });
    const bytes = await new Bun.Archive({
      "package.json": packageJson,
      "MetricPanel.tsx": "export default {};",
      "assets/icon.bin": new Uint8Array([1, 2, 3]),
    }, { compress: "gzip" }).bytes();
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const fetcher = asFetch(() => new Response(bytes, { headers: {
      "content-length": String(bytes.byteLength),
      "x-fourier-package-name": "@studio/MetricPanel",
      "x-fourier-package-sha256": sha256,
      "x-fourier-package-version": "1.0.0",
    } }));

    const added = await addWorldComponent({
      packageName: "@studio/MetricPanel",
      projectDirectory: project,
      worldUrl: "https://world.test",
      fetch: fetcher,
    });
    expect(added).toMatchObject({ version: "1.0.0", unchanged: false });
    expect(await Bun.file(join(project, "components/@studio/MetricPanel/MetricPanel.tsx")).text())
      .toBe("export default {};");
    expect(JSON.parse(await Bun.file(join(project, WORLD_PROJECT_LOCK)).text())).toMatchObject({
      version: 1,
      components: {
        "@studio/MetricPanel": {
          version: "1.0.0",
          path: "components/@studio/MetricPanel",
          sha256,
        },
      },
    });

    const unchanged = await addWorldComponent({
      packageName: "@studio/MetricPanel",
      projectDirectory: project,
      worldUrl: "https://world.test",
      fetch: fetcher,
    });
    expect(unchanged.unchanged).toBe(true);

    const deleted = await deleteWorldComponent({ packageName: "@studio/MetricPanel", projectDirectory: project });
    expect(deleted.trashPath).toContain(".fourier-trash");
    expect(await Bun.file(join(deleted.trashPath!, "MetricPanel.tsx")).text()).toBe("export default {};");
    expect(JSON.parse(await Bun.file(join(project, WORLD_PROJECT_LOCK)).text()).components).toEqual({});
  });

  test("del 拒绝删除 package name 不匹配的目录", async () => {
    const project = await mkdtemp(join(tmpdir(), "fourier-world-project-"));
    directories.push(project);
    const bytes = await new Bun.Archive({
      "package.json": JSON.stringify({ name: "@studio/MetricPanel", version: "1.0.0" }),
    }, { compress: "gzip" }).bytes();
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const fetcher = asFetch(() => new Response(bytes, { headers: {
      "x-fourier-package-name": "@studio/MetricPanel",
      "x-fourier-package-sha256": sha256,
      "x-fourier-package-version": "1.0.0",
    } }));
    await addWorldComponent({
      packageName: "@studio/MetricPanel",
      projectDirectory: project,
      worldUrl: "https://world.test",
      fetch: fetcher,
    });
    await Bun.write(join(project, "components/@studio/MetricPanel/package.json"), JSON.stringify({ name: "user-owned" }));
    await expect(deleteWorldComponent({
      packageName: "@studio/MetricPanel",
      projectDirectory: project,
    })).rejects.toThrow("package name 不匹配，拒绝删除");
  });
});
