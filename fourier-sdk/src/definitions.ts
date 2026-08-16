import React from "react";
import { sdkFail } from "./errors.ts";
import { defineSchema, type FieldsSchema } from "./schema.ts";
import {
  SDK_ABI_VERSION,
  SDK_ARTIFACT,
  type ArtifactMetadata,
  type DomMotionArtifact,
  type DomMotionArtifactMetadata,
  type DomMotionDefinition,
  type DomFfmpegVideoMotionArtifact,
  type DomFfmpegVideoMotionArtifactMetadata,
  type DomFfmpegVideoMotionDefinition,
  type DomReactArtifact,
  type DomReactArtifactMetadata,
  type DomReactDefinition,
  type MotionArtifact,
  type MotionDefinition,
  type ReactArtifact,
  type ReactDefinition,
} from "./types.ts";

function validateName(name: unknown, kind: string): asserts name is string {
  if (typeof name !== "string" || name.trim().length === 0) {
    sdkFail("INVALID_ARTIFACT_DEFINITION", `${kind} definition.name 必须是非空字符串`);
  }
}

function synchronous<T>(value: T, operation: string): T {
  if (typeof value === "object" && value !== null && "then" in value && typeof (value as { then?: unknown }).then === "function") {
    sdkFail("ARTIFACT_ASYNC_RENDER_UNSUPPORTED", `${operation} 必须同步返回`);
  }
  return value;
}

function validateDefinition(
  definition: { render?: unknown; component?: unknown; designPreview?: unknown },
  kind: string,
): void {
  if (typeof definition.designPreview !== "function") {
    sdkFail(
      "DESIGN_PREVIEW_REQUIRED",
      `${kind} definition.designPreview 必须实现；SDK artifact 不允许缺少设计预览入口`,
    );
  }
  if (typeof definition.component !== "function" || definition.render !== undefined) {
    sdkFail(
      "INVALID_ARTIFACT_DEFINITION",
      `${kind} definition 必须提供 component，且不能提供 render`,
    );
  }
}

