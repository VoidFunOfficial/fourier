import { describe, expect, test } from "bun:test";
import { appendFile, cp, mkdir, mkdtemp, realpath, rename, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { SDK_ABI_VERSION } from "@fourier-video/sdk";
import { checkArtifact } from "../src/artifact-check.ts";
import { compileVisualArtifact } from "../src/artifact-compiler.ts";

describe("fourier check", () => {
  test("最新 voidavatar 的 MOC3 导入可通过 render-engine 编译入口", async () => {
    const root = join(import.meta.dir, "../../fourier-sdk");
    const artifact = await compileVisualArtifact({ entryPath: join(root, "example/VoidAvatar.tsx"), sourceRoot: root, resourceRoots: [root] });
    for (const resource of [
      "cubism/voidavatar.moc3",
      "cubism/voidavatar.model3.json",
      "cubism/textures/texture_00.png",
      "cubism-native/PastelCatgirl-native-lively.moc3",
      "cubism-native/PastelCatgirl-native-lively.model3.json",
      "cubism-native/PastelCatgirl-native-lively.4096/texture_00.png",
      "cubism-native/PastelCatgirl-native-lively.4096/texture_01.png",
    ]) {
      expect(artifact.dependencies).toContain(await realpath(join(root, "example/voidavatar", resource)));
    }
    const filenames = artifact.bundleSnapshot.imageAssets?.map(asset =>
      decodeURIComponent(new URL(asset.url).pathname.split("/").at(-1)!));
    expect(filenames?.toSorted()).toEqual([
      // The hybrid and native models each contribute their own texture_00.png.
      "texture_00.png", "texture_00.png", "texture_01.png", "cute-eyes-v2.png", "cute-brows-v2.png",
      "magicWand.png", "conductorBaton.png", "microphone.png", "bouquet.png",
      "heartSign.png", "lollipop.png", "coffeeCup.png", "book.png", "paintbrush.png", "foldingFan.png",
    ].toSorted());
  });
  test("model3 可引用不同名且在子目录中的 MOC，纹理改变会更新快照", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fourier-manifest-reference-"));
    try {
      const modelRoot = join(directory, "model");
      await cp(join(import.meta.dir, "../../fourier-sdk/example/voidavatar/cubism"), modelRoot, { recursive: true });
      await mkdir(join(modelRoot, "binaries"));
      const mocPath = join(modelRoot, "binaries/character.moc3");
      await rename(join(modelRoot, "voidavatar.moc3"), mocPath);
      const settingsPath = join(modelRoot, "main.model3.json");
      await rename(join(modelRoot, "voidavatar.model3.json"), settingsPath);
      await Bun.write(settingsPath, JSON.stringify({
        Version: 3, FileReferences: { Moc: "binaries/character.moc3", Textures: ["textures/texture_00.png"] },
      }));
      const entryPath = join(directory, "Avatar.tsx");
      await Bun.write(entryPath, `import { Avatar, defineReact } from "@fourier-video/sdk/avatar";
import model from "./model/main.model3.json";
export default defineReact({ name: "ManifestReference", schema: {}, component() { return <Avatar model={model}/>; },
  designPreview() { return { props: {}, composition: { width: 64, height: 64, durationSeconds: 1 } }; } });`);
      const before = await compileVisualArtifact({ entryPath });
      const texturePath = join(modelRoot, "textures/texture_00.png");
      for (const path of [settingsPath, mocPath, texturePath]) {
        expect(before.dependencies).toContain(await realpath(path));
      }
      expect(before.bundleSnapshot.imageAssets).toHaveLength(1);
      await appendFile(texturePath, new Uint8Array([0]));
      const after = await compileVisualArtifact({ entryPath });
      expect(after.dependencyDigest).not.toBe(before.dependencyDigest);
      expect(after.snapshotId).not.toBe(before.snapshotId);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
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
      expect(artifact.dependencies).toContain(await realpath(helperPath));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("immutable snapshot 支持根内 symlink 并拒绝逃逸 symlink", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fourier-artifact-symlink-"));
    const outside = await mkdtemp(join(tmpdir(), "fourier-artifact-outside-"));
    try {
      const entryPath = join(directory, "Panel.tsx");
      await Bun.write(join(directory, "helper.ts"), `export const label = "inside";`);
      await symlink("helper.ts", join(directory, "helper-link.ts"));
      await Bun.write(entryPath, `import { defineReact } from "@fourier-video/sdk";
import { label } from "./helper-link";
export default defineReact({
  name: "SymlinkPanel",
  schema: {},
  component() { return <div>{label}</div>; },
  designPreview() { return { props: {}, composition: { width: 16, height: 16, durationSeconds: 0 } }; },
});`);
      await expect(compileVisualArtifact({ entryPath, sourceRoot: directory }))
        .resolves.toMatchObject({ name: "SymlinkPanel" });

      await Bun.write(join(outside, "escape.ts"), `export const secret = "outside";`);
      await symlink(join(outside, "escape.ts"), join(directory, "escape.ts"));
      await Bun.write(entryPath, `import { defineReact } from "@fourier-video/sdk";
import { secret } from "./escape";
export default defineReact({
  name: "EscapePanel",
  schema: {},
  component() { return <div>{secret}</div>; },
  designPreview() { return { props: {}, composition: { width: 16, height: 16, durationSeconds: 0 } }; },
});`);
      await expect(compileVisualArtifact({ entryPath, sourceRoot: directory }))
        .rejects.toMatchObject({ code: "ARTIFACT_SOURCE_OUTSIDE_ROOT" });
    } finally {
      await Promise.all([
        rm(directory, { recursive: true, force: true }),
        rm(outside, { recursive: true, force: true }),
      ]);
    }
  }, 15_000);

  test("当前 ABI check 使用 DOM runtime 且不返回迁移警告", async () => {
    const result = await checkArtifact(join(import.meta.dir, "components/DomStaticPanel.tsx"));
    expect(result).toMatchObject({
      valid: true,
      sdkAbiVersion: SDK_ABI_VERSION,
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
        sdkAbiVersion: SDK_ABI_VERSION,
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

  test("作者可以从 SDK universe-3d 入口导入 3D World interface", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fourier-universe-3d-import-"));
    try {
      const entryPath = join(directory, "Universe3DPanel.tsx");
      await Bun.write(entryPath, `import { defineReact } from "@fourier-video/sdk";
import { Universe3D, World3D, defineCamera3D } from "@fourier-video/sdk/universe-3d";
const camera = defineCamera3D({ initial: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 } });
export default defineReact({
  name: "Universe3DPanel",
  schema: {},
  component() {
    return <Universe3D camera={camera}><World3D id="card" x={0} y={0} z={-100} width={50} height={20}>3D</World3D></Universe3D>;
  },
  designPreview() {
    return { props: {}, composition: { width: 64, height: 32, durationSeconds: 1 } };
  },
});`);
      const artifact = await compileVisualArtifact({ entryPath });
      expect(artifact).toMatchObject({ name: "Universe3DPanel", renderer: "dom-timeline" });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 15_000);

  test("Avatar 通过正式 SDK 子入口编译为 Fourier artifact", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fourier-avatar-import-"));
    try {
      const entryPath = join(directory, "AvatarPanel.tsx");
      await Bun.write(entryPath, `import { Avatar, defineAvatar, defineReact } from "@fourier-video/sdk/avatar";
const model = defineAvatar({ version: 1, name: "avatar", canvas: [64, 64], layers: [] });
export default defineReact({
  name: "AvatarPanel", schema: {},
  component() { return <Avatar model={model} />; },
  designPreview() { return { props: {}, composition: { width: 64, height: 64, durationSeconds: 1 } }; },
});`);
      expect(await compileVisualArtifact({ entryPath })).toMatchObject({ name: "AvatarPanel", renderer: "dom-timeline" });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 15_000);

  test("snapshotId 覆盖 composition、seed、Motion 配置和字体内容", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fourier-snapshot-identity-"));
    try {
      const font = join(directory, "font.ttf");
      await Bun.write(font, new Uint8Array([0, 1, 0, 0, 97]));
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
        resourceRoots: [directory, dirname(entryPath)],
      } as const;
      const first = await compileVisualArtifact(options);
      const same = await compileVisualArtifact(options);
      const resized = await compileVisualArtifact({
        ...options,
        composition: { ...options.composition, width: 33 },
      });
      const reseeded = await compileVisualArtifact({ ...options, seed: 8 });
      await Bun.write(font, new Uint8Array([0, 1, 0, 0, 98]));
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
  }, 15_000);
});
