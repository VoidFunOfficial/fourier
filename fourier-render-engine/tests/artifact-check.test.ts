import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkArtifact } from "../src/artifact-check.ts";
import { compileVisualArtifact } from "../src/artifact-compiler.ts";

describe("fourier check", () => {
  test("ABI v1 显式 .js import 可以解析同名 TypeScript 源文件", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fourier-dom-ts-substitution-"));
    try {
      const entryPath = join(directory, "Panel.tsx");
      const helperPath = join(directory, "helper.ts");
      await Promise.all([
        Bun.write(helperPath, `export const label = "TypeScript source";`),
        Bun.write(entryPath, `import { defineReact } from "@fourier-video/sdk/react";
import { label } from "./helper.js";
export default defineReact({
  name: "TsSubstitutionPanel",
  schema: {},
  component() { return <div>{label}</div>; },
  designPreview() {
    return { props: {}, composition: { width: 64, height: 32, durationSeconds: 0 } };
  },
});`),
      ]);
      const artifact = await compileVisualArtifact({ entryPath });
      expect(artifact.dependencies).toContain(helperPath);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("ABI v1 check 使用 DOM runtime 且不返回迁移警告", async () => {
    const result = await checkArtifact(join(import.meta.dir, "components/DomStaticPanel.tsx"));
    expect(result).toMatchObject({
      valid: true,
      sdkAbiVersion: 1,
      renderer: "dom-timeline",
      warnings: [],
    });
    expect(result.browser).toBeDefined();
  });

  test("ABI v1 递归检查本地依赖中的 timer", async () => {
    await expect(compileVisualArtifact({
      entryPath: join(import.meta.dir, "components/DomImportedTimer.tsx"),
    })).rejects.toMatchObject({
      code: "UNSUPPORTED_DOM_TIMELINE_API",
      details: { api: "浏览器计时器" },
    });
  });

  test("无 node_modules 的视频目录只从 SDK 导入 React 能力也可编译", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fourier-sdk-owned-react-"));
    try {
      const entryPath = join(directory, "Panel.tsx");
      await Bun.write(entryPath, `import {
  defineReact,
  useState,
} from "@fourier-video/sdk/react";
export default defineReact({
  name: "SdkOwnedReactPanel",
  schema: {},
  component() {
    const [label] = useState("SDK React");
    return <div>{label}</div>;
  },
  designPreview() {
    return { props: {}, composition: { width: 64, height: 32, durationSeconds: 0 } };
  },
});`);
      const artifact = await compileVisualArtifact({ entryPath });
      expect(artifact).toMatchObject({
        sdkAbiVersion: 1,
        renderer: "dom-timeline",
        name: "SdkOwnedReactPanel",
      });
      expect(artifact.bundleSnapshot?.javascript.length).toBeGreaterThan(0);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("作者直接导入 React 时返回稳定的 SDK import policy 错误", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fourier-direct-react-"));
    try {
      const entryPath = join(directory, "DirectReact.tsx");
      await Bun.write(entryPath, `import React from "react";
import { defineReact } from "@fourier-video/sdk/react";
export default defineReact({
  name: "DirectReact",
  schema: {},
  component() { return <div />; },
  designPreview() {
    return { props: {}, composition: { width: 16, height: 16, durationSeconds: 0 } };
  },
});`);
      await expect(compileVisualArtifact({ entryPath })).rejects.toMatchObject({
        code: "INVALID_COMPONENT_IMPORT",
        details: { specifier: "react" },
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("作者必须从 SDK three 入口导入 Three.js", async () => {
    const sdkThreeEntry = Bun.resolveSync("@fourier-video/sdk/three", import.meta.dir);
    const directory = await mkdtemp(join(sdkThreeEntry, "../.fourier-direct-three-"));
    try {
      const entryPath = join(directory, "DirectThree.tsx");
      await Bun.write(entryPath, `import { Scene } from "three";
import { defineReact } from "@fourier-video/sdk/three";
export default defineReact({
  name: "DirectThree",
  schema: {},
  component() { new Scene(); return <canvas />; },
  designPreview() {
    return { props: {}, composition: { width: 16, height: 16, durationSeconds: 0 } };
  },
});`);
      await expect(compileVisualArtifact({ entryPath })).rejects.toMatchObject({
        code: "INVALID_COMPONENT_IMPORT",
        details: { specifier: "three" },
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("snapshotId 覆盖 composition、seed、Motion 配置和字体内容", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fourier-snapshot-identity-"));
    try {
      const font = join(directory, "font.ttf");
      await Bun.write(font, "font-a");
      const entryPath = join(import.meta.dir, "components/DomStaticPanel.tsx");
      const options = {
        entryPath,
        composition: {
          width: 32,
          height: 24,
          fps: 30,
          fpsSource: "30",
          durationInFrames: 10,
        },
        seed: 7,
        fonts: [{ family: "Test", source: font }],
      } as const;
      const first = await compileVisualArtifact(options);
      const same = await compileVisualArtifact(options);
      const resized = await compileVisualArtifact({
        ...options,
        composition: { ...options.composition, width: 33 },
      });
      const reseeded = await compileVisualArtifact({ ...options, seed: 8 });
      await Bun.write(font, "font-b");
      const changedFont = await compileVisualArtifact(options);
      expect(same.snapshotId).toBe(first.snapshotId);
      expect(resized.snapshotId).not.toBe(first.snapshotId);
      expect(reseeded.snapshotId).not.toBe(first.snapshotId);
      expect(changedFont.snapshotId).not.toBe(first.snapshotId);

      const motionEntry = join(import.meta.dir, "components/DomMotion.tsx");
      const motion = await compileVisualArtifact({
        entryPath: motionEntry,
        motion: { startFrame: 1, durationInFrames: 4, fill: "both" },
      });
      const shiftedMotion = await compileVisualArtifact({
        entryPath: motionEntry,
        motion: { startFrame: 2, durationInFrames: 4, fill: "both" },
      });
      expect(shiftedMotion.snapshotId).not.toBe(motion.snapshotId);

      const componentDependency = join(directory, "component-color.ts");
      const componentEntry = join(directory, "Component.tsx");
      await Bun.write(componentDependency, `export const color = "red";`);
      await Bun.write(componentEntry, `import { defineReact } from "@fourier-video/sdk";
import { color } from "./component-color";
export default defineReact({
  name: "ComponentDigest",
  schema: {},
  component() { return <div style={{ color }} />; },
  designPreview() {
    return { props: {}, composition: { width: 16, height: 16, durationSeconds: 0 } };
  },
});`);
      const componentFirst = await compileVisualArtifact({ entryPath: componentEntry });
      await Bun.write(componentDependency, `export const color = "blue";`);
      const componentChanged = await compileVisualArtifact({ entryPath: componentEntry });
      expect(componentChanged.dependencyDigest).not.toBe(componentFirst.dependencyDigest);
      expect(componentChanged.snapshotId).not.toBe(componentFirst.snapshotId);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
