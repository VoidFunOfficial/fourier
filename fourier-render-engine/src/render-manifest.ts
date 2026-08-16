import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { resolve } from "node:path";
import { SDK_ABI_VERSION } from "@fourier-video/sdk";
import {
  CHROMIUM_REVISION,
  CHROMIUM_VERSION,
  PLAYWRIGHT_VERSION,
  type RenderProfile,
} from "./render-profile.ts";
import type { PreparedTimelineArtifact } from "./visual-renderer.ts";

export interface RenderManifest {
  readonly schemaVersion: 1;
  readonly engine: { readonly name: "@fourier-video/render-engine"; readonly version: "1.0.0" };
  readonly sdk: {
    readonly name: "@fourier-video/sdk";
    readonly version: "1.1.0";
    readonly abiVersion: typeof SDK_ABI_VERSION;
  };
  readonly playwright: { readonly version: typeof PLAYWRIGHT_VERSION };
  readonly chromium: {
    readonly version: typeof CHROMIUM_VERSION;
    readonly revision: typeof CHROMIUM_REVISION;
  };
  readonly project: { readonly id: string; readonly totalFrames: number; readonly fps: number };
  readonly output: { readonly path: string; readonly sha256: string };
  readonly profiles: readonly RenderProfile[];
  readonly snapshots: readonly PreparedTimelineArtifact[];
}

async function fileSha256(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

export function renderManifestPath(output: string): string {
  return `${resolve(output)}.manifest.json`;
}

export async function writeRenderManifest(input: {
  output: string;
  projectId: string;
  totalFrames: number;
  fps: number;
  artifacts: readonly PreparedTimelineArtifact[];
}): Promise<{ manifest: RenderManifest; manifestPath: string }> {
  const output = resolve(input.output);
  const bySnapshot = new Map<string, PreparedTimelineArtifact>();
  for (const artifact of input.artifacts) bySnapshot.set(artifact.snapshotId, artifact);
  const snapshots = Object.freeze(
    [...bySnapshot.values()].sort((left, right) =>
      left.nodeId.localeCompare(right.nodeId) || left.snapshotId.localeCompare(right.snapshotId)
    ),
  );
  const byProfile = new Map<string, RenderProfile>();
  for (const artifact of snapshots) byProfile.set(artifact.profile.hash, artifact.profile);
  const manifest = Object.freeze({
    schemaVersion: 1 as const,
    engine: Object.freeze({ name: "@fourier-video/render-engine" as const, version: "1.0.0" as const }),
    sdk: Object.freeze({
      name: "@fourier-video/sdk" as const,
      version: "1.1.0" as const,
      abiVersion: SDK_ABI_VERSION,
    }),
    playwright: Object.freeze({ version: PLAYWRIGHT_VERSION }),
    chromium: Object.freeze({ version: CHROMIUM_VERSION, revision: CHROMIUM_REVISION }),
    project: Object.freeze({ id: input.projectId, totalFrames: input.totalFrames, fps: input.fps }),
    output: Object.freeze({ path: output, sha256: await fileSha256(output) }),
    profiles: Object.freeze([...byProfile.values()].sort((left, right) => left.hash.localeCompare(right.hash))),
    snapshots,
  }) satisfies RenderManifest;
  const manifestPath = renderManifestPath(output);
  await Bun.write(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { manifest, manifestPath };
}
