import type React from "react";
import type {
  FieldsSchema,
  InferFieldInputs,
  InferFields,
} from "./schema.ts";

export const SDK_ARTIFACT_SYMBOL_KEY = "@fourier-video/sdk/artifact";
export const SDK_ABI_VERSION = 1 as const;
export const DESIGN_PREVIEW_FPS = 60 as const;
export const MAX_DESIGN_PREVIEW_SECONDS = 30 as const;
export const SDK_ARTIFACT: unique symbol = Symbol.for(
  SDK_ARTIFACT_SYMBOL_KEY,
) as never;

export type ModifierFill = "none" | "forwards" | "backwards" | "both";
export type ModifierPhase = "before" | "active" | "after";
export type PreviewPriority = "primary" | "secondary" | "decorative";

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

/** Values that never change while one ABI v1 timeline instance is open. */
export interface FourierStableContext {
  readonly width: number;
  readonly height: number;
  readonly seed: number;
  /** Composition sampling rate used to resolve frame-based authoring values. */
  readonly fps: number;
  readonly durationInFrames: number;
  readonly durationMilliseconds: number;
}

export interface FourierLifecycle {
  fourierStart(): void;
  fourierEnd(): void;
}

export interface FourierAnimationOptions {
  /** Defaults to the host timeline duration. */
  duration?: number;
  delay?: number;
  iterations?: number;
  easing?: string;
  direction?: PlaybackDirection;
  fill?: FillMode;
}

/**
 * Host-controlled WAAPI subset. Native media and SVG SMIL elements are also
 * sampled by host absolute time; the returned native Animation is not exposed.
 */
export interface FourierTimeline {
  animate(
    target: Element,
    keyframes: Keyframe[] | PropertyIndexedKeyframes,
    options?: FourierAnimationOptions,
  ): void;
}

export type FourierPrng = () => number;

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

/** Mandatory author-facing design preview duration. */
export interface DesignPreviewComposition {
  width: number;
  height: number;
  /** 0 means a static preview; dynamic previews accept integer seconds 1—30. */
  durationSeconds: number;
}

/** SDK-resolved composition shared by testing, server, and player Adapters. */
export interface PreviewComposition extends DesignPreviewComposition {
  readonly fps: typeof DESIGN_PREVIEW_FPS;
  /** Static previews expose exactly one renderable frame. */
  readonly durationInFrames: number;
  readonly static: boolean;
}

export interface FontSource {
  family: string;
  /** Absolute path or file: URL. */
  source: string;
}

export interface PlayerOptions {
  background?: "checkerboard" | string;
  loop?: boolean;
}

interface DesignPreviewBase<Schema extends FieldsSchema> {
  props: InferFieldInputs<Schema>;
  composition: DesignPreviewComposition;
  fonts?: readonly FontSource[];
  seed?: number;
  player?: PlayerOptions;
}

export type MotionSubject =
  | Exclude<React.ReactNode, undefined>
  | ((input: { frame: number; context: Readonly<RenderContext> }) => React.ReactNode);

export interface MotionTiming {
  startFrame: number;
  durationInFrames: number;
  fill: ModifierFill;
}

export type ReactDesignPreview<Schema extends FieldsSchema> =
  DesignPreviewBase<Schema> & { subject?: never; motion?: never };

export type MotionDesignPreview<Schema extends FieldsSchema> =
  DesignPreviewBase<Schema> & {
    subject: MotionSubject;
    motion?: Partial<MotionTiming>;
  };

/** Preview declaration for an FFmpeg-composited video Motion. */
export type VideoMotionDesignPreview<Schema extends FieldsSchema> =
  DesignPreviewBase<Schema> & {
    subject?: never;
    motion?: Partial<MotionTiming>;
  };

/** Opaque identity for the video owned by a Project JSX video host. */
export interface FourierVideoHandle {
  readonly id: string;
}

export interface MotionPreviewInput<Schema extends FieldsSchema> {
  props: Readonly<InferFields<Schema>>;
  context: Readonly<MotionPreviewContext>;
}

export interface MotionOverlayInput<Schema extends FieldsSchema> {
  subject: React.ReactNode;
  props: Readonly<InferFields<Schema>>;
  context: Readonly<MotionPreviewContext>;
  descriptor: Readonly<MotionPreviewDescriptor>;
}

export interface ReactComponentInput<Schema extends FieldsSchema> {
  props: Readonly<InferFields<Schema>>;
}

export interface DomReactDefinition<Schema extends FieldsSchema> {
  name: string;
  schema: Schema;
  /**
   * Declares that production pixels are invariant across the host timeline.
   * The DOM runtime verifies that no lifecycle or animation is registered.
   */
  static?: boolean;
  render?: never;
  component(input: ReactComponentInput<Schema>): React.ReactNode;
  designPreview(): ReactDesignPreview<Schema>;
}

