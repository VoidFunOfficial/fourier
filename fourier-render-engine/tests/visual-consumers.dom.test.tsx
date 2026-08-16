import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { openArtifact } from "@fourier-video/sdk/testing";
import {
  Canvas,
  defineProject,
  Project,
  ReactLayer,
  Timeline,
} from "@fourier-video/sdk/project";
import { compileProjectDeclaration } from "../src/project-compiler.ts";
import {
  prepareGeneratedVisuals,
  renderSparseVisualFrame,
} from "../src/visual-renderer.ts";

const describeDom = Bun.env.RUN_DOM_TESTS === "1" ? describe : describe.skip;

describeDom("DOM timeline TSX consumer conformance", () => {
  test("连续组件在一次 preparation 中复用同一个 Chromium runtime", async () => {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), "fourier-consumer-reuse-"));
    const originalLaunch = chromium.launch.bind(chromium);
    let launches = 0;
    chromium.launch = ((...arguments_: Parameters<typeof chromium.launch>) => {
      launches += 1;
      return originalLaunch(...arguments_);
    }) as typeof chromium.launch;
    const project = compileProjectDeclaration(defineProject(
      <Project id="dom-consumer-reuse" version="1.0" audioSampleRate={48_000}>
        <Canvas width={32} height={24} fps={60} background="#000000" colorSpace="sRGB" />
        <Timeline>
          {Array.from({ length: 6 }, (_, index) => (
            <ReactLayer key={index} id={`panel-${index}`} at="0f" duration="120f"
              component="components/DomStaticPanel.tsx" x={16} y={12}
              width={32} height={24} layer={index} preview />
          ))}
        </Timeline>
      </Project>,
    ), { projectDir: import.meta.dir, validateAssets: true });
    try {
      const prepared = await prepareGeneratedVisuals(project, {
        temporaryDirectory,
        frameConcurrency: 2,
        domPages: 2,
      });
      expect(prepared.size).toBe(6);
      expect(launches).toBe(1);
      for (const visual of prepared.values()) {
        expect(visual.type).toBe("static");
        expect(visual.path.endsWith("static.png")).toBe(true);
        expect(await Bun.file(visual.path).exists()).toBe(true);
      }
    } finally {
      chromium.launch = originalLaunch;
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }, 30_000);

  test("full preparation、design preview 与 SDK testing 对同一 snapshot/time 逐字节一致", async () => {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), "fourier-consumer-dom-"));
    const sparseDirectory = join(temporaryDirectory, "sparse");
    await Promise.all([
      mkdir(sparseDirectory, { recursive: true }),
      mkdir(join(sparseDirectory, "bundles"), { recursive: true }),
    ]);
    const project = compileProjectDeclaration(defineProject(
      <Project id="dom-consumer" version="1.0" audioSampleRate={48_000}>
        <Canvas width={64} height={64} fps={60} background="#000000" colorSpace="sRGB" />
        <Timeline>
          <ReactLayer id="panel" at="0f" duration="60f"
            component="components/DomTimelinePanel.tsx" x={32} y={32}
            width={64} height={64} layer={0} preview />
        </Timeline>
      </Project>,
    ), { projectDir: import.meta.dir, validateAssets: true });
    const node = project.nodes[0];
    if (node?.kind !== "react") throw new Error("expected React node");
    try {
      const prepared = await prepareGeneratedVisuals(project, {
        temporaryDirectory,
        frameConcurrency: 3,
        domPages: 3,
      });
      const full = prepared.get("panel");
      if (full === undefined) throw new Error("missing prepared visual");
      expect(full.timelineArtifacts).toHaveLength(1);
      const fullFrame = new Uint8Array(await Bun.file(
        full.path.replace("%08d", "00000030"),
      ).arrayBuffer());

      const sparsePath = join(sparseDirectory, "frame.png");
      await renderSparseVisualFrame(project, node, 30, sparsePath, {
        bundleDirectory: join(sparseDirectory, "bundles"),
        fonts: [],
        domPages: 1,
      });
      const sparse = new Uint8Array(await Bun.file(sparsePath).arrayBuffer());

      const fixture = await openArtifact(join(import.meta.dir, "components/DomTimelinePanel.tsx"));
      try {
        const testing = await fixture.renderFrame({ frame: 30 });
        expect(sparse).toEqual(fullFrame);
        expect(testing.png).toEqual(fullFrame);
      } finally {
        await fixture.close();
      }
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }, 30_000);
});
