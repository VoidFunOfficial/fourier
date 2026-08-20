import type React from "react";

/** Resolves an author-runtime package from the integrating package's install location. */
export type ResolveAuthorImport = (specifier: string) => string;

export interface ArtifactHostOptions {
  readonly resolveAuthorImport: ResolveAuthorImport;
}

export type ModifierFill = "none" | "forwards" | "backwards" | "both";
export type ModifierPhase = "before" | "active" | "after";

export interface RenderContext {
  frame: number;
  localFrame: number;
  fps: number;
  timeSeconds: number;
  localTimeSeconds: number;
  width: number;
  height: number;
  seed: number;
}

export interface MotionContext {
  absoluteFrame: number;
  hostFrame: number;
  motionFrame: number;
  durationFrames: number;
  progress: number;
  phase: ModifierPhase;
  fps: number;
  width: number;
  height: number;
  seed: number;
}

export type PreviewPriority = "primary" | "secondary" | "decorative";
export interface PreviewPoint { x: number; y: number }
export interface PreviewRect extends PreviewPoint { width: number; height: number }
export type PreviewAnnotation =
  | { kind: "ghost"; progress?: number; opacity?: number }
  | ({ kind: "outline"; rotation?: number; color?: string } & PreviewRect)
  | { kind: "arrow"; from: PreviewPoint; to: PreviewPoint; color?: string }
  | { kind: "path"; points: PreviewPoint[]; color?: string }
  | { kind: "arc"; center: PreviewPoint; radius: number; startAngle: number; endAngle: number; color?: string }
  | { kind: "label"; text: string; x?: number; y?: number; color?: string };

export interface MotionPreviewContext {
  projectId: string;
  motionId: string;
  hostId: string;
  fps: number;
  seed: number;
  anchorFrame: number;
  rangeStartFrame: number;
  rangeEndFrame: number;
  canvas: { width: number; height: number };
  host: { x: number; y: number; width: number; height: number; startFrame: number; endFrame: number };
  motion: { startFrame: number; endFrame: number; durationFrames: number };
}

export interface MotionPreviewDescriptor {
  representativeProgress?: number;
  priority?: PreviewPriority;
  annotations?: PreviewAnnotation[];
  overlayBounds?: PreviewRect[];
}

export type ArtifactSubject = React.ReactNode | ((input: {
  frame: number;
  context: Readonly<RenderContext>;
}) => React.ReactNode);