function attachMetadata<Artifact extends Function>(
  artifact: Artifact,
  metadata: ArtifactMetadata<any>,
): Artifact {
  Object.defineProperty(artifact, SDK_ARTIFACT, {
    value: Object.freeze(metadata),
    enumerable: false,
    configurable: false,
    writable: false,
  });
  Object.defineProperty(artifact, "displayName", {
    value: metadata.name,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return Object.freeze(artifact);
}

export function defineReact<const Schema extends FieldsSchema>(
  definition: DomReactDefinition<Schema>,
): DomReactArtifact<Schema>;
export function defineReact<const Schema extends FieldsSchema>(
  definition: ReactDefinition<Schema>,
): ReactArtifact<Schema> {
  validateName(definition?.name, "React");
  validateDefinition(definition, "React");
  const schema = defineSchema(definition.schema);
  const designPreview = () => synchronous(
    definition.designPreview(),
    `${definition.name}.designPreview()`,
  );

  const dom = definition as DomReactDefinition<Schema>;
  if (dom.static !== undefined && typeof dom.static !== "boolean") {
    sdkFail(
      "INVALID_ARTIFACT_DEFINITION",
      "React definition.static 必须是 boolean",
    );
  }
  const component: DomReactDefinition<Schema>["component"] = (input) =>
    synchronous(dom.component(input), `${definition.name}.component()`);
  const metadata: DomReactArtifactMetadata<Schema> = {
    package: "@fourier-video/sdk",
    sdkAbiVersion: SDK_ABI_VERSION,
    renderer: "dom-timeline",
    kind: "react",
    name: definition.name,
    schema,
    ...(dom.static === undefined ? {} : { static: dom.static }),
    component,
    designPreview,
  };
  const artifact = ((props: Parameters<DomReactArtifact<Schema>>[0]) =>
    React.createElement(component, { props: Object.freeze({ ...props }) })) as DomReactArtifact<Schema>;
  return attachMetadata(artifact, metadata as DomReactArtifactMetadata<any>);
}

export function defineMotion<const Schema extends FieldsSchema>(
  definition: DomMotionDefinition<Schema>,
): DomMotionArtifact<Schema>;
export function defineMotion<const Schema extends FieldsSchema>(
  definition: DomFfmpegVideoMotionDefinition<Schema>,
): DomFfmpegVideoMotionArtifact<Schema>;
export function defineMotion<const Schema extends FieldsSchema>(
  definition: MotionDefinition<Schema>,
): MotionArtifact<Schema> {
  validateName(definition?.name, "Motion");
  validateDefinition(definition, "Motion");
  const ffmpegVideo =
    (definition as { videoComposition?: unknown }).videoComposition === "ffmpeg";
  if (!ffmpegVideo && typeof definition.supportsTextMotion !== "boolean") {
    sdkFail(
      "TEXT_MOTION_CAPABILITY_REQUIRED",
      "Motion definition.supportsTextMotion 必须显式声明为 true 或 false",
    );
  }
  const textImplementation = ffmpegVideo
    ? undefined
    : (definition as { textComponent?: unknown }).textComponent;
  if (!ffmpegVideo && definition.supportsTextMotion && typeof textImplementation !== "function") {
    sdkFail(
      "TEXT_MOTION_IMPLEMENTATION_REQUIRED",
      "支持 Text Motion 时必须单独实现 definition.textComponent",
    );
  }
  if (!ffmpegVideo && !definition.supportsTextMotion && textImplementation !== undefined) {
    sdkFail(
      "INVALID_ARTIFACT_DEFINITION",
      "不支持 Text Motion 时不能提供 Text Motion 实现",
    );
  }
  if (definition.preview !== undefined && typeof definition.preview !== "function") {
    sdkFail("INVALID_ARTIFACT_DEFINITION", "Motion definition.preview 必须是函数");
  }
  if (definition.overlay !== undefined && typeof definition.overlay !== "function") {
    sdkFail("INVALID_ARTIFACT_DEFINITION", "Motion definition.overlay 必须是函数");
  }
  if (ffmpegVideo && definition.overlay !== undefined) {
    sdkFail(
      "INVALID_ARTIFACT_DEFINITION",
      "FFmpeg Video Motion 不能提供 overlay",
    );
  }
  const schema = defineSchema(definition.schema);
  const designPreview = () => synchronous(
    definition.designPreview(),
    `${definition.name}.designPreview()`,
  );
  const preview = definition.preview === undefined
    ? undefined
    : ((input: Parameters<NonNullable<typeof definition.preview>>[0]) =>
      synchronous(definition.preview!(input), `${definition.name}.preview()`));
  const overlay = definition.overlay === undefined
    ? undefined
    : ((input: Parameters<NonNullable<typeof definition.overlay>>[0]) =>
      synchronous(definition.overlay!(input), `${definition.name}.overlay()`));

  if (ffmpegVideo) {
    const dom = definition as DomFfmpegVideoMotionDefinition<Schema>;
    const component: DomFfmpegVideoMotionDefinition<Schema>["component"] = (input) =>
      synchronous(dom.component(input), `${definition.name}.component()`);
    const metadata: DomFfmpegVideoMotionArtifactMetadata<Schema> = {
      package: "@fourier-video/sdk",
      sdkAbiVersion: SDK_ABI_VERSION,
      renderer: "dom-timeline-ffmpeg-video",
      videoComposition: "ffmpeg",
      kind: "motion",
      name: definition.name,
      schema,
      component,
      designPreview: designPreview as DomFfmpegVideoMotionDefinition<Schema>["designPreview"],
      ...(preview === undefined ? {} : { preview }),
    };
    const artifact = ((input: Parameters<DomFfmpegVideoMotionArtifact<Schema>>[0]) =>
      React.createElement(component, {
        video: Object.freeze({ ...input.video }),
        props: Object.freeze({ ...input.props }),
      })) as DomFfmpegVideoMotionArtifact<Schema>;
    return attachMetadata(
      artifact,
      metadata as DomFfmpegVideoMotionArtifactMetadata<any>,
    );
  }

  const dom = definition as DomMotionDefinition<Schema>;
  const component: DomMotionDefinition<Schema>["component"] = (input) =>
    synchronous(dom.component(input), `${definition.name}.component()`);
  const textComponent = dom.supportsTextMotion
    ? ((input: Parameters<typeof dom.textComponent>[0]) =>
        synchronous(dom.textComponent(input), `${definition.name}.textComponent()`))
    : undefined;
  const metadata = {
    package: "@fourier-video/sdk",
    sdkAbiVersion: SDK_ABI_VERSION,
    renderer: "dom-timeline",
    kind: "motion",
    name: definition.name,
    schema,
    component,
    supportsTextMotion: dom.supportsTextMotion,
    ...(textComponent === undefined ? {} : { textComponent }),
    designPreview,
    ...(preview === undefined ? {} : { preview }),
    ...(overlay === undefined ? {} : { overlay }),
  } as DomMotionArtifactMetadata<Schema>;
  const artifact = ((input: Parameters<DomMotionArtifact<Schema>>[0]) =>
    React.createElement(component, {
      subject: input.subject,
      props: Object.freeze({ ...input.props }),
    })) as DomMotionArtifact<Schema>;
  return attachMetadata(artifact, metadata as DomMotionArtifactMetadata<any>);
}
