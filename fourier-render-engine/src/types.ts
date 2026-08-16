import type { TemplatePropValue } from "@fourier-video/sdk/project";

export type NodeKind =
  | "video"
  | "audio"
  | "image"
  | "text"
  | "subtitle"
  | "react";

export type SceneOverflow = "error" | "clip" | "hold" | "loop";
export type SceneBlend =
  | "normal"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"
  | "addition";

export type FitMode = "cover" | "contain" | "stretch";
export type AnchorKind = "at" | "after" | "with";
export type ModifierFill = "none" | "forwards" | "backwards" | "both";
export type ModifierPhase = "before" | "active" | "after";
export type TransformEasing =
  | "linear"
  | "ease-in"
  | "ease-out"
  | "ease-in-out"
  | "step-start"
  | "step-end"
  | `cubic-bezier(${string})`;

export interface Canvas {
  width: number;
  height: number;
  fps: number;
  fpsSource: string;
  background: string;
  colorSpace: "sRGB";
}

export interface ProjectMetadata {
  id: string;
  version: "1.0";
  audioSampleRate: number;
}

export interface BaseVisualModifier {
  id: string;
  kind: "motion" | "transform";
  hostId: string;
  localStartFrame: number;
  localEndFrame: number;
  absoluteStartFrame: number;
  absoluteEndFrame: number;
  durationFrames: number;
  offsetFrames: number;
  fill: ModifierFill;
  enabled: boolean;
  declarationOrder: number;
}

export interface MotionNode extends BaseVisualModifier {
  kind: "motion";
  component: string;
  componentPath: string;
  exportName: string;
  props: Record<string, ReactPropValue>;
  propTypes?: Record<string, ReactPropType | null>;
}

export interface TransformChannels {
  translateX: number;
  translateY: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  opacity: number;
}

export interface TransformKeyframe extends TransformChannels {
  offset: number;
}

export interface TransformNode extends BaseVisualModifier {
  kind: "transform";
  easing: TransformEasing;
  keyframes: TransformKeyframe[];
}

export type VisualModifier = MotionNode | TransformNode;

export interface ResolvedTimeNode {
  id: string;
  kind: NodeKind | "group" | "scene" | "template";
  startFrame: number;
  endFrame: number;
  durationFrames: number;
  enabled: boolean;
  preview: boolean;
  declarationOrder: number;
}

export interface BaseRenderNode extends ResolvedTimeNode {
  kind: NodeKind;
  offsetFrames: number;
}

export interface VisualNode extends BaseRenderNode {
  kind: Exclude<NodeKind, "audio">;
  x: number;
  y: number;
  width: number;
  height: number;
  layer: number;
  opacity: number;
  rotation: number;
  modifiers: VisualModifier[];
}

export interface VideoNode extends VisualNode {
  kind: "video";
  src: string;
  sourcePath: string;
  inFrame: number;
  fit: FitMode;
  audio: boolean;
  rate: number;
  volume: number;
  loop: boolean;
}

export interface AudioNode extends BaseRenderNode {
  kind: "audio";
  src: string;
  sourcePath: string;
  inFrame: number;
  volume: number;
  rate: number;
  muted: boolean;
}

export interface ImageNode extends VisualNode {
  kind: "image";
  src: string;
  sourcePath: string;
  fit: FitMode;
}

export interface TextNode extends VisualNode {
  kind: "text" | "subtitle";
  autoWidth: boolean;
  autoHeight: boolean;
  role: "title" | "body" | "subtitle" | "label";
  font: string;
  fontPath: string;
  fontSize: number;
  lineHeight: number;
  color: string;
  align: "left" | "center" | "right";
  verticalAlign: "top" | "center" | "bottom";
  maxLines?: number;
  overflow: "clip" | "ellipsis";
  background?: string;
  content: string;
  voice?: SubtitleVoice;
}

export interface SubtitleVoice {
  style?: string;
  volume: number;
  reference?: string;
  sourcePath: string;
  samples: number;
  sampleRate: number;
  durationSeconds: number;
}

export interface TimePropValue {
  source: string;
  frames: number;
  seconds: number;
}

export type ReactPropValue = string | number | boolean | TimePropValue;
export type ReactPropType = "string" | "number" | "boolean" | "color" | "time";

export interface ReactNode extends VisualNode {
  kind: "react";
  component: string;
  componentPath: string;
  exportName: string;
  props: Record<string, ReactPropValue>;
  propTypes?: Record<string, ReactPropType | null>;
}

export type RenderNode =
  | VideoNode
  | AudioNode
  | ImageNode
  | TextNode
  | ReactNode;

export interface GroupNode extends ResolvedTimeNode {
  kind: "group";
  mode: "parallel" | "sequence";
  childIds: string[];
}

export interface RenderModuleNodeBase extends ResolvedTimeNode {
  kind: "scene" | "template";
  offsetFrames: number;
  src: string;
  moduleDir: string;
  sourcePath: string;
  rawDurationFrames: number;
  inFrame: number;
  outFrame: number;
  layer: number;
  opacity: number;
  blend: SceneBlend;
  audio: boolean;
  volume: number;
  overflow: SceneOverflow;
  project: ResolvedProject;
}

