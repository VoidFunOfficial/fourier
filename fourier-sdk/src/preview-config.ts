import { sdkFail } from "./errors.ts";
import { bindSchemaProps } from "./schema.ts";
import {
  DESIGN_PREVIEW_FPS,
  MAX_DESIGN_PREVIEW_SECONDS,
  SDK_ARTIFACT,
  type AnyArtifact,
  type PreviewConfig,
  type PreviewDefinition,
} from "./types.ts";

function positiveInteger(value: unknown, field: string): number {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    sdkFail("INVALID_PREVIEW_CONFIG", `${field} 必须是正整数`, {
      field,
      value,
    });
  }
  return value as number;
}

function resolveDuration(composition: Readonly<Record<string, unknown>>): {
  durationSeconds: number;
  durationInFrames: number;
  static: boolean;
} {
  const durationSeconds = composition.durationSeconds;
  if (
    !Number.isInteger(durationSeconds) ||
    (durationSeconds !== 0 &&
      ((durationSeconds as number) < 1 ||
        (durationSeconds as number) > MAX_DESIGN_PREVIEW_SECONDS))
  ) {
    sdkFail(
      "INVALID_PREVIEW_DURATION",
      `composition.durationSeconds 必须为静态 0，或 1—${MAX_DESIGN_PREVIEW_SECONDS} 的整数秒`,
      { value: durationSeconds },
    );
  }
  const staticPreview = durationSeconds === 0;
  const durationInFrames = staticPreview
    ? 1
    : (durationSeconds as number) * DESIGN_PREVIEW_FPS;
  if (
    composition.fps !== undefined &&
    composition.fps !== DESIGN_PREVIEW_FPS
  ) {
    sdkFail(
      "DESIGN_PREVIEW_FPS_FIXED",
      `design preview fps 固定为 ${DESIGN_PREVIEW_FPS}，组件不能覆盖`,
      { value: composition.fps },
    );
  }
  if (
    composition.durationInFrames !== undefined &&
    composition.durationInFrames !== durationInFrames
  ) {
    sdkFail(
      "INVALID_PREVIEW_DURATION",
      "durationInFrames 必须由 SDK 根据 durationSeconds 求解",
      { value: composition.durationInFrames, expected: durationInFrames },
    );
  }
  if (
    composition.static !== undefined &&
    composition.static !== staticPreview
  ) {
    sdkFail(
      "INVALID_PREVIEW_DURATION",
      "static 必须由 SDK 根据 durationSeconds 求解",
      { value: composition.static, expected: staticPreview },
    );
  }
  return {
    durationSeconds: durationSeconds as number,
    durationInFrames,
    static: staticPreview,
  };
}