export interface MotionComponentInput<Schema extends FieldsSchema> {
  subject: React.ReactNode;
  props: Readonly<InferFields<Schema>>;
}

export interface VideoMotionComponentInput<Schema extends FieldsSchema> {
  video: Readonly<FourierVideoHandle>;
  props: Readonly<InferFields<Schema>>;
}

/** Text Motion input. Implementations receive source text, never a pre-rendered subject. */
export interface TextMotionComponentInput<Schema extends FieldsSchema> {
  text: string;
  props: Readonly<InferFields<Schema>>;
}

interface DomMotionDefinitionBase<Schema extends FieldsSchema> {
  name: string;
  schema: Schema;
  render?: never;
  videoComposition?: never;
  component(input: MotionComponentInput<Schema>): React.ReactNode;
  designPreview(): MotionDesignPreview<Schema>;
  preview?(input: MotionPreviewInput<Schema>): MotionPreviewDescriptor;
  overlay?(input: MotionOverlayInput<Schema>): React.ReactNode;
}

export type DomMotionDefinition<Schema extends FieldsSchema> =
  DomMotionDefinitionBase<Schema> & (
    | {
        supportsTextMotion: false;
        textComponent?: never;
      }
    | {
        supportsTextMotion: true;
        textComponent(input: TextMotionComponentInput<Schema>): React.ReactNode;
      }
  );

export interface DomFfmpegVideoMotionDefinition<Schema extends FieldsSchema> {
  name: string;
  schema: Schema;
  render?: never;
  videoComposition: "ffmpeg";
  supportsTextMotion?: never;
  textComponent?: never;
  overlay?: never;
  component(input: VideoMotionComponentInput<Schema>): React.ReactNode;
  designPreview(): VideoMotionDesignPreview<Schema>;
  preview?(input: MotionPreviewInput<Schema>): MotionPreviewDescriptor;
}

export type ReactDefinition<Schema extends FieldsSchema> = DomReactDefinition<Schema>;
export type MotionDefinition<Schema extends FieldsSchema> =
  | DomMotionDefinition<Schema>
  | DomFfmpegVideoMotionDefinition<Schema>;

interface ArtifactMetadataBase<Schema extends FieldsSchema> {
  readonly package: "@fourier-video/sdk";
  readonly sdkAbiVersion: typeof SDK_ABI_VERSION;
  readonly name: string;
  readonly schema: Readonly<Schema>;
}

export interface DomReactArtifactMetadata<Schema extends FieldsSchema>
  extends ArtifactMetadataBase<Schema> {
  readonly kind: "react";
  readonly renderer: "dom-timeline";
  readonly static?: boolean;
  readonly component: DomReactDefinition<Schema>["component"];
  readonly designPreview: DomReactDefinition<Schema>["designPreview"];
}

interface DomMotionArtifactMetadataBase<Schema extends FieldsSchema>
  extends ArtifactMetadataBase<Schema> {
  readonly kind: "motion";
  readonly renderer: "dom-timeline";
  readonly component: DomMotionDefinition<Schema>["component"];
  readonly designPreview: DomMotionDefinition<Schema>["designPreview"];
  readonly preview?: DomMotionDefinition<Schema>["preview"];
  readonly overlay?: DomMotionDefinition<Schema>["overlay"];
}

export type DomMotionArtifactMetadata<Schema extends FieldsSchema> =
  DomMotionArtifactMetadataBase<Schema> & (
    | {
        readonly supportsTextMotion: false;
        readonly textComponent?: never;
      }
    | {
        readonly supportsTextMotion: true;
        readonly textComponent: (input: TextMotionComponentInput<Schema>) => React.ReactNode;
      }
  );

export interface DomFfmpegVideoMotionArtifactMetadata<Schema extends FieldsSchema>
  extends ArtifactMetadataBase<Schema> {
  readonly kind: "motion";
  readonly renderer: "dom-timeline-ffmpeg-video";
  readonly videoComposition: "ffmpeg";
  readonly component: DomFfmpegVideoMotionDefinition<Schema>["component"];
  readonly designPreview: DomFfmpegVideoMotionDefinition<Schema>["designPreview"];
  readonly preview?: DomFfmpegVideoMotionDefinition<Schema>["preview"];
}

export type ReactArtifactMetadata<Schema extends FieldsSchema> =
  DomReactArtifactMetadata<Schema>;
export type MotionArtifactMetadata<Schema extends FieldsSchema> =
  | DomMotionArtifactMetadata<Schema>
  | DomFfmpegVideoMotionArtifactMetadata<Schema>;
export type ArtifactMetadata<Schema extends FieldsSchema> =
  | ReactArtifactMetadata<Schema>
  | MotionArtifactMetadata<Schema>;

