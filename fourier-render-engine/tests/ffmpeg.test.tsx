import { describe, expect, test } from "bun:test";
import {
  Canvas,
  defineProject,
  Image,
  Project,
  Timeline,
  Transform,
  Video,
} from "@fourier-video/sdk/project";
import { buildFfmpegPlan } from "../src/ffmpeg.ts";
import { compileProjectDeclaration } from "../src/project-compiler.ts";
import type { PreparedVisual } from "../src/visual-renderer.ts";

describe("FFmpeg consumes Project JSX IR", () => {
  test("Transform 仍生成逐帧 overlay 表达式", () => {
    const project = compileProjectDeclaration(defineProject(
      <Project id="transform-frame-index" version="1.0" audioSampleRate={48_000}>
        <Canvas width={64} height={64} fps={10} background="#000" colorSpace="sRGB" />
        <Timeline>
          <Image id="card" at="5f" duration="3f" src="card.png" fit="stretch"
            x={10} y={20} width={8} height={8} layer={1}>
            <Transform id="move" at="0f" duration="3f" fill="none" easing="linear"
              keyframes={[
                { offset: 0, translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
                { offset: 1, translateX: 20, translateY: 20, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
              ]} />
          </Image>
        </Timeline>
      </Project>,
    ), { projectDir: "/tmp/fourier-ffmpeg-test", validateAssets: false });

    const plan = buildFfmpegPlan(project, new Map(), "/tmp/fourier-transform.mp4", {
      output: "/tmp/fourier-transform.mp4",
    });
    expect(plan.filterGraph).toContain(
      "x='(if(lte(n,7),if(lte(n,6),10,20),30))-overlay_w/2'",
    );
    expect(plan.filterGraph).toContain(
      "y='(if(lte(n,7),if(lte(n,6),20,30),40))-overlay_h/2'",
    );
  });

  test("FFmpeg Video Motion 仍直接读取原视频并合成投影", () => {
    const project = compileProjectDeclaration(defineProject(
      <Project id="ffmpeg-video-panel" version="1.0" audioSampleRate={48_000}>
        <Canvas width={64} height={64} fps={10} background="#000" colorSpace="sRGB" />
        <Timeline>
          <Video id="clip" at="0f" duration="3f" src="clip.mp4" sourceIn="2f"
            rate={1.5} loop fit="stretch" audio x={32} y={32} width={8} height={8} layer={1} />
        </Timeline>
      </Project>,
    ), { projectDir: "/tmp/fourier-ffmpeg-video-test", validateAssets: false });
    const projections = [
      [[0, 0], [8, 0], [0, 8], [8, 8]],
      [[1, 0], [7, 1], [1, 8], [7, 7]],
      [[0, 0], [8, 0], [0, 8], [8, 8]],
    ].map((corners) => ({
      videoId: "subject",
      corners: corners.map(([x, y]) => ({ x, y })) as [
        { x: number; y: number }, { x: number; y: number },
        { x: number; y: number }, { x: number; y: number },
      ],
      cornerRadiusRatio: 0.055,
    }));
    const prepared = new Map<string, PreparedVisual>([["clip", {
      nodeId: "clip",
      type: "sequence",
      path: "/tmp/fourier-panel-%08d.png",
      width: 8,
      height: 8,
      ffmpegVideo: { projections, maskPath: "/tmp/fourier-video-mask-%08d.png" },
    }]]);

    const plan = buildFfmpegPlan(project, prepared, "/tmp/fourier-video-panel.mp4", {
      output: "/tmp/fourier-video-panel.mp4",
    });
    expect(plan.args).toContain("/tmp/fourier-ffmpeg-video-test/clip.mp4");
    expect(plan.filterGraph).toContain("perspective=");
    expect(plan.filterGraph).toContain("sense=destination:eval=frame");
    expect(plan.filterGraph).toContain("alphaextract");
    expect(plan.filterGraph).toContain("alphamerge");
    expect(plan.filterGraph).toContain("[2:a]atrim=start=0.2:duration=0.45");
  });
});
