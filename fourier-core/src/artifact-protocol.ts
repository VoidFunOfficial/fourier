import type React from "react";
import { fail } from "./errors.ts";
import { parseTimeToFrames } from "./time.ts";
import type {
  MotionContext,
  MotionPreviewContext,
  MotionPreviewDescriptor,
  RenderContext,
} from "./integration-types.ts";

export const SDK_ARTIFACT_SYMBOL_KEY = "@fourier-video/sdk/artifact";
export const SDK_ARTIFACT: unique symbol = Symbol.for(SDK_ARTIFACT_SYMBOL_KEY) as never;
export const SDK_ARTIFACT_SYMBOL = SDK_ARTIFACT;
export const SDK_ABI_VERSION = 1.1 as const;
export const SUPPORTED_SDK_ABI_VERSIONS = Object.freeze([1, SDK_ABI_VERSION] as const);
export const SUPPORTED_SDK_ABI_VERSION = SDK_ABI_VERSION;
export const SDK_SCHEMA_FIELD_PACKAGE = "@fourier-video/sdk/schema-field" as const;
export const SDK_SCHEMA_VERSION = 1 as const;
export type SupportedSdkAbiVersion = (typeof SUPPORTED_SDK_ABI_VERSIONS)[number];

export function isSupportedSdkAbiVersion(value: unknown): value is SupportedSdkAbiVersion {
  return SUPPORTED_SDK_ABI_VERSIONS.some((version) => version === value);
}

export type ArtifactKind = "react" | "motion";

export type ArtifactPropDeclaration =
  | "string"
  | "number"
  | "boolean"
  | "color"
  | "time"
  | null;

export interface SdkSchemaField {
  package: "@fourier-video/sdk/schema-field";
  schemaVersion: 1;
  kind: "string" | "number" | "boolean" | "color" | "time" | "enum" | "asset" | "node";
  hasDefault: boolean;
  defaultValue?: unknown;
  min?: number;
  max?: number;
  integer?: boolean;
  minLength?: number;
  maxLength?: number;
  values?: readonly string[];
  accept?: readonly string[];
}

export type SdkArtifactSchema = Readonly<Record<string, SdkSchemaField>>;

interface SdkArtifactMetadataBase {
  package: "@fourier-video/sdk";
  sdkAbiVersion: SupportedSdkAbiVersion;
  kind: ArtifactKind;
  name: string;
  schema: SdkArtifactSchema;
  designPreview(): unknown;
}

interface SdkMotionPreviewMetadata {
  preview?(input: {
    props: Readonly<Record<string, unknown>>;
    context: Readonly<MotionPreviewContext>;
  }): MotionPreviewDescriptor;
  overlay?(input: {
    subject: React.ReactNode;
    props: Readonly<Record<string, unknown>>;
    context: Readonly<MotionPreviewContext>;
    descriptor: Readonly<MotionPreviewDescriptor>;
  }): React.ReactNode;
}

export interface SdkDomReactArtifactMetadata extends SdkArtifactMetadataBase {
  sdkAbiVersion: SupportedSdkAbiVersion;
  renderer: "dom-timeline";
  kind: "react";
  static?: boolean;
  component(input: {
    props: Readonly<Record<string, unknown>>;
  }): React.ReactNode;
}

interface SdkDomMotionArtifactMetadataBase extends SdkArtifactMetadataBase {
  sdkAbiVersion: SupportedSdkAbiVersion;
  renderer: "dom-timeline";
  kind: "motion";
  component(input: {
    subject: React.ReactNode;
    props: Readonly<Record<string, unknown>>;
  }): React.ReactNode;
  preview?: SdkMotionPreviewMetadata["preview"];
  overlay?: SdkMotionPreviewMetadata["overlay"];
}

export type SdkDomMotionArtifactMetadata = SdkDomMotionArtifactMetadataBase & (
  | {
      supportsTextMotion: false;
      textComponent?: never;
    }
  | {
      supportsTextMotion: true;
      textComponent(input: {
        text: string;
        props: Readonly<Record<string, unknown>>;
      }): React.ReactNode;
    }
);

