import { createHash } from "node:crypto";
import { arch, platform } from "node:os";
import { BROWSER_COMMIT_MODE } from "./browser-platform.ts";

export interface RenderProfile {
  readonly adapter: "legacy-satori" | "dom-timeline";
  readonly platform: string;
  readonly hash: string;
  readonly playwright?: typeof PLAYWRIGHT_VERSION;
  readonly chromiumRevision?: typeof CHROMIUM_REVISION;
  readonly chromiumVersion?: typeof CHROMIUM_VERSION;
  readonly commitMode?: typeof BROWSER_COMMIT_MODE;
  readonly runtimeRevision?: string;
}

export const PLAYWRIGHT_VERSION = "1.62.0" as const;
export const CHROMIUM_REVISION = "1234" as const;
export const CHROMIUM_VERSION = "151.0.7922.34" as const;

function profile(values: Omit<RenderProfile, "hash">): RenderProfile {
  return Object.freeze({
    ...values,
    hash: createHash("sha256").update(JSON.stringify(values)).digest("hex"),
  });
}

const hostPlatform = `${platform()}-${arch()}`;

export const LEGACY_RENDER_PROFILE = profile({
  adapter: "legacy-satori",
  platform: hostPlatform,
});

export const DOM_RENDER_PROFILE = profile({
  adapter: "dom-timeline",
  platform: hostPlatform,
  playwright: PLAYWRIGHT_VERSION,
  chromiumRevision: CHROMIUM_REVISION,
  chromiumVersion: CHROMIUM_VERSION,
  commitMode: BROWSER_COMMIT_MODE,
  // Bump whenever launch/commit semantics can change rendered pixels so stale
  // frame caches from the previous runtime are never reused.
  runtimeRevision: "5",
});