export type DomReactArtifact<Schema extends FieldsSchema> = ((
  props: InferFields<Schema>,
) => React.ReactNode) & { readonly [SDK_ARTIFACT]: DomReactArtifactMetadata<Schema> };

export type DomMotionArtifact<Schema extends FieldsSchema> = ((input: {
  subject: React.ReactNode;
  props: InferFields<Schema>;
}) => React.ReactNode) & { readonly [SDK_ARTIFACT]: DomMotionArtifactMetadata<Schema> };

export type DomFfmpegVideoMotionArtifact<Schema extends FieldsSchema> = ((input: {
  video: FourierVideoHandle;
  props: InferFields<Schema>;
}) => React.ReactNode) & {
  readonly [SDK_ARTIFACT]: DomFfmpegVideoMotionArtifactMetadata<Schema>;
};

export type ReactArtifact<Schema extends FieldsSchema> = DomReactArtifact<Schema>;
export type MotionArtifact<Schema extends FieldsSchema> =
  | DomMotionArtifact<Schema>
  | DomFfmpegVideoMotionArtifact<Schema>;

export type AnyArtifact =
  | (((...args: any[]) => React.ReactNode) & {
      readonly [SDK_ARTIFACT]: ReactArtifactMetadata<any>;
    })
  | (((...args: any[]) => React.ReactNode) & {
      readonly [SDK_ARTIFACT]: MotionArtifactMetadata<any>;
    });
export type SchemaOf<Artifact> = Artifact extends {
  readonly [SDK_ARTIFACT]: ArtifactMetadata<infer Schema>;
}
  ? Schema
  : never;
export type PropsOf<Artifact> = InferFields<SchemaOf<Artifact>>;
export type InputPropsOf<Artifact> = InferFieldInputs<SchemaOf<Artifact>>;

interface PreviewDefinitionBase<Artifact extends AnyArtifact> {
  artifact: Artifact;
  props: InputPropsOf<Artifact>;
  composition: DesignPreviewComposition;
  fonts?: readonly FontSource[];
  seed?: number;
  player?: PlayerOptions;
}

export type ReactPreviewDefinition<Artifact extends AnyArtifact> =
  PreviewDefinitionBase<Artifact> & { subject?: never; motion?: never };
export type MotionPreviewDefinition<Artifact extends AnyArtifact> =
  PreviewDefinitionBase<Artifact> & { subject: MotionSubject; motion?: Partial<MotionTiming> };
export type VideoMotionPreviewDefinition<Artifact extends AnyArtifact> =
  PreviewDefinitionBase<Artifact> & { subject?: never; motion?: Partial<MotionTiming> };
export type PreviewDefinition<Artifact extends AnyArtifact = AnyArtifact> =
  Artifact extends unknown
    ? Artifact[typeof SDK_ARTIFACT] extends ReactArtifactMetadata<any>
      ? ReactPreviewDefinition<Artifact>
      : Artifact[typeof SDK_ARTIFACT] extends DomFfmpegVideoMotionArtifactMetadata<any>
        ? VideoMotionPreviewDefinition<Artifact>
      : Artifact[typeof SDK_ARTIFACT] extends MotionArtifactMetadata<any>
        ? MotionPreviewDefinition<Artifact>
        : never
    : never;

interface PreviewConfigBase<Artifact extends AnyArtifact> {
  artifact: Artifact;
  props: PropsOf<Artifact>;
  composition: PreviewComposition;
  fonts?: readonly FontSource[];
  seed?: number;
  player?: PlayerOptions;
}

export type ReactPreviewConfig<Artifact extends AnyArtifact> =
  PreviewConfigBase<Artifact> & { subject?: never; motion?: never };
export type MotionPreviewConfig<Artifact extends AnyArtifact> =
  PreviewConfigBase<Artifact> & { subject: MotionSubject; motion?: Readonly<Required<MotionTiming>> };
export type VideoMotionPreviewConfig<Artifact extends AnyArtifact> =
  PreviewConfigBase<Artifact> & { subject?: never; motion?: Readonly<Required<MotionTiming>> };
export type PreviewConfig<Artifact extends AnyArtifact = AnyArtifact> =
  Artifact extends unknown
    ? Artifact[typeof SDK_ARTIFACT] extends ReactArtifactMetadata<any>
      ? ReactPreviewConfig<Artifact>
      : Artifact[typeof SDK_ARTIFACT] extends DomFfmpegVideoMotionArtifactMetadata<any>
        ? VideoMotionPreviewConfig<Artifact>
      : Artifact[typeof SDK_ARTIFACT] extends MotionArtifactMetadata<any>
        ? MotionPreviewConfig<Artifact>
        : never
    : never;
