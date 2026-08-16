import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  Canvas,
  defineProject,
  Group,
  Image,
  Motion,
  Project,
  ReactLayer,
  Subtitle,
  Template,
  Timeline,
  Transform,
} from "@fourier-video/sdk/project";
import {
  compileProjectDeclaration,
  loadProject,
} from "../src/project-compiler.ts";
import { RenderEngineError } from "../src/errors.ts";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) =>
    rm(path, { recursive: true, force: true })
  ));
});

describe("Project JSX compiler", () => {
  test("直接求解 JSX 顺序、裸 ID 引用、typed props 与 Transform", () => {
    const definition = defineProject(
      <Project id="tsx-project" version="1.0" audioSampleRate={48_000}>
        <Canvas width={64} height={64} fps={10} background="#000" colorSpace="sRGB" />
        <Timeline>
          <Group id="sequence" mode="sequence" at="1s">
            <Image id="first" duration="3f" src="first.png" fit="stretch"
              x={10} y={10} width={8} height={8} layer={1} />
            <Image id="second" duration="2f" offset="-1f" src="second.png" fit="contain"
              x={20} y={20} width={8} height={8} layer={2} />
          </Group>
          <ReactLayer id="panel" after="sequence" duration="3f"
            component="components/Panel.tsx" x={32} y={32} width={16} height={16}
            layer={3} props={{ count: 2, enabled: true, title: "TSX" }}>
            <Motion id="reveal" at="0f" duration="2f" fill="forwards"
              component="Reveal.ts" props={{ distance: 10, direction: "left" }} />
            <Transform id="move" at="0f" duration="3f" fill="both" easing="linear"
              keyframes={[
                { offset: 0, translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 0 },
                { offset: 1, translateX: 10, translateY: 5, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
              ]} />
          </ReactLayer>
        </Timeline>
      </Project>,
    );
    const project = compileProjectDeclaration(definition, {
      projectDir: "/tmp/fourier-project-jsx",
      validateAssets: false,
    });

    expect(project.totalFrames).toBe(17);
    expect(project.timeNodes.get("first")).toMatchObject({ startFrame: 10, endFrame: 13 });
    expect(project.timeNodes.get("second")).toMatchObject({ startFrame: 12, endFrame: 14 });
    expect(project.timeNodes.get("panel")).toMatchObject({ startFrame: 14, endFrame: 17 });
    expect(project.nodes[2]).toMatchObject({
      kind: "react",
      props: { count: 2, enabled: true, title: "TSX" },
      propTypes: { count: "number", enabled: "boolean", title: null },
      modifiers: [
        { kind: "motion", localStartFrame: 0, localEndFrame: 2, props: { distance: 10, direction: "left" } },
        { kind: "transform", localStartFrame: 0, localEndFrame: 3 },
      ],
    });
  });

  test("Text content 与 TTS 对象直接进入既有字幕音频 IR", () => {
    const definition = defineProject(
      <Project id="tts" version="1.0" audioSampleRate={48_000}>
        <Canvas width={64} height={64} fps={10} background="#000" colorSpace="sRGB" />
        <Timeline>
          <Subtitle id="voice" at="0f" role="subtitle" content="Hello TSX"
            tts={{ volume: 0.75 }} font="Arial" fontSize={12}
            lineHeight={1.2} color="#FFF" align="center"
            x={32} y={48} width={60} height={12} layer={2} />
        </Timeline>
      </Project>,
    );
    const project = compileProjectDeclaration(definition, {
      projectDir: "/tmp/fourier-project-tsx-tts",
      validateAssets: false,
      ttsArtifacts: new Map([["voice", {
        sourcePath: "/tmp/voice.wav",
        samples: 4_800,
        sampleRate: 48_000,
        durationSeconds: 0.1,
      }]]),
    });
    expect(project.totalFrames).toBe(1);
    expect(project.nodes[0]).toMatchObject({
      kind: "subtitle",
      content: "Hello TSX",
      durationFrames: 1,
      voice: { sourcePath: "/tmp/voice.wav", volume: 0.75 },
    });
  });

  test("Scene 与类型化 Template 都只发现 main.tsx", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fourier-project-jsx-"));
    temporaryDirectories.push(directory);
    await mkdir(join(directory, "scenes", "leaf"), { recursive: true });
    await mkdir(join(directory, "templates", "card"), { recursive: true });
    await Bun.write(join(directory, "scenes", "leaf", "main.tsx"), `
      import { Canvas, defineProject, Image, Project, Timeline } from "@fourier-video/sdk/project";
      export default defineProject(<Project id="leaf" version="1.0" audioSampleRate={48000}>
        <Canvas width={64} height={64} fps={10} background="#000000" colorSpace="sRGB" />
        <Timeline><Image id="leaf-image" at="0f" duration="2f" src="missing.png"
          fit="stretch" x={32} y={32} width={64} height={64} layer={1} /></Timeline>
      </Project>);
    `);
    await Bun.write(join(directory, "templates", "card", "main.tsx"), `
      import { Canvas, defineTemplate, field, Project, Text, Timeline } from "@fourier-video/sdk";
      export default defineTemplate({
        schema: { title: field.string(), duration: field.time({ default: "3f" }) },
        render: ({ title, duration }) => <Project id="card" version="1.0" audioSampleRate={48000}>
          <Canvas width={64} height={64} fps={10} background="#000000" colorSpace="sRGB" />
          <Timeline><Text id="label" at="0f" duration={duration} role="body" content={title}
            font="Arial" fontSize={12} lineHeight={1.2} color="#FFF" align="center"
            x={32} y={32} width={64} height={20} layer={1} /></Timeline>
        </Project>,
      });
    `);
    const entry = join(directory, "main.tsx");
    await Bun.write(entry, `
      import { Canvas, defineProject, Project, Scene, Template, Timeline } from "@fourier-video/sdk/project";
      export default defineProject(<Project id="root" version="1.0" audioSampleRate={48000}>
        <Canvas width={64} height={64} fps={10} background="#000000" colorSpace="sRGB" />
        <Timeline>
          <Scene id="leaf" at="0f" src="scenes/leaf" />
          <Template id="card" after="leaf" src="templates/card" props={{ title: "Hello" }} />
        </Timeline>
      </Project>);
    `);

    const project = await loadProject(entry, { validateAssets: false });
    expect(project.totalFrames).toBe(5);
    expect(project.sceneNodes[0]?.id).toBe("leaf");
    expect(project.sceneNodes[0]?.sourcePath.endsWith("/scenes/leaf/main.tsx")).toBe(true);
    expect(project.templateNodes[0]).toMatchObject({
      id: "card",
      bindings: { title: "Hello", duration: "3f" },
      parameterSources: { title: "explicit", duration: "default" },
      parameterContract: [{ name: "title", kind: "string" }, { name: "duration", kind: "time", defaultValue: "3f" }],
    });
  });

  test("明确拒绝 XML 入口", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fourier-project-xml-reject-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "legacy.xml");
    await Bun.write(path, "<project />");
    try {
      await loadProject(path, { validateAssets: false });
      throw new Error("expected loadProject to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(RenderEngineError);
      expect((error as RenderEngineError).code).toBe("UNSUPPORTED_PROJECT_ENTRY");
    }
  });

  test("bundle 本地静态依赖并拒绝外部或动态依赖", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fourier-project-imports-"));
    temporaryDirectories.push(directory);
    await Bun.write(join(directory, "declaration.tsx"), `
      import { Canvas, defineProject, Image, Project, Timeline } from "@fourier-video/sdk/project";
      export const project = defineProject(<Project id="local-import" version="1.0" audioSampleRate={48000}>
        <Canvas width={32} height={32} fps={10} background="#000" colorSpace="sRGB" />
        <Timeline><Image id="image" at="0f" duration="1f" src="missing.png" fit="cover"
          x={16} y={16} width={32} height={32} layer={1} /></Timeline>
      </Project>);
    `);
    const entry = join(directory, "main.tsx");
    await Bun.write(entry, `import { project } from "./declaration.tsx"; export default project;`);
    expect((await loadProject(entry, { validateAssets: false })).metadata.id).toBe("local-import");

    await Bun.write(entry, `import "node:fs"; import { project } from "./declaration.tsx"; export default project;`);
    await expect(loadProject(entry, { validateAssets: false })).rejects.toMatchObject({
      code: "PROJECT_IMPORT_NOT_ALLOWED",
    });
  });

  test("递归 Template 与跨模块私有资源保持稳定错误码", async () => {
    const recursion = await mkdtemp(join(tmpdir(), "fourier-project-recursion-"));
    temporaryDirectories.push(recursion);
    await mkdir(join(recursion, "templates", "self"), { recursive: true });
    await Bun.write(join(recursion, "templates", "self", "main.tsx"), `
      import { Canvas, defineTemplate, Project, Template, Timeline } from "@fourier-video/sdk/project";
      export default defineTemplate({ schema: {}, render: () =>
        <Project id="self" version="1.0" audioSampleRate={48000}>
          <Canvas width={32} height={32} fps={10} background="#000" colorSpace="sRGB" />
          <Timeline><Template id="again" src="." /></Timeline>
        </Project>
      });
    `);
    await Bun.write(join(recursion, "main.tsx"), `
      import { Canvas, defineProject, Project, Template, Timeline } from "@fourier-video/sdk/project";
      export default defineProject(<Project id="root" version="1.0" audioSampleRate={48000}>
        <Canvas width={32} height={32} fps={10} background="#000" colorSpace="sRGB" />
        <Timeline><Template id="self" src="templates/self" /></Timeline>
      </Project>);
    `);
    await expect(loadProject(join(recursion, "main.tsx"), { validateAssets: false }))
      .rejects.toMatchObject({ code: "RECURSIVE_TEMPLATE" });

    const isolation = await mkdtemp(join(tmpdir(), "fourier-project-isolation-"));
    temporaryDirectories.push(isolation);
    await mkdir(join(isolation, "scenes", "a", "scenes"), { recursive: true });
    await mkdir(join(isolation, "scenes", "b"), { recursive: true });
    await Bun.write(join(isolation, "scenes", "b", "private.png"), "private");
    await Bun.write(join(isolation, "scenes", "a", "main.tsx"), `
      import { Canvas, defineProject, Image, Project, Timeline } from "@fourier-video/sdk/project";
      export default defineProject(<Project id="a" version="1.0" audioSampleRate={48000}>
        <Canvas width={32} height={32} fps={10} background="#000" colorSpace="sRGB" />
        <Timeline><Image id="leak" at="0f" duration="1f" src="scenes/b/private.png" fit="cover"
          x={16} y={16} width={32} height={32} layer={1} /></Timeline>
      </Project>);
    `);
    await Bun.write(join(isolation, "scenes", "b", "main.tsx"), `
      import { Canvas, defineProject, Image, Project, Timeline } from "@fourier-video/sdk/project";
      export default defineProject(<Project id="b" version="1.0" audioSampleRate={48000}>
        <Canvas width={32} height={32} fps={10} background="#000" colorSpace="sRGB" />
        <Timeline><Image id="own" at="0f" duration="1f" src="private.png" fit="cover"
          x={16} y={16} width={32} height={32} layer={1} /></Timeline>
      </Project>);
    `);
    await Bun.write(join(isolation, "main.tsx"), `
      import { Canvas, defineProject, Project, Scene, Timeline } from "@fourier-video/sdk/project";
      export default defineProject(<Project id="root" version="1.0" audioSampleRate={48000}>
        <Canvas width={32} height={32} fps={10} background="#000" colorSpace="sRGB" />
        <Timeline><Scene id="a" at="0f" src="scenes/a" /><Scene id="b" after="a" src="scenes/b" /></Timeline>
      </Project>);
    `);
    await expect(loadProject(join(isolation, "main.tsx")))
      .rejects.toMatchObject({ code: "SCENE_PRIVATE_RESOURCE" });
  });
});
