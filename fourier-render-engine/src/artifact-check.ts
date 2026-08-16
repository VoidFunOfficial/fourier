import { resolve } from "node:path";
import { compileVisualArtifact } from "./artifact-compiler.ts";
import { checkBrowserRuntime, type BrowserCheckResult } from "./browser-check.ts";

export interface ArtifactCheckResult {
  readonly valid: true;
  readonly entryPath: string;
  readonly sdkAbiVersion: 1;
  readonly renderer: "dom-timeline" | "dom-timeline-ffmpeg-video";
  readonly snapshotId: string;
  readonly warnings: readonly never[];
  readonly browser?: BrowserCheckResult;
}

export async function checkArtifact(entryPath: string): Promise<ArtifactCheckResult> {
  const resolvedEntryPath = resolve(entryPath);
  const artifact = await compileVisualArtifact({ entryPath: resolvedEntryPath });
  const browser = await checkBrowserRuntime();
  return Object.freeze({
    valid: true,
    entryPath: resolvedEntryPath,
    sdkAbiVersion: 1,
    renderer: artifact.renderer,
    snapshotId: artifact.snapshotId,
    warnings: Object.freeze([]),
    browser,
  });
}
