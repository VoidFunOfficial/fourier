import { describe, expect, test } from "bun:test";
import {
  bindSdkArtifactProps,
  readSdkArtifact,
  resolveMotionPreviewExports,
  SDK_ARTIFACT_SYMBOL,
} from "../src/artifact-protocol.ts";

function artifact(
  kind: "react" | "motion",
  overrides: Record<string, unknown> = {},
): Function {
  const value = () => null;
  Object.defineProperty(value, SDK_ARTIFACT_SYMBOL, {
    value: {
      package: "@fourier-video/sdk",
      sdkAbiVersion: 1.1,
      renderer: "dom-timeline",
      kind,
      name: "TestArtifact",
      schema: {},
      component: () => null,
      designPreview: () => ({
        props: {},
        composition: { width: 1, height: 1, durationSeconds: 0 },
        ...(kind === "motion" ? { subject: null } : {}),
      }),
      ...(kind === "motion" ? { supportsTextMotion: false } : {}),
      ...overrides,
    },
  });
  return value;
}

describe("SDK ABI Adapter", () => {
  test("结构化识别 marker 并拒绝 ABI/kind 错配", () => {
    expect(readSdkArtifact(artifact("react"), "react")).toMatchObject({
      kind: "react",
      name: "TestArtifact",
    });
    expect(() => readSdkArtifact(artifact("motion"), "react")).toThrow(
      "期望 react artifact",
    );
    expect(() => readSdkArtifact(artifact("react", {
      sdkAbiVersion: 99,
    }))).toThrow("不支持 SDK ABI 99");
    expect(() => readSdkArtifact(artifact("react", {
      designPreview: undefined,
    }))).toThrow("缺少强制 designPreview");
  });

  test("ABI v1.1 为当前 marker，同时继续读取 ABI v1 artifact", () => {
    expect(readSdkArtifact(artifact("react")))
      .toMatchObject({ sdkAbiVersion: 1.1 });
    expect(readSdkArtifact(artifact("react", { sdkAbiVersion: 1 })))
      .toMatchObject({ sdkAbiVersion: 1 });
  });

  test("ABI v1 只接受 dom-timeline component 且不携带 render", () => {
    expect(readSdkArtifact(artifact("react")))
      .toMatchObject({ sdkAbiVersion: 1.1, renderer: "dom-timeline" });
    expect(() => readSdkArtifact(artifact("react", {
      render: () => null,
    }))).toThrow("不能包含 render");
  });

  test("ABI v1 接受专用 FFmpeg Video Motion renderer 并拒绝能力串线", () => {
    const metadata = readSdkArtifact(artifact("motion", {
      renderer: "dom-timeline-ffmpeg-video",
      videoComposition: "ffmpeg",
      component: () => null,
      supportsTextMotion: undefined,
    }), "motion");
    expect(metadata).toMatchObject({
      sdkAbiVersion: 1.1,
      renderer: "dom-timeline-ffmpeg-video",
      videoComposition: "ffmpeg",
    });
    expect(() => readSdkArtifact(artifact("motion", {
      renderer: "dom-timeline-ffmpeg-video",
      videoComposition: "ffmpeg",
      component: () => null,
      supportsTextMotion: false,
    }), "motion")).toThrow("不能声明 Text Motion 或 overlay");
    expect(() => readSdkArtifact(artifact("react", {
      renderer: "dom-timeline-ffmpeg-video",
      videoComposition: "ffmpeg",
      component: () => null,
    }))).toThrow("必须是 videoComposition=ffmpeg 的 Motion");
  });

  test("Motion 强制声明 Text Motion 能力，并校验独立实现", () => {
    expect(() => readSdkArtifact(artifact("motion", {
      supportsTextMotion: undefined,
    }))).toThrow("必须显式声明 supportsTextMotion");
    expect(() => readSdkArtifact(artifact("motion", {
      supportsTextMotion: true,
    }))).toThrow("缺少独立实现");
    expect(readSdkArtifact(artifact("motion", {
      supportsTextMotion: true,
      textComponent: () => null,
    }))).toMatchObject({ supportsTextMotion: true });
  });

  test("schema 接收原生 Project props、补默认值并拒绝类型漂移", () => {
    const numberField = {
      package: "@fourier-video/sdk/schema-field",
      schemaVersion: 1,
      kind: "number",
      hasDefault: false,
      min: 0,
      max: 100,
    };
    const colorField = {
      package: "@fourier-video/sdk/schema-field",
      schemaVersion: 1,
      kind: "color",
      hasDefault: true,
      defaultValue: "#22c55e",
    };
    const component = artifact("react", {
      schema: { amount: numberField, accent: colorField },
    });
    expect(bindSdkArtifactProps(component, { amount: 42 }, {
      fps: 30,
      declarations: { amount: null },
    })).toEqual({ amount: 42, accent: "#22c55e" });
    expect(() => bindSdkArtifactProps(component, { amount: "42" }, {
      fps: 30,
      declarations: { amount: "string" },
    })).toThrow("与 schema number 不相容");
    expect(() => bindSdkArtifactProps(component, { amount: 42, extra: 1 }, {
      fps: 30,
    })).toThrow("schema 未声明字段");
    expect(() => bindSdkArtifactProps(() => null, { amount: "42" }, {
      fps: 30,
      declarations: { amount: null },
    })).toThrow("Legacy component 的 prop.type 必填");
  });

  test("SDK Motion preview 优先于 legacy 命名导出", () => {
    const sdkPreview = () => ({ representativeProgress: 0.25 });
    const sdkOverlay = () => null;
    const module = {
      default: artifact("motion", {
        preview: sdkPreview,
        overlay: sdkOverlay,
      }),
      preview: () => ({ representativeProgress: 1 }),
      Preview: () => "legacy",
    };
    const resolved = resolveMotionPreviewExports(module, "default");
    expect(resolved.preview?.({
      props: {},
      previewContext: {
        projectId: "p",
        motionId: "m",
        hostId: "h",
        fps: 30,
        seed: 1,
        anchorFrame: 0,
        rangeStartFrame: 0,
        rangeEndFrame: 1,
        canvas: { width: 1, height: 1 },
        host: {
          x: 0,
          y: 0,
          width: 1,
          height: 1,
          startFrame: 0,
          endFrame: 1,
        },
        motion: { startFrame: 0, endFrame: 1, durationFrames: 1 },
      },
    })).toEqual({ representativeProgress: 0.25 });
    expect(typeof resolved.Preview).toBe("function");
  });

  test("没有 marker 时完整保留 legacy exports", () => {
    const preview = () => ({ representativeProgress: 1 });
    const Preview = () => null;
    expect(resolveMotionPreviewExports({ preview, Preview }, "default"))
      .toEqual({ preview, Preview });
  });
});