export function validatePreviewConfig<Artifact extends AnyArtifact>(
  config: PreviewDefinition<Artifact> | PreviewConfig<Artifact>,
): PreviewConfig<Artifact> {
  if (typeof config !== "object" || config === null) {
    sdkFail("INVALID_PREVIEW_CONFIG", "preview config 必须是对象");
  }
  const metadata = config.artifact?.[SDK_ARTIFACT];
  if (metadata === undefined) {
    sdkFail(
      "ARTIFACT_EXPORT_INVALID",
      "preview config.artifact 必须由 defineReact 或 defineMotion 创建",
    );
  }
  if (
    typeof config.props !== "object" ||
    config.props === null ||
    Array.isArray(config.props)
  ) {
    sdkFail("INVALID_PREVIEW_CONFIG", "preview config.props 必须是对象");
  }
  if (typeof config.composition !== "object" || config.composition === null) {
    sdkFail("INVALID_PREVIEW_CONFIG", "composition 必须是对象");
  }
  const width = positiveInteger(config.composition.width, "composition.width");
  const height = positiveInteger(config.composition.height, "composition.height");
  const duration = resolveDuration(
    config.composition as unknown as Readonly<Record<string, unknown>>,
  );
  if (
    config.seed !== undefined &&
    (!Number.isInteger(config.seed) || config.seed < 0)
  ) {
    sdkFail("INVALID_PREVIEW_CONFIG", "seed 必须是非负整数");
  }
  for (const [index, font] of (config.fonts ?? []).entries()) {
    if (font.family.trim().length === 0 || font.source.trim().length === 0) {
      sdkFail(
        "INVALID_PREVIEW_CONFIG",
        `fonts[${index}] 的 family/source 必须是非空字符串`,
      );
    }
  }
  if (metadata.kind === "motion") {
    const motionConfig = config as PreviewDefinition<AnyArtifact> & {
      subject?: unknown;
      motion?: {
        startFrame?: number;
        durationInFrames?: number;
        fill?: string;
      };
    };
    if (
      (!("renderer" in metadata) ||
        metadata.renderer !== "dom-timeline-ffmpeg-video") &&
      motionConfig.subject === undefined
    ) {
      sdkFail("INVALID_PREVIEW_CONFIG", "Motion preview 必须声明 subject");
    }
    const startFrame = motionConfig.motion?.startFrame ?? 0;
    const motionDuration =
      motionConfig.motion?.durationInFrames ?? duration.durationInFrames;
    if (!Number.isInteger(startFrame) || startFrame < 0) {
      sdkFail("INVALID_PREVIEW_CONFIG", "motion.startFrame 必须是非负整数");
    }
    positiveInteger(motionDuration, "motion.durationInFrames");
    if (startFrame + motionDuration > duration.durationInFrames) {
      sdkFail(
        "INVALID_PREVIEW_CONFIG",
        "Motion 时间范围不能超过 design preview 时长",
      );
    }
    const fill = motionConfig.motion?.fill ?? "both";
    if (!["none", "forwards", "backwards", "both"].includes(fill)) {
      sdkFail("INVALID_PREVIEW_CONFIG", `motion.fill 不受支持: ${fill}`);
    }
  }
  const normalized = {
    ...config,
    composition: Object.freeze({
      width,
      height,
      durationSeconds: duration.durationSeconds,
      fps: DESIGN_PREVIEW_FPS,
      durationInFrames: duration.durationInFrames,
      static: duration.static,
    }),
    props: bindSchemaProps(metadata.schema, config.props, {
      fps: DESIGN_PREVIEW_FPS,
    }),
    ...(config.fonts === undefined
      ? {}
      : {
          fonts: Object.freeze(
            config.fonts.map((font) => Object.freeze({ ...font })),
          ),
        }),
    ...(metadata.kind !== "motion"
      ? {}
      : {
          motion: Object.freeze({
            startFrame: (config as any).motion?.startFrame ?? 0,
            durationInFrames:
              (config as any).motion?.durationInFrames ??
              duration.durationInFrames,
            fill: (config as any).motion?.fill ?? "both",
          }),
        }),
  } as PreviewConfig<Artifact>;
  return Object.freeze(normalized) as PreviewConfig<Artifact>;
}

export function definePreview<Artifact extends AnyArtifact>(
  config: PreviewDefinition<Artifact>,
): PreviewConfig<Artifact> {
  return validatePreviewConfig(config);
}

export function resolveDesignPreview<Artifact extends AnyArtifact>(
  artifact: Artifact,
): PreviewConfig<Artifact> {
  const metadata = artifact?.[SDK_ARTIFACT];
  if (metadata === undefined) {
    sdkFail(
      "ARTIFACT_EXPORT_INVALID",
      "design preview 入口必须由 defineReact 或 defineMotion 创建",
    );
  }
  const preview = metadata.designPreview();
  if (typeof preview !== "object" || preview === null) {
    sdkFail(
      "INVALID_DESIGN_PREVIEW",
      `${metadata.name}.designPreview() 必须返回预览配置对象`,
    );
  }
  return validatePreviewConfig({
    ...preview,
    artifact,
  } as PreviewDefinition<Artifact>);
}
