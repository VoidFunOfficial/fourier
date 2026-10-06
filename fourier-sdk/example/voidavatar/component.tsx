import { Avatar, useState, type AvatarProps, type AvatarTimeline } from "@fourier-video/sdk/avatar";
import { createVoidBackend, voidavatarHybridSource } from "./cubism-source.ts";
import { voidavatarNativeSource } from "./cubism-native-source.ts";
import { createNativeSourceTimeline } from "./native-controls.ts";
import { createVoidTimeline, type VoidAnimationOptions } from "./animation.ts";

export type VoidAvatarProps = Pick<AvatarProps, "position" | "scale" | "opacity" | "style" | "className"> & {
  /** source renders the separate native Cubism export without Fourier mesh backends. */
  readonly mode?: "natural" | "source";
} & (
  | { readonly animation?: VoidAnimationOptions; readonly timeline?: never }
  | { readonly timeline: AvatarTimeline; readonly animation?: never }
);

/** Owns the complete character pipeline; callers choose performance and placement. */
export function VoidAvatar({ animation, timeline, mode = "natural", ...placement }: VoidAvatarProps) {
  // Avatar prepares animation/backend once per mount. Placement can change without
  // rebaking; use a new React key to replace the character's animation or mode.
  const [preparedTimeline] = useState(() => {
    const prepared = timeline ?? createVoidTimeline(animation);
    return mode === "source" ? createNativeSourceTimeline(prepared) : prepared;
  });
  return <Avatar {...placement} model={mode === "source" ? voidavatarNativeSource : voidavatarHybridSource}
    timeline={preparedTimeline}
    {...(mode === "natural" ? { createBackend: createVoidBackend } : {})} />;
}
