import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeRenderManifest } from "../src/render-manifest.ts";
import { DOM_RENDER_PROFILE } from "../src/render-profile.ts";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

describe("render manifest", () => {
  test("输出 <video>.manifest.json 并去重 snapshot/profile", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fourier-manifest-test-"));
    directories.push(directory);
    const output = join(directory, "video.mp4");
    await Bun.write(output, "video-bytes");
    const artifact = {
      nodeId: "panel",
      kind: "react" as const,
      name: "Panel",
      sdkAbiVersion: 1.1 as const,
      renderer: "dom-timeline" as const,
      snapshotId: "snapshot-1",
      dependencyDigest: "dependency-1",
      profile: DOM_RENDER_PROFILE,
    };
    const result = await writeRenderManifest({
      output,
      projectId: "manifest-test",
      totalFrames: 3,
      fps: 30,
      artifacts: [artifact, artifact],
    });
    expect(result.manifestPath).toBe(`${output}.manifest.json`);
    expect(result.manifest.snapshots).toHaveLength(1);
    expect(result.manifest.profiles).toHaveLength(1);
    expect(result.manifest).toMatchObject({
      schemaVersion: 1,
      sdk: { version: "1.1.0", abiVersion: 1.1 },
      playwright: { version: "1.62.0" },
      chromium: { version: "151.0.7922.34", revision: "1234" },
      profiles: [{ runtimeRevision: "5" }],
      project: { id: "manifest-test", totalFrames: 3, fps: 30 },
      snapshots: [{ snapshotId: "snapshot-1" }],
    });
    expect(await Bun.file(result.manifestPath).exists()).toBe(true);
  });
});
