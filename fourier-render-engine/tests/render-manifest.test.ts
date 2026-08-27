import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeRenderManifest } from "../src/render-manifest.ts";
import { DOM_RENDER_PROFILE } from "../src/render-profile.ts";
import { PROJECT_EXECUTION_REVISION } from "@fourier-video/core/artifact";
import { SDK_ABI_VERSION } from "@fourier-video/sdk";

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
      executionRevision: PROJECT_EXECUTION_REVISION,
      sourceFingerprint: "project-fingerprint-1",
      artifacts: [artifact, artifact],
    });
    expect(result.manifestPath).toBe(`${output}.manifest.json`);
    expect(result.manifest.snapshots).toHaveLength(1);
    expect(result.manifest.profiles).toHaveLength(1);
    expect(result.manifest).toMatchObject({
      schemaVersion: 2,
      engine: { version: "2.0.0" },
      sdk: { version: "1.2.0", abiVersion: SDK_ABI_VERSION },
      playwright: { version: "1.62.0" },
      chromium: { version: "151.0.7922.34", revision: "1234" },
      profiles: [{ runtimeRevision: "6" }],
      project: {
        id: "manifest-test",
        totalFrames: 3,
        fps: 30,
        executionRevision: "project-wire-v1",
        sourceFingerprint: "project-fingerprint-1",
      },
      snapshots: [{ snapshotId: "snapshot-1" }],
    });
    expect(await Bun.file(result.manifestPath).exists()).toBe(true);
  });
});