export interface SdkDomFfmpegVideoMotionArtifactMetadata
  extends SdkArtifactMetadataBase {
  sdkAbiVersion: SupportedSdkAbiVersion;
  renderer: "dom-timeline-ffmpeg-video";
  kind: "motion";
  videoComposition: "ffmpeg";
  component(input: {
    video: Readonly<{ id: string }>;
    props: Readonly<Record<string, unknown>>;
  }): React.ReactNode;
  preview?: SdkMotionPreviewMetadata["preview"];
  supportsTextMotion?: never;
  textComponent?: never;
  overlay?: never;
}

export type SdkArtifactMetadata =
  | SdkDomReactArtifactMetadata
  | SdkDomMotionArtifactMetadata
  | SdkDomFfmpegVideoMotionArtifactMetadata;

function isObject(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === "object" && value !== null;
}

function validateSchema(schema: unknown, artifactName: string): asserts schema is SdkArtifactSchema {
  if (!isObject(schema) || Array.isArray(schema)) {
    fail("INVALID_ARTIFACT_SCHEMA", `${artifactName}.schema 必须是字段对象`);
  }
  for (const [name, raw] of Object.entries(schema)) {
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) || !isObject(raw)) {
      fail("INVALID_ARTIFACT_SCHEMA", `${artifactName}.schema.${name} 无效`);
    }
    const field = raw as unknown as SdkSchemaField;
    if (
      field.package !== "@fourier-video/sdk/schema-field" ||
      field.schemaVersion !== 1 ||
      !["string", "number", "boolean", "color", "time", "enum", "asset", "node"].includes(field.kind) ||
      typeof field.hasDefault !== "boolean"
    ) {
      fail("INVALID_ARTIFACT_SCHEMA", `${artifactName}.schema.${name} 不是兼容字段定义`);
    }
  }
}

export function assertSynchronousArtifactResult<T>(
  value: T,
  operation: string,
): T {
  if (
    isObject(value) &&
    typeof value.then === "function"
  ) {
    fail(
      "ARTIFACT_ASYNC_RENDER_UNSUPPORTED",
      `${operation} 必须同步返回`,
    );
  }
  return value;
}

