import { describe, expect, test } from "bun:test";
import {
  Canvas,
  defineProject,
  Image,
  Project,
  Subtitle,
  Timeline,
} from "@fourier-video/sdk/project";
import { buildFfmpegPlan } from "../src/ffmpeg.ts";
import { compileProjectDeclaration } from "../src/project-compiler.ts";
import type { SubtitleTtsArtifact } from "../src/types.ts";

const artifact: SubtitleTtsArtifact = {
  sourcePath: "/tmp/project/.render-cache/tts/subtitle.wav",
  samples: 48_001,
  sampleRate: 48_000,
  durationSeconds: 48_001 / 48_000,
};

function project(duration?: string) {
  return defineProject(
    <Project id="tts-test" version="1.0" audioSampleRate={48_000}>
      <Canvas width={320} height={180} fps={30} background="#000000" colorSpace="sRGB" />
      <Timeline>
        <Subtitle id="line-1" at="0f" {...(duration === undefined ? {} : { duration })}
          content="自动匹配配音时长" tts={{ volume: 0.6 }}
          x={160} y={150} width={280} height={40} layer={2}
          font="fonts/test.ttf" fontSize={24} lineHeight={1.2}
          color="#FFFFFF" align="center" />
        <Image id="next" after="line-1" duration="10f" src="images/next.png"
          fit="contain" x={160} y={90} width={100} height={100} layer={1} />
      </Timeline>
    </Project>,
  );
}

function compile(duration?: string, prepared = true) {
  return compileProjectDeclaration(project(duration), {
    projectDir: "/tmp/project",
    validateAssets: false,
    ...(prepared ? { ttsArtifacts: new Map([["line-1", artifact]]) } : {}),
  });
}

describe("Subtitle TTS TSX 时间线", () => {
  test("以真实采样数向上取整字幕时长，并对齐后续节点", () => {
    const resolved = compile();
    expect(resolved.nodes[0]).toMatchObject({
      id: "line-1",
      kind: "subtitle",
      startFrame: 0,
      endFrame: 31,
      durationFrames: 31,
      voice: {
        volume: 0.6,
        samples: 48_001,
        sampleRate: 48_000,
      },
    });
    expect(resolved.nodes[1]).toMatchObject({
      id: "next",
      startFrame: 31,
      endFrame: 41,
    });
    expect(resolved.totalFrames).toBe(41);
  });

  test("把字幕生成音频加入 FFmpeg 混音输入", () => {
    const plan = buildFfmpegPlan(
      compile(),
      new Map([["line-1", {
        nodeId: "line-1",
        type: "static" as const,
        path: "/tmp/generated-line.png",
        width: 280,
        height: 40,
      }]]),
      "/tmp/output.mp4",
      { output: "/tmp/output.mp4" },
    );
    expect(plan.args).toContain(artifact.sourcePath);
    expect(plan.filterGraph).toContain("[audio_0]");
    expect(plan.filterGraph).toContain("volume=0.6");
    expect(plan.filterGraph).toContain("adelay=delays=0S:all=1");
  });

  test("拒绝手工 duration 与自动 TTS 时长冲突", () => {
    expect(() => compile("1s")).toThrow("启用 TTS 后不能声明 duration");
  });

  test("同步编译入口会明确提示先准备 TTS", () => {
    expect(() => compile(undefined, false)).toThrow("TTS 音频尚未合成");
  });
});
