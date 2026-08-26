import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import {
  Canvas,
  defineProject,
  Image,
  Project,
  serializeProjectDefinition,
  Shader,
  Timeline,
} from "@fourier-video/sdk/project";
import { compileProjectDeclaration } from "../src/project-compiler.ts";
import { renderProject } from "../src/renderer.ts";
import {
  prepareGeneratedVisuals,
  renderSparseVisualFrame,
} from "../src/visual-renderer.ts";

const describeDom = Bun.env.RUN_DOM_TESTS === "1" ? describe : describe.skip;
const describeFfmpeg = Bun.env.RUN_DOM_TESTS === "1" && Bun.env.RUN_FFMPEG_TESTS === "1"
  ? describe
  : describe.skip;
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) =>
    rm(path, { recursive: true, force: true })
  ));
});

const shaderModule = (name: string, body: string) => `
  import { defineFourierShader, defineShader } from "@fourier-video/sdk";
  const shader = defineFourierShader({
    name: ${JSON.stringify(name)},
    fragmentShader: \`in vec2 vUv; out vec4 fragColor; void main(){
      vec4 source = texture(uFourierSource, vUv);
      ${body}
    }\`,
  });
  export default defineShader({
    name: ${JSON.stringify(name)}, schema: {}, shader,
    designPreview: () => ({
      props: {},
      subject: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8'%3E%3Crect width='8' height='8' fill='%2300ff00'/%3E%3C/svg%3E",
      composition: { width: 8, height: 8, durationSeconds: 1 },
    }),
  });
`;

async function fixture(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "fourier-shader-modifier-"));
  temporaryDirectories.push(directory);
  await mkdir(join(directory, "shaders"), { recursive: true });
  await Promise.all([
    Bun.write(
      join(directory, "source.png"),
      new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#00ff00"/></svg>`).render().asPng(),
    ),
    Bun.write(join(directory, "shaders/SetRed.tsx"), shaderModule("SetRed", "fragColor = vec4(1.0, source.gba);")),
    Bun.write(join(directory, "shaders/SwapRB.tsx"), shaderModule("SwapRB", "fragColor = source.bgra;")),
    Bun.write(join(directory, "shaders/Black.tsx"), shaderModule("Black", "fragColor = vec4(0.0, 0.0, 0.0, 1.0);")),
    Bun.write(join(directory, "main.tsx"), `
      import { Canvas, defineProject, Image, Project, Shader, Timeline } from "@fourier-video/sdk/project";
      export default defineProject(<Project id="shader-ffmpeg" version="1.0" audioSampleRate={48000}>
        <Canvas width={8} height={8} fps={10} background="#000000" colorSpace="sRGB" />
        <Timeline><Image id="subject" at="0f" duration="3f" src="source.png" fit="stretch"
          x={4} y={4} width={8} height={8} layer={0}>
          <Shader id="swap" at="0f" duration="3f" fill="both" component="SwapRB.tsx" layer={20} />
          <Shader id="red" at="0f" duration="3f" fill="both" component="SetRed.tsx" layer={10} />
          <Shader id="black" at="1f" duration="1f" fill="none" component="Black.tsx" layer={30} />
        </Image></Timeline>
      </Project>);
    `),
  ]);
  return realpath(directory);
}

function project(directory: string, tieLayers = false) {
  const definition = defineProject(
    <Project id={tieLayers ? "tied" : "ordered"} version="1.0" audioSampleRate={48_000}>
      <Canvas width={8} height={8} fps={10} background="#000000" colorSpace="sRGB" />
      <Timeline>
        <Image id="subject" at="0f" duration="3f" src="source.png" fit="stretch"
          x={4} y={4} width={8} height={8} layer={0} preview>
          <Shader id="swap" at="0f" duration="3f" fill="both"
            component="SwapRB.tsx" layer={tieLayers ? 10 : 20} />
          <Shader id="red" at="0f" duration="3f" fill="both"
            component="SetRed.tsx" layer={10} />
          <Shader id="black" at="1f" duration="1f" fill="none"
            component="Black.tsx" layer={30} />
        </Image>
      </Timeline>
    </Project>,
  );
  return compileProjectDeclaration(serializeProjectDefinition(definition), {
    projectDir: directory,
  });
}

const digest = async (path: string) => createHash("sha256")
  .update(new Uint8Array(await Bun.file(path).arrayBuffer()))
  .digest("hex");

describeDom("Shader modifier rendering", () => {
  test("按 layer 升序串行，并让稀疏预览复用同一 pass 链", async () => {
    const directory = await fixture();
    const ordered = project(directory);
    const tied = project(directory, true);
    const orderedTemporary = join(directory, "ordered-tmp");
    const tiedTemporary = join(directory, "tied-tmp");
    await Promise.all([mkdir(orderedTemporary), mkdir(tiedTemporary)]);
    const orderedVisuals = await prepareGeneratedVisuals(ordered, {
      temporaryDirectory: orderedTemporary,
      frameConcurrency: 1,
      domPages: 1,
    });
    const tiedVisuals = await prepareGeneratedVisuals(tied, {
      temporaryDirectory: tiedTemporary,
      frameConcurrency: 1,
      domPages: 1,
    });
    const orderedVisual = orderedVisuals.get("subject")!;
    const tiedVisual = tiedVisuals.get("subject")!;
    const orderedFrame = orderedVisual.path.replace("%08d", "00000000");
    const tiedFrame = tiedVisual.path.replace("%08d", "00000000");
    expect(await digest(orderedFrame)).not.toBe(await digest(tiedFrame));
    expect(await digest(orderedFrame)).not.toBe(
      await digest(orderedVisual.path.replace("%08d", "00000001")),
    );
    expect(await digest(orderedFrame)).toBe(
      await digest(orderedVisual.path.replace("%08d", "00000002")),
    );

    const sparse = join(directory, "sparse.png");
    const node = ordered.nodes[0];
    if (node === undefined || node.kind === "audio") throw new Error("expected visual node");
    await renderSparseVisualFrame(ordered, node, 0, sparse, {
      bundleDirectory: join(directory, "sparse-bundles"),
      fonts: [],
      domPages: 1,
    });
    expect(await digest(sparse)).toBe(await digest(orderedFrame));
  }, 60_000);
});

describeFfmpeg("Shader modifier FFmpeg output", () => {
  test("完整 render 输出 MP4 与 Shader pass snapshots", async () => {
    const directory = await fixture();
    const output = join(directory, "shader.mp4");
    const result = await renderProject(join(directory, "main.tsx"), {
      output,
      overwrite: true,
      frameConcurrency: 1,
      domPages: 1,
    });
    expect((await Bun.file(output).stat()).size).toBeGreaterThan(0);
    const manifest = await Bun.file(result.manifestPath).json() as {
      sdk: { abiVersion: number };
      snapshots: Array<{ kind: string }>;
    };
    expect(manifest.sdk.abiVersion).toBe(1.2);
    expect(manifest.snapshots.map((snapshot) => snapshot.kind))
      .toEqual(["shader", "shader", "shader"]);
  }, 60_000);
});