export interface SceneNode extends RenderModuleNodeBase {
  kind: "scene";
  sceneDir: string;
}

export interface TemplateParameterDefinition {
  name: string;
  kind: "string" | "number" | "boolean" | "color" | "time" | "enum" | "asset";
  defaultValue?: TemplatePropValue;
}

export type TemplateParameterSource = "explicit" | "default";

export interface TemplateNode extends RenderModuleNodeBase {
  kind: "template";
  templateDir: string;
  parameterContract: TemplateParameterDefinition[];
  bindings: Record<string, TemplatePropValue>;
  parameterSources: Record<string, TemplateParameterSource>;
}

export type RenderModuleNode = SceneNode | TemplateNode;

export interface RenderModuleUnit {
  nodeId: string;
  moduleKind: "scene" | "template";
  path: string;
  contentKey: string;
  unitKey: string;
}

export interface SceneRenderUnit extends RenderModuleUnit {
  moduleKind: "scene";
  sceneNodeId: string;
}

export interface TemplateRenderUnit extends RenderModuleUnit {
  moduleKind: "template";
  templateNodeId: string;
}

export interface ResolvedProject {
  metadata: ProjectMetadata;
  canvas: Canvas;
  projectDir: string;
  sourcePath?: string;
  sourceFingerprint?: string;
  declaredDurationFrames?: number;
  totalFrames: number;
  nodes: RenderNode[];
  sceneNodes: SceneNode[];
  templateNodes: TemplateNode[];
  groups: GroupNode[];
  timeNodes: Map<string, ResolvedTimeNode>;
  rootProjectDir: string;
  resourceRoots: string[];
}

export interface MediaStreamInfo {
  codec_type?: "video" | "audio" | string;
  duration?: string;
  sample_rate?: string;
}

export interface MediaProbe {
  format: { duration?: string };
  streams: MediaStreamInfo[];
}

export interface RenderProgress {
  phase: "validating" | "preparing" | "encoding" | "completed";
  progress: number;
  frame?: number;
  totalFrames: number;
  message?: string;
}

export interface RenderDiagnostic {
  phase: "validating" | "preparing" | "encoding" | "cleanup";
  scope: string;
  status:
    | "start"
    | "waiting"
    | "progress"
    | "complete"
    | "cache-hit"
    | "info"
    | "error";
  message: string;
  elapsedMs?: number;
  details?: Record<string, unknown>;
}

export interface RenderOptions {
  output: string;
  overwrite?: boolean;
  ffmpegPath?: string;
  ffprobePath?: string;
  crf?: number;
  preset?: string;
  frameConcurrency?: number;
  domPages?: number;
  validateMedia?: boolean;
  keepTemporaryFiles?: boolean;
  tts?: TtsOptions;
  signal?: AbortSignal;
  onProgress?: (progress: RenderProgress) => void;
  onDiagnostic?: (diagnostic: RenderDiagnostic) => void;
}

export interface TtsOptions {
  baseUrl?: string;
  modelPath?: string;
  cacheDirectory?: string;
  requestTimeoutMs?: number;
}

export interface SubtitleTtsArtifact {
  sourcePath: string;
  samples: number;
  sampleRate: number;
  durationSeconds: number;
}

export interface RenderResult {
  output: string;
  manifestPath: string;
  projectId: string;
  totalFrames: number;
  durationSeconds: number;
  elapsedMs: number;
}

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

export interface PreviewPoint {
  x: number;
  y: number;
}

export interface PreviewRect extends PreviewPoint {
  width: number;
  height: number;
}

export type PreviewAnnotation =
  | { kind: "ghost"; progress?: number; opacity?: number }
  | ({ kind: "outline"; rotation?: number; color?: string } & PreviewRect)
  | { kind: "arrow"; from: PreviewPoint; to: PreviewPoint; color?: string }
  | { kind: "path"; points: PreviewPoint[]; color?: string }
  | {
      kind: "arc";
      center: PreviewPoint;
      radius: number;
      startAngle: number;
      endAngle: number;
      color?: string;
    }
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
  host: {
    x: number;
    y: number;
    width: number;
    height: number;
    startFrame: number;
    endFrame: number;
  };
  motion: {
    startFrame: number;
    endFrame: number;
    durationFrames: number;
  };
}

export interface MotionPreviewDescriptor {
  representativeProgress?: number;
  priority?: PreviewPriority;
  annotations?: PreviewAnnotation[];
  overlayBounds?: PreviewRect[];
}

export interface PreviewOptions {
  output: string;
  anchor: string;
  rangeStart: string;
  rangeEnd: string;
  overwrite?: boolean;
  ffmpegPath?: string;
  ffprobePath?: string;
  frameConcurrency?: number;
  domPages?: number;
  validateMedia?: boolean;
  keepTemporaryFiles?: boolean;
  tts?: TtsOptions;
  signal?: AbortSignal;
  /** Internal/offscreen preview mode used by Scene composition. */
  transparentBackground?: boolean;
}

export interface PreviewResult {
  output: string;
  projectId: string;
  totalFrames: number;
  durationSeconds: number;
  anchorFrame: number;
  rangeStartFrame: number;
  rangeEndFrame: number;
  selectedNodeIds: string[];
  annotatedModifierIds: string[];
  elapsedMs: number;
}