export function readSdkArtifact(
  artifact: unknown,
  expectedKind: "react",
): SdkDomReactArtifactMetadata | undefined;
export function readSdkArtifact(
  artifact: unknown,
  expectedKind: "motion",
): SdkDomMotionArtifactMetadata | SdkDomFfmpegVideoMotionArtifactMetadata | undefined;
export function readSdkArtifact(
  artifact: unknown,
  expectedKind?: ArtifactKind,
): SdkArtifactMetadata | undefined;
export function readSdkArtifact(
  artifact: unknown,
  expectedKind?: ArtifactKind,
): SdkArtifactMetadata | undefined {
  if (
    (typeof artifact !== "function" && !isObject(artifact)) ||
    artifact === null
  ) {
    return undefined;
  }
  const metadata = (artifact as Record<PropertyKey, unknown>)[
    SDK_ARTIFACT_SYMBOL
  ];
  if (metadata === undefined) return undefined;
  if (!isObject(metadata) || metadata.package !== "@fourier-video/sdk") {
    fail(
      "ARTIFACT_EXPORT_INVALID",
      "SDK artifact marker 的内容无效",
    );
  }
  if (!isSupportedSdkAbiVersion(metadata.sdkAbiVersion)) {
    fail(
      "SDK_ABI_UNSUPPORTED",
      `不支持 SDK ABI ${String(metadata.sdkAbiVersion)}，当前支持 ${SUPPORTED_SDK_ABI_VERSIONS.join(", ")}`,
      { received: metadata.sdkAbiVersion, supported: SUPPORTED_SDK_ABI_VERSIONS },
    );
  }
  if (metadata.kind !== "react" && metadata.kind !== "motion") {
    fail(
      "ARTIFACT_EXPORT_INVALID",
      `SDK artifact kind 无效: ${String(metadata.kind)}`,
    );
  }
  if (expectedKind !== undefined && metadata.kind !== expectedKind) {
    fail(
      "ARTIFACT_KIND_MISMATCH",
      `期望 ${expectedKind} artifact，收到 ${metadata.kind}`,
      { expected: expectedKind, received: metadata.kind },
    );
  }
  if (typeof metadata.name !== "string" || metadata.name.length === 0) {
    fail(
      "ARTIFACT_EXPORT_INVALID",
      "SDK artifact 缺少有效的 name",
    );
  }
  if (
    !["dom-timeline", "dom-timeline-ffmpeg-video"].includes(String(metadata.renderer)) ||
    typeof metadata.component !== "function" ||
    typeof metadata.render === "function"
  ) {
    fail(
      "ARTIFACT_EXPORT_INVALID",
      "SDK ABI artifact 必须声明兼容 renderer component，且不能包含 render",
    );
  }
  if (
    metadata.renderer === "dom-timeline-ffmpeg-video" &&
    (metadata.kind !== "motion" || metadata.videoComposition !== "ffmpeg")
  ) {
    fail(
      "ARTIFACT_EXPORT_INVALID",
      "FFmpeg Video artifact 必须是 videoComposition=ffmpeg 的 Motion",
    );
  }
  if (
    metadata.renderer === "dom-timeline-ffmpeg-video" &&
    (metadata.supportsTextMotion !== undefined ||
      metadata.textComponent !== undefined ||
      metadata.overlay !== undefined)
  ) {
    fail(
      "ARTIFACT_EXPORT_INVALID",
      "FFmpeg Video Motion 不能声明 Text Motion 或 overlay",
    );
  }
  if (
    metadata.kind === "react" &&
    metadata.static !== undefined &&
    typeof metadata.static !== "boolean"
  ) {
    fail(
      "ARTIFACT_EXPORT_INVALID",
      "SDK ABI React artifact 的 static 必须是 boolean",
    );
  }
  validateSchema(metadata.schema, metadata.name);
  if (typeof metadata.designPreview !== "function") {
    fail(
      "DESIGN_PREVIEW_REQUIRED",
      `${metadata.name} 缺少强制 designPreview() 入口`,
    );
  }
  if (
    metadata.kind === "motion" &&
    metadata.renderer !== "dom-timeline-ffmpeg-video"
  ) {
    if (typeof metadata.supportsTextMotion !== "boolean") {
      fail(
        "TEXT_MOTION_CAPABILITY_REQUIRED",
        `${metadata.name} 必须显式声明 supportsTextMotion 为 true 或 false`,
      );
    }
    const textImplementation = metadata.textComponent;
    if (metadata.supportsTextMotion && typeof textImplementation !== "function") {
      fail(
        "TEXT_MOTION_IMPLEMENTATION_REQUIRED",
        `${metadata.name} 声明支持 Text Motion，但缺少独立实现`,
      );
    }
    if (!metadata.supportsTextMotion && textImplementation !== undefined) {
      fail(
        "ARTIFACT_EXPORT_INVALID",
        `${metadata.name} 不支持 Text Motion，不能携带 Text Motion 实现`,
      );
    }
    if (metadata.preview !== undefined && typeof metadata.preview !== "function") {
      fail("ARTIFACT_EXPORT_INVALID", "Motion artifact preview 必须是函数");
    }
    if (metadata.overlay !== undefined && typeof metadata.overlay !== "function") {
      fail("ARTIFACT_EXPORT_INVALID", "Motion artifact overlay 必须是函数");
    }
  }
  return metadata as unknown as SdkArtifactMetadata;
}

function schemaDeclaration(kind: SdkSchemaField["kind"]): Exclude<ArtifactPropDeclaration, null> | "unsupported" {
  if (kind === "number") return "number";
  if (kind === "boolean") return "boolean";
  if (kind === "color") return "color";
  if (kind === "time") return "time";
  if (kind === "node") return "unsupported";
  return "string";
}

function color(value: string, name: string): string {
  if (
    /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value) ||
    /^[a-zA-Z]+$/.test(value)
  ) {
    return value;
  }
  fail("INVALID_ARTIFACT_PROP", `${name} 不是受支持的颜色`, { field: name, value });
}

