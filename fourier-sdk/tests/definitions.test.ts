import { describe, expect, test } from "bun:test";
import React from "react";
import {
  defineMotion,
  definePreview,
  defineReact,
  DESIGN_PREVIEW_FPS,
  field,
  MAX_DESIGN_PREVIEW_SECONDS,
  SDK_ABI_VERSION,
  SDK_ARTIFACT,
  SdkError,
} from "../src/index.ts";

describe("SDK artifact definition", () => {
  test("defineReact 强制携带 schema/designPreview 并保持可调用 ABI", () => {
    const panel = defineReact({
      name: "MetricPanel",
      schema: { value: field.number({ min: 0 }) },
      component({ props }) {
        return React.createElement("span", null, props.value);
      },
      designPreview() {
        return {
          props: { value: 42 },
          composition: { width: 320, height: 180, durationSeconds: 1 },
        };
      },
    });

    expect(typeof panel).toBe("function");
    expect(Object.isFrozen(panel)).toBe(true);
    expect(panel[SDK_ARTIFACT]).toMatchObject({
      package: "@fourier-video/sdk",
      sdkAbiVersion: SDK_ABI_VERSION,
      renderer: "dom-timeline",
      kind: "react",
      name: "MetricPanel",
      schema: { value: { kind: "number" } },
    });
    expect(panel[SDK_ARTIFACT].designPreview().props).toEqual({ value: 42 });
    const element = panel({ value: 42 });
    expect(React.isValidElement(element)).toBe(true);
    expect((element as React.ReactElement).props).toMatchObject({ props: { value: 42 } });
  });

  test("component 形状生成不含 render 的 ABI v1 DOM marker", () => {
    const panel = defineReact({
      name: "DomPanel",
      schema: { value: field.number() },
      static: true,
      component({ props }) {
        return React.createElement("span", null, props.value);
      },
      designPreview() {
        return {
          props: { value: 1 },
          composition: { width: 32, height: 24, durationSeconds: 1 },
        };
      },
    });
    expect(panel[SDK_ARTIFACT]).toMatchObject({
      sdkAbiVersion: SDK_ABI_VERSION,
      renderer: "dom-timeline",
      kind: "react",
      name: "DomPanel",
      static: true,
    });
    expect("component" in panel[SDK_ARTIFACT]).toBe(true);
    expect("render" in panel[SDK_ARTIFACT]).toBe(false);
  });

  test("旧 render 入口存在时稳定拒绝", () => {
    expect(() => defineReact({
      name: "Ambiguous",
      schema: {},
      render: () => null,
      component: () => null,
      designPreview: () => ({
        props: {},
        composition: { width: 1, height: 1, durationSeconds: 0 },
      }),
    } as never)).toThrow(SdkError);
    try {
      defineReact({
        name: "Ambiguous",
        schema: {},
        render: () => null,
        component: () => null,
        designPreview: () => ({
          props: {},
          composition: { width: 1, height: 1, durationSeconds: 0 },
        }),
      } as never);
    } catch (error) {
      expect((error as SdkError).code).toBe("INVALID_ARTIFACT_DEFINITION");
    }
  });

  test("defineMotion 集中 schema、component、designPreview、preview 和 overlay", () => {
    const jump = defineMotion({
      name: "Jump",
      schema: { amplitude: field.number({ min: 0, default: 24 }) },
      supportsTextMotion: false,
      component({ subject, props }) {
        return React.createElement("div", { "data-y": props.amplitude }, subject);
      },
      designPreview() {
        return {
          props: {},
          subject: "subject",
          composition: { width: 320, height: 180, durationSeconds: 1 },
        };
      },
      preview({ props }) {
        return {
          representativeProgress: 0.5,
          annotations: [{ kind: "label", text: `${props.amplitude}px` }],
        };
      },
      overlay({ subject }) {
        return React.createElement("div", null, subject);
      },
    });

    expect(jump[SDK_ARTIFACT]).toMatchObject({
      kind: "motion",
      supportsTextMotion: false,
    });
    expect(jump[SDK_ARTIFACT].preview?.({
      props: { amplitude: 24 },
      context: {
        projectId: "test",
        motionId: "jump",
        hostId: "host",
        fps: 30,
        seed: 1,
        anchorFrame: 2,
        rangeStartFrame: 0,
        rangeEndFrame: 10,
        canvas: { width: 320, height: 180 },
        host: { x: 160, y: 90, width: 320, height: 180, startFrame: 0, endFrame: 10 },
        motion: { startFrame: 0, endFrame: 10, durationFrames: 10 },
      },
    })).toMatchObject({ representativeProgress: 0.5 });
    expect(React.isValidElement(jump({
      subject: "text",
      props: { amplitude: 24 },
    }))).toBe(true);
  });

  test("FFmpeg Video Motion 使用独立 renderer、opaque handle 和无 subject preview", () => {
    const panel = defineMotion({
      name: "VideoPanel",
      schema: { radius: field.number({ default: 0.055 }) },
      videoComposition: "ffmpeg",
      component({ video, props }) {
        return React.createElement("div", {
          "data-video-id": video.id,
          "data-radius": props.radius,
        });
      },
      designPreview() {
        return {
          props: {},
          composition: { width: 320, height: 180, durationSeconds: 3 },
        };
      },
    });

    expect(panel[SDK_ARTIFACT]).toMatchObject({
      sdkAbiVersion: SDK_ABI_VERSION,
      kind: "motion",
      renderer: "dom-timeline-ffmpeg-video",
      videoComposition: "ffmpeg",
    });
    expect(panel[SDK_ARTIFACT].designPreview()).not.toHaveProperty("subject");
    const preview = definePreview({
      artifact: panel,
      props: {},
      composition: { width: 320, height: 180, durationSeconds: 3 },
    });
    expect(preview.motion).toEqual({
      startFrame: 0,
      durationInFrames: 180,
      fill: "both",
    });
    const element = panel({
      video: { id: "subject" },
      props: { radius: 0.055 },
    });
    expect((element as React.ReactElement).props).toMatchObject({
      video: { id: "subject" },
      props: { radius: 0.055 },
    });
  });

  test("FFmpeg Video Motion 在定义阶段拒绝 overlay", () => {
    expect(() => defineMotion({
      name: "InvalidVideoOverlay",
      schema: {},
      videoComposition: "ffmpeg",
      component() { return null; },
      designPreview() {
        return {
          props: {},
          composition: { width: 1, height: 1, durationSeconds: 1 },
        };
      },
      overlay() { return null; },
    } as never)).toThrow("FFmpeg Video Motion 不能提供 overlay");
  });

  test("Motion 强制声明 Text Motion 能力，支持时必须单独实现", () => {
    expect(() => defineMotion({
      name: "MissingTextCapability",
      schema: {},
      component: ({ subject }: { subject: React.ReactNode }) => subject,
      designPreview: () => ({
        props: {},
        subject: "subject",
        composition: { width: 1, height: 1, durationSeconds: 0 },
      }),
    } as never)).toThrow(SdkError);
    try {
      defineMotion({
        name: "MissingTextCapability",
        schema: {},
        component: ({ subject }: { subject: React.ReactNode }) => subject,
        designPreview: () => ({
          props: {},
          subject: "subject",
          composition: { width: 1, height: 1, durationSeconds: 0 },
        }),
      } as never);
    } catch (error) {
      expect((error as SdkError).code).toBe("TEXT_MOTION_CAPABILITY_REQUIRED");
    }

    expect(() => defineMotion({
      name: "MissingTextImplementation",
      schema: {},
      supportsTextMotion: true,
      component: ({ subject }: { subject: React.ReactNode }) => subject,
      designPreview: () => ({
        props: {},
        subject: "subject",
        composition: { width: 1, height: 1, durationSeconds: 0 },
      }),
    } as never)).toThrow("必须单独实现 definition.textComponent");

    const typewriter = defineMotion({
      name: "Typewriter",
      schema: { prefix: field.string({ default: "> " }) },
      supportsTextMotion: true,
      component({ subject }) {
        return React.createElement("div", null, subject);
      },
      textComponent({ text, props }) {
        return React.createElement("span", null, `${props.prefix}${text}`);
      },
      designPreview() {
        return {
          props: {},
          subject: "subject",
          composition: { width: 100, height: 20, durationSeconds: 1 },
        };
      },
    });
    expect(typewriter[SDK_ARTIFACT]).toMatchObject({
      supportsTextMotion: true,
    });
    const metadata = typewriter[SDK_ARTIFACT];
    if (!metadata.supportsTextMotion) throw new Error("expected Text Motion support");
    expect(typeof metadata.textComponent).toBe("function");
    const textElement = metadata.textComponent({
      text: "hello",
      props: { prefix: "> " },
    });
    expect((textElement as React.ReactElement).props).toMatchObject({
      children: "> hello",
    });
  });

  test("缺少 designPreview 立即使用稳定错误码拒绝", () => {
    expect(() => defineReact({
      name: "MissingPreview",
      schema: {},
      component: () => null,
    } as never)).toThrow(SdkError);
    try {
      defineReact({ name: "MissingPreview", schema: {}, component: () => null } as never);
    } catch (error) {
      expect((error as SdkError).code).toBe("DESIGN_PREVIEW_REQUIRED");
    }
  });

  test("异步 component 使用稳定错误码拒绝", () => {
    const invalid = defineReact({
      name: "AsyncPanel",
      schema: {},
      component: (() => Promise.resolve(null)) as never,
      designPreview() {
        return { props: {}, composition: { width: 1, height: 1, durationSeconds: 0 } };
      },
    });
    expect(() => invalid[SDK_ARTIFACT].component({ props: {} })).toThrow(SdkError);
  });

  test("schema 补默认值、拒绝未知字段并补齐 Motion timing", () => {
    const jump = defineMotion({
      name: "Jump",
      schema: {
        amount: field.number({ min: 0, default: 10 }),
        mode: field.enum(["soft", "hard"] as const, { default: "soft" }),
      },
      supportsTextMotion: false,
      component({ subject }) { return subject; },
      designPreview() {
        return {
          props: {},
          subject: "subject",
          composition: { width: 100, height: 80, durationSeconds: 1 },
        };
      },
    });
    const config = definePreview({
      artifact: jump,
      props: {},
      subject: "subject",
      composition: { width: 100, height: 80, durationSeconds: 1 },
    });
    expect(config.props).toEqual({ amount: 10, mode: "soft" });
    expect(config.composition).toEqual({
      width: 100,
      height: 80,
      durationSeconds: 1,
      fps: DESIGN_PREVIEW_FPS,
      durationInFrames: 60,
      static: false,
    });
    expect(config.motion).toEqual({ startFrame: 0, durationInFrames: 60, fill: "both" });
    expect(() => definePreview({
      artifact: jump,
      props: { unknown: 1 } as never,
      subject: "subject",
      composition: { width: 100, height: 80, durationSeconds: 1 },
    })).toThrow("schema 未声明字段");
  });

  test("design preview 固定 60fps，并区分静态 0s 与 1–30s 动态时长", () => {
    const panel = defineReact({
      name: "DurationPanel",
      schema: {},
      component: () => null,
      designPreview() {
        return { props: {}, composition: { width: 16, height: 9, durationSeconds: 0 } };
      },
    });

    const staticConfig = definePreview({
      artifact: panel,
      props: {},
      composition: { width: 16, height: 9, durationSeconds: 0 },
    });
    expect(staticConfig.composition).toEqual({
      width: 16,
      height: 9,
      durationSeconds: 0,
      fps: DESIGN_PREVIEW_FPS,
      durationInFrames: 1,
      static: true,
    });

    const longest = definePreview({
      artifact: panel,
      props: {},
      composition: {
        width: 16,
        height: 9,
        durationSeconds: MAX_DESIGN_PREVIEW_SECONDS,
      },
    });
    expect(longest.composition).toMatchObject({
      fps: 60,
      durationInFrames: 1_800,
      static: false,
    });

    for (const durationSeconds of [-1, 0.5, 31]) {
      expect(() => definePreview({
        artifact: panel,
        props: {},
        composition: { width: 16, height: 9, durationSeconds },
      })).toThrow(SdkError);
      try {
        definePreview({
          artifact: panel,
          props: {},
          composition: { width: 16, height: 9, durationSeconds },
        });
      } catch (error) {
        expect((error as SdkError).code).toBe("INVALID_PREVIEW_DURATION");
      }
    }
  });
});
