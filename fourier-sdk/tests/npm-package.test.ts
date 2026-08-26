import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";

import { parseNpmPackageReference, resolveNpmPackage, type ResolvedNpmPackage } from "../src/npm-package.ts";

const resolved: ResolvedNpmPackage[] = [];

afterEach(async () => {
  await Promise.all(resolved.splice(0).map((item) => item.cleanup()));
});

function fixtureTarball(options: { components?: readonly string[]; version?: string } = {}) {
  const version = options.version ?? "1.2.3";
  const names = options.components ?? ["MetricPanel", "LaunchTitle"];
  const files: Record<string, string> = {
    "package/package.json": JSON.stringify({
      name: "@studio/fourier-components",
      version,
      description: "collection",
      license: "MIT",
      fourier: {
        schemaVersion: 1,
        components: names.map((name) => `components/${name}/package.json`),
      },
    }),
  };
  for (const name of names) {
    files[`package/components/${name}/package.json`] = JSON.stringify({
      name: `@studio/${name}`,
      version,
      description: `${name} description`,
      license: "MIT",
      files: ["main.tsx"],
      fourier: {
        entry: "./main.tsx",
        type: "card",
        summary: `${name} summary`,
        instruction: `Use ${name}`,
        useCases: ["tests"],
        tags: ["test"],
        style: ["minimal"],
      },
    });
    files[`package/components/${name}/main.tsx`] = "export default {};";
  }
  return new Bun.Archive(files, { compress: "gzip" }).bytes();
}

function fetcher(bytes: Uint8Array, integrity = `sha512-${createHash("sha512").update(bytes).digest("base64")}`) {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("registry.npmjs.org/%40studio%2Ffourier-components/1.2.3")) {
      return Response.json({
        name: "@studio/fourier-components",
        version: "1.2.3",
        dist: {
          tarball: "https://registry.npmjs.org/@studio/fourier-components/-/fourier-components-1.2.3.tgz",
          integrity,
        },
      });
    }
    return new Response(Uint8Array.from(bytes).buffer, { headers: { "content-length": String(bytes.byteLength) } });
  }) as typeof globalThis.fetch;
}

describe("npm component package", () => {
  test("解析精确包和组件 URL", () => {
    expect(parseNpmPackageReference("https://www.npmjs.com/package/@studio/fourier-components/v/1.2.3"))
      .toMatchObject({ packageName: "@studio/fourier-components", version: "1.2.3" });
    expect(parseNpmPackageReference("https://www.npmjs.com/package/@studio/fourier-components/v/1.2.3#MetricPanel"))
      .toMatchObject({ componentName: "MetricPanel" });
    for (const value of [
      "@studio/fourier-components@1.2.3",
      "http://www.npmjs.com/package/@studio/fourier-components/v/1.2.3",
      "https://www.npmjs.com/package/@studio/fourier-components/v/latest",
      "https://registry.npmjs.org/@studio/fourier-components",
      "https://www.npmjs.com/package/@studio/fourier-components/v/1.2.3?x=1",
    ]) expect(() => parseNpmPackageReference(value)).toThrow();
  });

  test("从 registry 校验并解析多个组件", async () => {
    const bytes = await fixtureTarball();
    const item = await resolveNpmPackage(
      "https://www.npmjs.com/package/@studio/fourier-components/v/1.2.3#MetricPanel",
      fetcher(bytes),
    );
    resolved.push(item);
    expect(item.components.map((component) => component.componentName)).toEqual(["MetricPanel", "LaunchTitle"]);
    expect(item.integrity).toStartWith("sha512-");
  });

  test("拒绝 integrity 不匹配和超过 50 个组件", async () => {
    const bytes = await fixtureTarball();
    await expect(resolveNpmPackage(
      "https://www.npmjs.com/package/@studio/fourier-components/v/1.2.3",
      fetcher(bytes, `sha512-${Buffer.alloc(64).toString("base64")}`),
    )).rejects.toThrow("integrity");

    const tooMany = await fixtureTarball({ components: Array.from({ length: 51 }, (_, index) => `C${index}`) });
    await expect(resolveNpmPackage(
      "https://www.npmjs.com/package/@studio/fourier-components/v/1.2.3",
      fetcher(tooMany),
    )).rejects.toThrow("1—50");
  });
});
