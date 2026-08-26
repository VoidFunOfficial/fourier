import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { addWorldComponent, deleteWorldComponent, WORLD_PROJECT_LOCK } from "../src/world-project.ts";

const directories: string[] = [];
const npmPackageUrl = "https://www.npmjs.com/package/@studio/components/v/1.2.3";

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function fixture() {
  const files: Record<string, string> = {
    "package/package.json": JSON.stringify({
      name: "@studio/components", version: "1.2.3", description: "collection", license: "MIT",
      fourier: { schemaVersion: 1, components: [
        "components/MetricPanel/package.json", "components/LaunchTitle/package.json",
      ] },
    }),
  };
  for (const name of ["MetricPanel", "LaunchTitle"]) {
    files[`package/components/${name}/package.json`] = JSON.stringify({
      name: `@studio/${name}`, version: "1.2.3", description: `${name} description`, license: "MIT",
      files: ["main.tsx"],
      fourier: {
        entry: "main.tsx", type: "card", summary: `${name} summary`, instruction: `Use ${name}`,
        useCases: ["tests"], tags: ["test"], style: ["minimal"],
      },
    });
    files[`package/components/${name}/main.tsx`] = `export default ${JSON.stringify(name)};`;
  }
  const bytes = await new Bun.Archive(files, { compress: "gzip" }).bytes();
  const integrity = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
  return { bytes, integrity };
}

function fetcher(bytes: Uint8Array, integrity: string): typeof globalThis.fetch {
  return (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.hostname === "world.test") {
      return Response.json({
        npmPackageUrl,
        integrity,
        components: ["MetricPanel", "LaunchTitle"].map((name) => ({ name, npmComponentUrl: `${npmPackageUrl}#${name}` })),
      });
    }
    if (url.pathname.endsWith("/1.2.3")) {
      return Response.json({
        name: "@studio/components", version: "1.2.3",
        dist: { tarball: "https://registry.npmjs.org/@studio/components/-/components-1.2.3.tgz", integrity },
      });
    }
    return new Response(Uint8Array.from(bytes).buffer);
  }) as typeof globalThis.fetch;
}

describe("Fourier World npm add/del", () => {
  test("整包和单组件使用同一目录格式与 v2 lock", async () => {
    const project = await mkdtemp(join(tmpdir(), "fourier-world-project-"));
    directories.push(project);
    const { bytes, integrity } = await fixture();
    const oldUrl = "https://www.npmjs.com/package/@studio/components/v/1.0.0";
    await mkdir(join(project, "components/@studio/OldOnly"), { recursive: true });
    await Bun.write(join(project, "components/@studio/OldOnly/package.json"), JSON.stringify({
      name: "@studio/OldOnly", version: "1.0.0",
    }));
    await Bun.write(join(project, WORLD_PROJECT_LOCK), JSON.stringify({
      version: 2,
      components: {
        "@studio/OldOnly": {
          version: "1.0.0", path: "components/@studio/OldOnly", worldUrl: "https://world.test",
          npmPackageUrl: oldUrl, npmComponentUrl: `${oldUrl}#OldOnly`, integrity: "sha512-old",
          installedAt: "2026-08-01T00:00:00.000Z",
        },
      },
    }));
    const added = await addWorldComponent({
      npmUrl: npmPackageUrl,
      projectDirectory: project,
      worldUrl: "https://world.test",
      fetch: fetcher(bytes, integrity),
    });
    expect(added.components.map((component) => component.packageName)).toEqual([
      "@studio/MetricPanel", "@studio/LaunchTitle",
    ]);
    expect(await Bun.file(join(project, "components/@studio/MetricPanel/main.tsx")).text()).toContain("MetricPanel");
    expect(await Bun.file(join(project, "components/@studio/OldOnly/package.json")).exists()).toBe(false);
    const lock = JSON.parse(await Bun.file(join(project, WORLD_PROJECT_LOCK)).text());
    expect(lock).toMatchObject({
      version: 2,
      components: {
        "@studio/MetricPanel": { npmPackageUrl, integrity, path: "components/@studio/MetricPanel" },
        "@studio/LaunchTitle": { npmPackageUrl, integrity, path: "components/@studio/LaunchTitle" },
      },
    });
    expect(lock.components).not.toHaveProperty("@studio/OldOnly");

    const deleted = await deleteWorldComponent({
      npmUrl: `${npmPackageUrl}#MetricPanel`,
      projectDirectory: project,
    });
    expect(deleted.components).toHaveLength(1);
    expect(deleted.components[0]!.trashPath).toContain(".fourier-trash");
    expect(JSON.parse(await Bun.file(join(project, WORLD_PROJECT_LOCK)).text()).components)
      .toHaveProperty("@studio/LaunchTitle");
  });

  test("拒绝没有 npm 来源的 v1 lock", async () => {
    const project = await mkdtemp(join(tmpdir(), "fourier-world-project-"));
    directories.push(project);
    await Bun.write(join(project, WORLD_PROJECT_LOCK), JSON.stringify({ version: 1, components: {} }));
    await expect(deleteWorldComponent({ npmUrl: npmPackageUrl, projectDirectory: project }))
      .rejects.toThrow("v1 没有 npm 来源");
  });

  test("整包删除会在移动任何目录前验证全部组件", async () => {
    const project = await mkdtemp(join(tmpdir(), "fourier-world-project-"));
    directories.push(project);
    const { bytes, integrity } = await fixture();
    await addWorldComponent({
      npmUrl: npmPackageUrl,
      projectDirectory: project,
      worldUrl: "https://world.test",
      fetch: fetcher(bytes, integrity),
    });
    await Bun.write(join(project, "components/@studio/LaunchTitle/package.json"), JSON.stringify({
      name: "@studio/NotLaunchTitle", version: "1.2.3",
    }));

    await expect(deleteWorldComponent({ npmUrl: npmPackageUrl, projectDirectory: project }))
      .rejects.toThrow("package name 不匹配");
    expect(await Bun.file(join(project, "components/@studio/MetricPanel/package.json")).exists()).toBe(true);
    expect(JSON.parse(await Bun.file(join(project, WORLD_PROJECT_LOCK)).text()).components)
      .toHaveProperty("@studio/MetricPanel");
  });
});