function decodeSchemaValue(
  name: string,
  field: SdkSchemaField,
  input: unknown,
  fps: number,
  fromProject: boolean,
): unknown {
  if (field.kind === "node") {
    if (fromProject) {
      fail(
        "ARTIFACT_PROP_PROJECT_UNSUPPORTED",
        `${name} 是可编程 ReactNode 字段，不能由 Fourier Project JSX props 赋值`,
        { field: name },
      );
    }
    if (input === undefined) fail("MISSING_ARTIFACT_PROP", `缺少必填字段 ${name}`, { field: name });
    return input;
  }
  if (field.kind === "number") {
    const value = input;
    if (typeof value !== "number" || !Number.isFinite(value)) {
      fail("INVALID_ARTIFACT_PROP", `${name} 必须是有限 number`, { field: name, value: input });
    }
    if (field.integer && !Number.isInteger(value)) {
      fail("INVALID_ARTIFACT_PROP", `${name} 必须是整数`, { field: name, value });
    }
    if (field.min !== undefined && value < field.min || field.max !== undefined && value > field.max) {
      fail("INVALID_ARTIFACT_PROP", `${name} 超出 schema 范围`, { field: name, value });
    }
    return value;
  }
  if (field.kind === "boolean") {
    const value = input;
    if (typeof value !== "boolean") {
      fail("INVALID_ARTIFACT_PROP", `${name} 必须是 true 或 false`, { field: name, value: input });
    }
    return value;
  }
  if (field.kind === "time") {
    if (
      isObject(input) &&
      typeof input.source === "string" &&
      Number.isInteger(input.frames) &&
      typeof input.seconds === "number"
    ) {
      return Object.freeze({ source: input.source, frames: input.frames, seconds: input.seconds });
    }
    if (typeof input !== "string") {
      fail("INVALID_ARTIFACT_PROP", `${name} 必须是时间字符串`, { field: name, value: input });
    }
    const frames = parseTimeToFrames(input, String(fps), `prop.${name}`);
    return Object.freeze({ source: input, frames, seconds: frames / fps });
  }
  if (typeof input !== "string") {
    fail("INVALID_ARTIFACT_PROP", `${name} 必须是 string`, { field: name, value: input });
  }
  if (field.kind === "color") return color(input, name);
  if (field.kind === "enum" && !field.values?.includes(input)) {
    fail("INVALID_ARTIFACT_PROP", `${name} 必须是 schema 枚举值`, { field: name, value: input });
  }
  if (field.minLength !== undefined && input.length < field.minLength || field.maxLength !== undefined && input.length > field.maxLength) {
    fail("INVALID_ARTIFACT_PROP", `${name} 长度超出 schema 范围`, { field: name, value: input });
  }
  return input;
}

export function bindSdkArtifactProps(
  artifact: unknown,
  input: Readonly<Record<string, unknown>>,
  options: {
    fps: number;
    declarations?: Readonly<Record<string, ArtifactPropDeclaration>>;
  },
): Readonly<Record<string, unknown>> {
  const metadata = readSdkArtifact(artifact);
  if (metadata === undefined) {
    const missingTypes = Object.entries(options.declarations ?? {})
      .filter(([, declaration]) => declaration === null)
      .map(([name]) => name);
    if (missingTypes.length > 0) {
      fail(
        "MISSING_ATTRIBUTE",
        `Legacy component 的 prop.type 必填: ${missingTypes.join(", ")}`,
        { fields: missingTypes },
      );
    }
    return Object.freeze({ ...input });
  }
  const unknown = Object.keys(input).filter((name) => !Object.hasOwn(metadata.schema, name));
  if (unknown.length > 0) {
    fail("UNKNOWN_ARTIFACT_PROP", `存在 schema 未声明字段: ${unknown.join(", ")}`, { fields: unknown });
  }
  const fromProject = options.declarations !== undefined;
  const result: Record<string, unknown> = {};
  for (const [name, field] of Object.entries(metadata.schema)) {
    const declaration = options.declarations?.[name];
    const expected = schemaDeclaration(field.kind);
    if (declaration !== undefined && declaration !== null && declaration !== expected) {
      fail(
        "ARTIFACT_PROP_TYPE_MISMATCH",
        `${name} 的 Project prop type=${declaration} 与 schema ${field.kind} 不相容`,
        { field: name, declared: declaration, schemaKind: field.kind },
      );
    }
    const hasValue = Object.hasOwn(input, name);
    if (!hasValue && !field.hasDefault) {
      fail("MISSING_ARTIFACT_PROP", `缺少必填字段 ${name}`, { field: name });
    }
    result[name] = decodeSchemaValue(
      name,
      field,
      hasValue ? input[name] : field.defaultValue,
      options.fps,
      fromProject,
    );
  }
  return Object.freeze(result);
}

