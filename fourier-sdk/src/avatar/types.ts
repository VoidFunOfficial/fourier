/** Avatar coordinates use pixels, with X right and Y down. Times are seconds. */
export type AvatarPoint = readonly [number, number];
export type AvatarRange = readonly [min: number, max: number, initial: number];
export type AvatarParameters = Readonly<Record<string, number>>;
export type AvatarBlend = "replace" | "add" | "multiply";
export interface AvatarKeyframe { readonly t: number; readonly value: number; readonly easing?: "linear" | "smooth" | "step" }
export type AvatarCurve = readonly AvatarKeyframe[];
export interface AvatarTrack {
  readonly parameter: string;
  readonly keys: AvatarCurve;
  readonly blend?: AvatarBlend;
}
export interface AvatarMotion {
  readonly duration: number;
  readonly loop?: boolean;
  readonly tracks: readonly AvatarTrack[];
}
export interface AvatarExpression {
  readonly parameters: AvatarParameters;
  readonly blend?: AvatarBlend;
}
export interface AvatarBinding {
  readonly parameter: string;
  readonly property: "x" | "y" | "rotation" | "scaleX" | "scaleY" | "opacity" | "zIndex";
  /** Keyframe t is the input parameter value, not time. */
  readonly keys: AvatarCurve;
  readonly blend?: AvatarBlend;
}
export interface AvatarMesh {
  readonly vertices: readonly number[];
  readonly uvs: readonly number[];
  readonly indices: readonly number[];
  /** Vertex deltas multiplied by the named parameter. */
  readonly blendShapes?: Readonly<Record<string, readonly number[]>>;
}
export interface AvatarLayer {
  readonly id: string;
  readonly parent?: string;
  /** Omit texture to create a transform-only deformer node. */
  readonly texture?: string;
  readonly size?: AvatarPoint;
  readonly position?: AvatarPoint;
  readonly anchor?: AvatarPoint;
  readonly rotation?: number;
  readonly scale?: AvatarPoint;
  readonly opacity?: number;
  readonly zIndex?: number;
  readonly masks?: readonly string[];
  readonly invertedMask?: boolean;
  readonly maskOnly?: boolean;
  readonly mesh?: AvatarMesh;
  readonly bindings?: readonly AvatarBinding[];
}
export interface AvatarSpring {
  readonly input: string;
  readonly output: string;
  readonly stiffness: number;
  readonly damping: number;
  readonly mass?: number;
  readonly gain?: number;
}
export interface AvatarModel {
  readonly version: 1;
  readonly name: string;
  readonly canvas: AvatarPoint;
  readonly parameters?: Readonly<Record<string, AvatarRange>>;
  readonly layers: readonly AvatarLayer[];
  readonly motions?: Readonly<Record<string, AvatarMotion>>;
  readonly expressions?: Readonly<Record<string, AvatarExpression>>;
  readonly physics?: readonly AvatarSpring[];
}
export type AvatarGesture = "idle" | "nod" | "shakeHead" | "point" | "thinking" | "explain" | "wave" | "emphasize";
export type AvatarTarget = "camera" | string | AvatarPoint;
export interface AvatarAction {
  readonly at: number;
  readonly action: AvatarGesture | "lookAt" | "emotion" | "react" | "smile" | "surprised" | "speak" | "motion";
  readonly duration?: number;
  readonly target?: AvatarTarget;
  readonly name?: string;
  readonly strength?: number;
  readonly priority?: number;
  readonly speech?: AvatarSpeech;
}
export type AvatarViseme = "sil" | "A" | "I" | "U" | "E" | "O" | "M" | "F";
export interface AvatarVisemeCue { readonly start: number; readonly end: number; readonly viseme: AvatarViseme; readonly strength?: number }
export interface AvatarSpeech {
  readonly version: 1;
  readonly audioHash: string;
  readonly duration: number;
  readonly cues: readonly AvatarVisemeCue[];
}
export interface AvatarTimelineOptions {
  readonly duration: number;
  readonly seed?: number;
  readonly idle?: boolean;
  readonly expression?: string;
  readonly lookAt?: AvatarTarget;
  readonly targets?: Readonly<Record<string, AvatarPoint>>;
  readonly actions?: readonly AvatarAction[];
  readonly speak?: AvatarSpeech;
  readonly parameters?: AvatarParameters;
}
export interface AvatarTimeline {
  readonly duration: number;
  /** Pure absolute-time sampling, including after backward or out-of-order seeks. */
  sample(timeSeconds: number): AvatarParameters;
}
export interface AvatarDrawable {
  readonly id: string;
  readonly texture: string;
  readonly vertices: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint16Array;
  readonly opacity: number;
  readonly order: number;
  readonly masks: readonly string[];
  readonly invertedMask?: boolean;
  readonly maskOnly?: boolean;
  readonly blend?: "normal" | "add" | "multiply";
  readonly multiplyColor?: readonly [number, number, number];
  readonly screenColor?: readonly [number, number, number];
}
export interface AvatarBackend {
  readonly canvas: AvatarPoint;
  readonly textures: readonly string[];
  sample(parameters: AvatarParameters): readonly AvatarDrawable[];
  dispose(): void;
}
