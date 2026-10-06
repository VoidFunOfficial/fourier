import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { cp, mkdir, mkdtemp, rename, rm, writeFile, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { openArtifact } from "../src/testing.ts";
import { sdkArtifactHost } from "../src/artifact-host.ts";
const dom = Bun.env.RUN_DOM_TESTS === "1" ? describe : describe.skip;
dom("Avatar WebGL 与 Fourier 宿主集成", () => {
  test("voidavatar 默认自然动作层可渲染且乱序确定", async () => {
    const root = join(import.meta.dir, "..");
    const fixture = await openArtifact(join(root, "example/VoidAvatar.tsx"), { sourceRoot: root, resourceRoots: [root] });
    try {
      const first = await fixture.renderFrame({ frame: 0 }); const wave = await fixture.renderFrame({ frame: 70 });
      // Native head XYZ and Fourier secondary motion share one deterministic timeline.
      expect(first.png.byteLength).toBeGreaterThan(100_000);
      expect(first.sha256).not.toBe(wave.sha256);
      await fixture.assertDeterministic({ frames: [650, 0, 70, 175, 359] });
    } finally { await fixture.close(); }
  }, 90000);
  test("source 模式仅使用原生头部 XYZ 并支持重复采样", async () => {
    const root = join(import.meta.dir, "..");
    const artifact = await sdkArtifactHost.compileVisualArtifact({
      entryPath: join(root, "tests/fixtures/AvatarSourcePanel.tsx"), sourceRoot: root, resourceRoots: [root],
      mode: "production", props: {},
      composition: { width: 960, height: 540, fps: 60, durationInFrames: 720 },
    });
    const runtime = sdkArtifactHost.createTimelineRuntime();
    try {
      const instance = await runtime.open(artifact);
      try {
        const first = await instance.sample({ time: { numerator: 0, denominator: 1 } });
        expect((await instance.sample({ time: { numerator: 11, denominator: 2 } })).sha256).not.toBe(first.sha256);
        expect((await instance.sample({ time: { numerator: 0, denominator: 1 } })).sha256).toBe(first.sha256);
      } finally { await instance.close(); }
    } finally { await runtime.close(); }
  }, 90000);
  test("mesh 和透明 mask 由同一 WebGL 路径确定性渲染", async () => {
    const fixture = await openArtifact(join(import.meta.dir, "fixtures/AvatarMeshPanel.tsx"));
    try {
      expect((await fixture.renderFrame({ frame: 0 })).sha256).not.toBe((await fixture.renderFrame({ frame: 110 })).sha256);
      await fixture.assertDeterministic({ frames: [100, 0, 60, 20] });
    } finally { await fixture.close(); }
  }, 45000);
  test("最新 MOC3 的 Fourier 动作层产生不同帧，并支持乱序 seek", async () => {
    const root = join(import.meta.dir, "..");
    const fixture = await openArtifact(join(root, "example/VoidAvatarActions.tsx"), { sourceRoot: root, resourceRoots: [root] });
    try {
      const frames = [0, 89, 314, 553, 824, 959];
      const hashes = [];
      for (const frame of frames) hashes.push((await fixture.renderFrame({ frame })).sha256);
      expect(new Set(hashes).size).toBe(frames.length);
      await fixture.assertDeterministic({ frames: [824, 89, 959, 0, 553, 314] });
    } finally { await fixture.close(); }
  }, 90000);
  test("model3 可直接引用不同名的子目录 MOC，隐式纹理进入不可变资源快照", async () => {
    const root = await mkdtemp(join(tmpdir(), "fourier-cubism-dom-"));
    try {
      await cp(join(import.meta.dir, "../example/voidavatar/cubism"), join(root, "model"), { recursive: true });
      await mkdir(join(root, "model/binaries"));
      await rename(join(root, "model/voidavatar.moc3"), join(root, "model/binaries/character.moc3"));
      await rm(join(root, "model/voidavatar.model3.json"));
      await writeFile(join(root, "model/main.model3.json"), JSON.stringify({
        Version: 3, FileReferences: { Moc: "binaries/character.moc3", Textures: ["textures/texture_00.png"] },
      }));
      const entryPath = join(root, "Avatar.tsx");
      await writeFile(entryPath, `import { Avatar, defineReact } from "@fourier-video/sdk/avatar";
import model from "./model/main.model3.json";
export default defineReact({name:"DirectModel3",schema:{},component(){return <Avatar model={model}/>},designPreview(){return {props:{},composition:{width:320,height:320,durationSeconds:1}}}});`);
      const before = await sdkArtifactHost.compileVisualArtifact({ entryPath });
      expect(before.bundleSnapshot.imageAssets).toHaveLength(1);
      const fixture = await openArtifact(entryPath);
      try {
        expect((await fixture.renderFrame({ frame: 0 })).png.byteLength).toBeGreaterThan(20_000);
        await fixture.assertDeterministic({ frames: [59, 0, 23] });
      } finally { await fixture.close(); }
      // A trailing byte keeps PNG pixels unchanged but must still invalidate its resource hash.
      await appendFile(join(root, "model/textures/texture_00.png"), new Uint8Array([0]));
      const after = await sdkArtifactHost.compileVisualArtifact({ entryPath });
      expect(after.dependencyDigest).not.toBe(before.dependencyDigest);
      expect(after.snapshotId).not.toBe(before.snapshotId);
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 45000);
});