export function assertArtifactComponent(
  artifact: unknown,
  expectedKind: ArtifactKind,
  label: string,
): unknown {
  readSdkArtifact(artifact, expectedKind);
  if (
    typeof artifact !== "function" &&
    (typeof artifact !== "object" || artifact === null)
  ) {
    fail("COMPONENT_EXPORT_NOT_FOUND", `${label} 不存在可渲染导出`);
  }
  return artifact;
}

export function createRenderContext(input: {
  frame: number;
  localFrame: number;
  fps: number;
  width: number;
  height: number;
  seed: number;
}): Readonly<RenderContext> {
  return Object.freeze({
    frame: input.frame,
    localFrame: input.localFrame,
    fps: input.fps,
    timeSeconds: input.frame / input.fps,
    localTimeSeconds: input.localFrame / input.fps,
    width: input.width,
    height: input.height,
    seed: input.seed,
  });
}

export function createMotionContext(input: {
  absoluteFrame: number;
  hostFrame: number;
  motionFrame: number;
  durationFrames: number;
  progress: number;
  phase: MotionContext["phase"];
  fps: number;
  width: number;
  height: number;
  seed: number;
}): Readonly<MotionContext> {
  return Object.freeze({ ...input });
}

export interface MotionPreviewExports {
  preview?: (input: {
    props: Record<string, unknown>;
    previewContext: MotionPreviewContext;
  }) => MotionPreviewDescriptor;
  Preview?: React.ComponentType<{
    subject: React.ReactNode;
    props: Record<string, unknown>;
    previewContext: MotionPreviewContext;
    descriptor: MotionPreviewDescriptor;
  }>;
}

export function resolveMotionPreviewExports(
  module: Record<string, unknown>,
  exportName: string,
  options: {
    declarations?: Readonly<Record<string, ArtifactPropDeclaration>>;
  } = {},
): MotionPreviewExports {
  const artifact = module[exportName];
  const metadata = readSdkArtifact(artifact);
  if (metadata !== undefined) {
    if (metadata.kind !== "motion") {
      fail(
        "ARTIFACT_KIND_MISMATCH",
        `Motion preview 期望 motion artifact，收到 ${metadata.kind}`,
      );
    }
    const preview = metadata.preview === undefined
      ? undefined
      : ((input: {
          props: Record<string, unknown>;
          previewContext: MotionPreviewContext;
        }) =>
          assertSynchronousArtifactResult(
            metadata.preview!({
              props: bindSdkArtifactProps(artifact, input.props, {
                fps: input.previewContext.fps,
                ...(options.declarations === undefined
                  ? {}
                  : { declarations: options.declarations }),
              }),
              context: Object.freeze(input.previewContext),
            }),
            `${metadata.name}.preview()`,
          ));
    const Preview = metadata.overlay === undefined
      ? undefined
      : ((input: {
          subject: React.ReactNode;
          props: Record<string, unknown>;
          previewContext: MotionPreviewContext;
          descriptor: MotionPreviewDescriptor;
        }) =>
          assertSynchronousArtifactResult(
            metadata.overlay!({
              subject: input.subject,
              props: bindSdkArtifactProps(artifact, input.props, {
                fps: input.previewContext.fps,
                ...(options.declarations === undefined
                  ? {}
                  : { declarations: options.declarations }),
              }),
              context: Object.freeze(input.previewContext),
              descriptor: Object.freeze(input.descriptor),
            }),
            `${metadata.name}.overlay()`,
          ));
    return {
      ...(preview === undefined ? {} : { preview }),
      ...(Preview === undefined ? {} : { Preview }),
    };
  }
  const legacy: MotionPreviewExports = {
    ...(module.preview === undefined
      ? {}
      : {
          preview: module.preview as NonNullable<MotionPreviewExports["preview"]>,
        }),
    ...(module.Preview === undefined
      ? {}
      : {
          Preview: module.Preview as NonNullable<MotionPreviewExports["Preview"]>,
        }),
  };
  return legacy;
}
