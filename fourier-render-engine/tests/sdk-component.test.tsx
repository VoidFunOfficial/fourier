import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { readSdkArtifact } from "../src/artifact-protocol.ts";
import { loadProject } from "../src/project-compiler.ts";
import {
  bundleReactModule,
  collectComponentDependencies,
  renderSparseVisualFrame,
} from "../src/visual-renderer.ts";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })),
  );
});

describe("SDK component production Adapter", () => {
  test("显式 .js import 可以解析同名 TypeScript 源文件", async () => {
    const directory = await mkdtemp(join(import.meta.dir, ".sdk-component-ts-substitution-"));
    directories.push(directory);
    const components = join(directory, "components");
    await mkdir(components, { recursive: true });
    const componentPath = join(components, "Panel.tsx");
    const helperPath = join(components, "helper.ts");
    await Promise.all([
      Bun.write(componentPath, `import { label } from "./helper.js";\nexport default () => <div>{label}</div>;`),
      Bun.write(helperPath, `export const label = "TypeScript source";`),
    ]);

    await expect(collectComponentDependencies(
      {
        id: "panel",
        kind: "react",
        component: "components/Panel.tsx",
        componentPath,
        exportName: "default",
      },
      [directory],
    )).resolves.toEqual([helperPath, componentPath].sort());
  });

  test("组件依赖收集把 CSS 作为叶子依赖", async () => {
    const directory = await mkdtemp(join(import.meta.dir, ".sdk-component-css-"));
    directories.push(directory);
    const components = join(directory, "components");
    await mkdir(components, { recursive: true });
    const componentPath = join(components, "Panel.tsx");
    const cssPath = join(components, "panel.css");
    await Promise.all([
      Bun.write(componentPath, `import "./panel.css";\nexport default () => <div />;`),
      Bun.write(cssPath, `@font-face { font-family: "Panel"; src: url("panel.woff2"); }`),
    ]);

    await expect(collectComponentDependencies(
      {
        id: "panel",
        kind: "react",
        component: "components/Panel.tsx",
        componentPath,
        exportName: "default",
      },
      [directory],
    )).resolves.toEqual([cssPath, componentPath].sort());
  });

  test("嵌套 Scene 组件可从根资源目录导入字体叶子依赖", async () => {
    const directory = await mkdtemp(join(import.meta.dir, ".sdk-component-font-"));
    directories.push(directory);
    const sceneDirectory = join(directory, "scenes", "scene2");
    const components = join(sceneDirectory, "components");
    const fonts = join(directory, "fonts");
    await Promise.all([
      mkdir(components, { recursive: true }),
      mkdir(fonts, { recursive: true }),
    ]);
    const componentPath = join(components, "Panel.tsx");
    const fontPath = join(fonts, "Title.otf");
    await Promise.all([
      Bun.write(componentPath, `import fontUrl from "../../../fonts/Title.otf";\nexport default () => <div data-font={fontUrl} />;`),
      Bun.write(fontPath, new Uint8Array([0, 255, 79, 84, 84, 79])),
    ]);

    await expect(collectComponentDependencies(
      {
        id: "panel",
        kind: "react",
        component: "components/Panel.tsx",
        componentPath,
        exportName: "default",
      },
      [sceneDirectory, directory],
    )).resolves.toEqual([componentPath, fontPath].sort());
  });

  test("组件 import policy 允许 SDK，并在 bundle 后保留 ABI marker", async () => {
    const directory = await mkdtemp(join(import.meta.dir, ".sdk-component-"));
    directories.push(directory);
    const components = join(directory, "components");
    const bundles = join(directory, "bundles");
    await Promise.all([
      mkdir(components, { recursive: true }),
      mkdir(bundles, { recursive: true }),
    ]);
    const componentPath = join(components, "Panel.tsx");
    await Bun.write(
      componentPath,
      `import { defineReact, field } from "@fourier-video/sdk";
export default defineReact({
  name: "BundledPanel",
  schema: {
    value: field.number({ min: 0 }),
    accent: field.color({ default: "#ff0000" }),
  },
  component({ props }) {
    return <div style={{ width: "100%", height: "100%", display: "flex", background: props.value === 42 ? props.accent : "#0000ff" }} />;
  },
  designPreview() {
    return { props: { value: 42 }, composition: { width: 32, height: 24, durationSeconds: 0 } };
  },
});`,
    );

    const module = await bundleReactModule(
      {
        id: "panel",
        kind: "react",
        component: "components/Panel.tsx",
        componentPath,
        exportName: "default",
      },
      bundles,
      directory,
    );
    expect(readSdkArtifact(module.default, "react")).toMatchObject({
      kind: "react",
      name: "BundledPanel",
      sdkAbiVersion: 1,
    });

    const projectPath = join(directory, "main.tsx");
    await Bun.write(
      projectPath,
      `import { Canvas, defineProject, Project, ReactLayer, Timeline } from "@fourier-video/sdk/project";
export default defineProject(
  <Project id="sdk-component" version="1.0" audioSampleRate={48000}>
    <Canvas width={32} height={24} fps={10} background="#000000" colorSpace="sRGB" />
    <Timeline>
      <ReactLayer id="panel" at="0f" duration="1f" component="components/Panel.tsx"
        x={16} y={12} width={32} height={24} layer={0} props={{ value: 42 }} />
    </Timeline>
  </Project>,
);`,
    );
    const project = await loadProject(projectPath);
    const node = project.nodes[0];
    if (node?.kind !== "react") throw new Error("expected react node");
    const output = join(directory, "frame.png");
    await renderSparseVisualFrame(project, node, 0, output, {
      bundleDirectory: bundles,
      fonts: [],
    });
    expect(new Uint8Array(await Bun.file(output).arrayBuffer()).slice(0, 4))
      .toEqual(new Uint8Array([137, 80, 78, 71]));
  });

  test("SDK artifact kind 错配在正式 bundle seam 报稳定错误", async () => {
    const directory = await mkdtemp(join(import.meta.dir, ".sdk-kind-"));
    directories.push(directory);
    const components = join(directory, "components");
    const bundles = join(directory, "bundles");
    await Promise.all([
      mkdir(components, { recursive: true }),
      mkdir(bundles, { recursive: true }),
    ]);
    const componentPath = join(components, "Wrong.tsx");
    await Bun.write(
      componentPath,
      `import { defineMotion } from "@fourier-video/sdk";
export default defineMotion({
  name: "Wrong",
  schema: {},
  supportsTextMotion: false,
  component({ subject }) { return subject; },
  designPreview() {
    return { props: {}, subject: null, composition: { width: 16, height: 16, durationSeconds: 0 } };
  },
});`,
    );
    const projectPath = join(directory, "main.tsx");
    await Bun.write(
      projectPath,
      `import { Canvas, defineProject, Project, ReactLayer, Timeline } from "@fourier-video/sdk/project";
export default defineProject(
  <Project id="wrong-kind" version="1.0" audioSampleRate={48000}>
    <Canvas width={16} height={16} fps={10} background="#000000" colorSpace="sRGB" />
    <Timeline>
      <ReactLayer id="wrong" at="0f" duration="1f" component="components/Wrong.tsx"
        x={8} y={8} width={16} height={16} layer={0} />
    </Timeline>
  </Project>,
);`,
    );
    const project = await loadProject(projectPath);
    const node = project.nodes[0];
    if (node?.kind !== "react") throw new Error("expected react node");
    await expect(renderSparseVisualFrame(
      project,
      node,
      0,
      join(directory, "wrong.png"),
      { bundleDirectory: bundles, fonts: [] },
    )).rejects.toMatchObject({ code: "ARTIFACT_KIND_MISMATCH" });
  });
});
