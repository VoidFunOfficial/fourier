#!/usr/bin/env bun

import { existsSync } from "node:fs";
import {
  copyFile,
  mkdir,
  readdir,
  rm,
  stat,
} from "node:fs/promises";
import {
  arch,
  availableParallelism,
  cpus,
  platform,
  release,
  totalmem,
} from "node:os";
import {
  dirname,
  join,
  resolve,
} from "node:path";
import { fileURLToPath } from "node:url";
import { renderProject, validateProject } from "../src/renderer.ts";
import { toErrorResponse } from "../src/errors.ts";
import type { RenderProgress } from "../src/types.ts";

export type ResolutionName = "1080p" | "4k" | "8k";

export interface Resolution {
  name: ResolutionName;
  width: number;
  height: number;
}

export const RESOLUTIONS: Record<ResolutionName, Resolution> = {
  "1080p": { name: "1080p", width: 1920, height: 1080 },
  "4k": { name: "4k", width: 3840, height: 2160 },
  "8k": { name: "8k", width: 7680, height: 4320 },
};

export interface BenchmarkOptions {
  resolutions: ResolutionName[];
  frames: number;
  fps: number;
  iterations: number;
  warmup: number;
  seed: number;
  outputDirectory: string;
  preset: string;
  crf: number;
  frameConcurrency: number;
  validateMedia: boolean;
}

export interface BenchmarkProjectOptions {
  directory: string;
  resolution: Resolution;
  frames: number;
  fps: number;
  seed: number;
  iteration: number;
}

interface PreparedBenchmarkProject {
  projectPath: string;
  outputPath: string;
  resolution: Resolution;
  seed: number;
  iteration: number;
}

interface PhaseDurations {
  validationMs: number | null;
  preparationMs: number | null;
  encodingMs: number | null;
}

export interface BenchmarkSuccess extends PhaseDurations {
  status: "ok";
  resolution: ResolutionName;
  width: number;
  height: number;
  iteration: number;
  seed: number;
  projectPath: string;
  outputPath: string;
  totalFrames: number;
  videoDurationSeconds: number;
  engineElapsedMs: number;
  wallElapsedMs: number;
  renderFps: number;
  realtimeFactor: number;
  megapixelsPerSecond: number;
  outputBytes: number;
}

export interface BenchmarkFailure {
  status: "failed";
  resolution: ResolutionName;
  width: number;
  height: number;
  iteration: number;
  seed: number;
  projectPath: string;
  outputPath: string;
  error: unknown;
}

export type BenchmarkMeasurement = BenchmarkSuccess | BenchmarkFailure;

export interface ResolutionSummary {
  resolution: ResolutionName;
  width: number;
  height: number;
  successfulRuns: number;
  failedRuns: number;
  averageElapsedMs: number | null;
  medianElapsedMs: number | null;
  averageRenderFps: number | null;
  averageRealtimeFactor: number | null;
  averageMegapixelsPerSecond: number | null;
}

export interface BenchmarkReport {
  schemaVersion: 1;
  startedAt: string;
  finishedAt: string;
  system: {
    platform: string;
    release: string;
    arch: string;
    cpu: string;
    logicalCpus: number;
    availableParallelism: number;
    totalMemoryBytes: number;
    bunVersion: string;
    ffmpegVersion: string;
  };
  config: {
    resolutions: ResolutionName[];
    frames: number;
    fps: number;
    iterations: number;
    warmup: number;
    seed: number;
    preset: string;
    crf: number;
    frameConcurrency: number;
    validateMedia: boolean;
    outputDirectory: string;
  };
  measurements: BenchmarkMeasurement[];
  summaries: ResolutionSummary[];
}

export type BenchmarkPhase =
  | "preparing"
  | "validating"
  | "warming-up"
  | "measuring"
  | "writing-report"
  | "completed";

export interface BenchmarkProgress {
  phase: BenchmarkPhase;
  progress: number;
  message?: string;
}

export interface BenchmarkRunResult {
  report: BenchmarkReport;
  reportPath: string;
  markdownPath: string;
}

const BENCHMARK_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIRECTORY = join(BENCHMARK_DIRECTORY, "fixtures");

function sourceString(value: string): string {
  return JSON.stringify(value);
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function integer(
  random: () => number,
  minimum: number,
  maximum: number,
): number {
  return Math.floor(random() * (maximum - minimum + 1)) + minimum;
}

function pick<T>(random: () => number, values: readonly T[]): T {
  const value = values[Math.floor(random() * values.length)];
  if (value === undefined) throw new Error("随机候选列表不能为空");
  return value;
}

function fixed(value: number, digits = 3): string {
  return Number(value.toFixed(digits)).toString();
}

function scaledPixels(
  source1080p: number,
  resolution: Resolution,
): number {
  return Math.max(1, Math.round(source1080p * (resolution.height / 1080)));
}

function color(random: () => number): string {
  const channels = Array.from({ length: 3 }, () =>
    integer(random, 40, 230).toString(16).padStart(2, "0")
  );
  return `#${channels.join("").toUpperCase()}`;
}

export function generateBenchmarkTsx(
  options: Omit<BenchmarkProjectOptions, "directory">,
): string {
  const { resolution, frames, fps, seed, iteration } = options;
  if (!Number.isInteger(frames) || frames < 12) {
    throw new TypeError("frames 必须是至少 12 的整数");
  }
  if (!Number.isInteger(fps) || fps <= 0) {
    throw new TypeError("fps 必须是正整数");
  }

  const random = mulberry32(seed);
  const { width, height, name } = resolution;
  const centerX = Math.round(width / 2);
  const centerY = Math.round(height / 2);
  const tailFrames = Math.max(4, Math.floor(frames * 0.2));
  const sequenceGap = tailFrames >= 6 ? integer(random, 0, 2) : 0;
  const firstSequenceFrames = Math.max(
    2,
    Math.floor((tailFrames - sequenceGap) / 2),
  );
  const secondSequenceFrames =
    tailFrames - sequenceGap - firstSequenceFrames;
  const mainFrames = frames - tailFrames;
  const modifierFrames = Math.max(
    2,
    Math.min(mainFrames, Math.round(mainFrames * 0.45)),
  );
  const subtitleOffset = integer(
    random,
    0,
    Math.max(0, Math.min(4, mainFrames - 2)),
  );
  const subtitleFrames = mainFrames - subtitleOffset;
  const background = pick(random, [
    "#070B18",
    "#0B1020",
    "#111827",
    "#17122B",
  ]);
  const title = pick(random, [
    "FOURIER RENDER MATRIX",
    "PIXEL THROUGHPUT LAB",
    "DETERMINISTIC FRAME TEST",
    "COMPOSITOR STRESS RUN",
  ]);
  const subtitle = pick(random, [
    "Video · Image · Text · React · Motion",
    "Deterministic TSX performance sample",
    "Layered composition at native resolution",
    "Randomized scene, reproducible seed",
  ]);
  const fit = pick(random, ["cover", "contain", "stretch"] as const);
  const easing = pick(
    random,
    ["linear", "ease-in", "ease-out", "ease-in-out"] as const,
  );
  const accent = color(random);
  const secondary = color(random);
  const videoWidth = Math.round(width * pick(random, [0.54, 0.58, 0.62]));
  const videoHeight = Math.round(height * pick(random, [0.52, 0.58, 0.64]));
  const panelWidth = Math.round(width * pick(random, [0.2, 0.22, 0.24]));
  const panelHeight = Math.round(height * pick(random, [0.25, 0.28, 0.3]));
  const cardWidth = Math.round(width * pick(random, [0.16, 0.18, 0.2]));
  const cardHeight = Math.round(height * pick(random, [0.2, 0.22, 0.24]));
  const keyframes = (value: readonly Record<string, number>[]): string =>
    JSON.stringify(value);
  const projectId = "benchmark-" + name + "-" + iteration + "-" + seed;

  return [
    "import { Audio, Canvas, Group, Image, Motion, Project, ReactLayer, Subtitle, Text, Timeline, Transform, Video, defineProject } from \"@fourier-video/sdk/project\";",
    "",
    "export default defineProject(",
    "  <Project id={" + sourceString(projectId) + "} version=\"1.0\" audioSampleRate={48000}>",
    "    <Canvas width={" + width + "} height={" + height + "} fps={" + fps +
      "} background={" + sourceString(background) + "} colorSpace=\"sRGB\" />",
    "    <Timeline>",
    "      <Image id=\"background\" at=\"0f\" duration=\"" + frames +
      "f\" src=\"assets/background.png\" fit=\"stretch\" x={" + centerX +
      "} y={" + centerY + "} width={" + width + "} height={" + height +
      "} layer={0} opacity={0.72}>",
    "        <Transform id=\"background-drift\" at=\"0f\" duration=\"" + frames +
      "f\" fill=\"both\" easing={" + sourceString(easing) + "} keyframes={" +
      keyframes([
        {
          offset: 0,
          translateX: integer(random, -18, -6),
          translateY: integer(random, -10, 0),
          scaleX: 1.02,
          scaleY: 1.02,
          rotation: -0.4,
          opacity: 0.82,
        },
        {
          offset: 0.5,
          translateX: 0,
          translateY: integer(random, -4, 4),
          scaleX: 1.04,
          scaleY: 1.04,
          rotation: 0,
          opacity: 0.94,
        },
        {
          offset: 1,
          translateX: integer(random, 6, 18),
          translateY: integer(random, 0, 10),
          scaleX: 1.02,
          scaleY: 1.02,
          rotation: 0.4,
          opacity: 0.82,
        },
      ]) + "} />",
    "      </Image>",
    "",
    "      <Group id=\"main-parallel\" mode=\"parallel\" with=\"background\">",
    "        <Video id=\"video-layer\" duration=\"" + mainFrames +
      "f\" src=\"assets/video.mp4\" sourceIn=\"0f\" fit={" +
      sourceString(fit) + "} audio={false} rate={1} loop x={" +
      Math.round(width * 0.43) + "} y={" + Math.round(height * 0.54) +
      "} width={" + videoWidth + "} height={" + videoHeight +
      "} layer={2} opacity={" + fixed(0.7 + random() * 0.2) +
      "} rotation={" + fixed(-1.5 + random() * 3) + "}>",
    "          <Transform id=\"video-enter\" at=\"0f\" duration=\"" +
      modifierFrames + "f\" fill=\"forwards\" easing=\"ease-out\" keyframes={" +
      keyframes([
        {
          offset: 0,
          translateX: -scaledPixels(64, resolution),
          translateY: 0,
          scaleX: 0.96,
          scaleY: 0.96,
          rotation: -1.5,
          opacity: 0.25,
        },
        {
          offset: 1,
          translateX: 0,
          translateY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          opacity: 1,
        },
      ]) + "} />",
    "        </Video>",
    "",
    "        <Text id=\"title\" duration=\"" + mainFrames +
      "f\" role=\"title\" x={" + centerX + "} y={" +
      Math.round(height * 0.13) + "} width={" + Math.round(width * 0.78) +
      "} height={" + Math.round(height * 0.12) +
      "} layer={8} font=\"fonts/TestFont.ttf\" fontSize={" +
      scaledPixels(integer(random, 48, 64), resolution) +
      "} lineHeight={1.05} color=\"#FFFFFF\" align=\"center\" verticalAlign=\"center\" maxLines={1} overflow=\"ellipsis\" background=\"transparent\" content={" +
      sourceString(title) + "}>",
    "          <Transform id=\"title-rise\" at=\"0f\" duration=\"" +
      modifierFrames + "f\" fill=\"forwards\" easing={" +
      sourceString(easing) + "} keyframes={" + keyframes([
        {
          offset: 0,
          translateX: 0,
          translateY: scaledPixels(48, resolution),
          scaleX: 0.94,
          scaleY: 0.94,
          rotation: 0,
          opacity: 0,
        },
        {
          offset: 1,
          translateX: 0,
          translateY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          opacity: 1,
        },
      ]) + "} />",
    "        </Text>",
    "",
    "        <Subtitle id=\"subtitle\" offset=\"" + subtitleOffset +
      "f\" duration=\"" + subtitleFrames + "f\" x={" + centerX +
      "} y={" + Math.round(height * 0.9) + "} width={" +
      Math.round(width * 0.72) + "} height={" + Math.round(height * 0.08) +
      "} layer={12} font=\"fonts/TestFont.ttf\" fontSize={" +
      scaledPixels(integer(random, 25, 32), resolution) +
      "} lineHeight={1.15} color=\"#FFFFFF\" align=\"center\" verticalAlign=\"center\" maxLines={1} overflow=\"ellipsis\" background=\"#000000A8\" content={" +
      sourceString(subtitle) + "} />",
    "",
    "        <ReactLayer id=\"metrics-panel\" duration=\"" + mainFrames +
      "f\" component=\"components/BenchmarkPanel.tsx\" exportName=\"default\" x={" +
      Math.round(width * 0.81) + "} y={" + Math.round(height * 0.53) +
      "} width={" + panelWidth + "} height={" + panelHeight +
      "} layer={10} opacity={0.96} rotation={" + integer(random, -3, 3) +
      "} props={" + JSON.stringify({
        title: name.toUpperCase() + " LOAD",
        value: Number(fixed(0.35 + random() * 0.6)),
        showGrid: random() > 0.25,
        accent,
        delay: "1f",
      }) + "}>",
    "          <Transform id=\"panel-slide\" at=\"0f\" duration=\"" +
      modifierFrames +
      "f\" fill=\"forwards\" easing=\"ease-out\" keyframes={" + keyframes([
        {
          offset: 0,
          translateX: scaledPixels(90, resolution),
          translateY: 0,
          scaleX: 0.9,
          scaleY: 0.9,
          rotation: 3,
          opacity: 0,
        },
        {
          offset: 1,
          translateX: 0,
          translateY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          opacity: 1,
        },
      ]) + "} />",
    "        </ReactLayer>",
    "",
    "        <Image id=\"motion-card\" duration=\"" + mainFrames +
      "f\" src=\"assets/card.png\" fit=\"cover\" x={" +
      Math.round(width * 0.2) + "} y={" + Math.round(height * 0.67) +
      "} width={" + cardWidth + "} height={" + cardHeight +
      "} layer={9} opacity={0.94} rotation={" + integer(random, -5, 5) + "}>",
    "          <Motion id=\"card-reveal\" at=\"0f\" duration=\"" +
      modifierFrames +
      "f\" fill=\"forwards\" component=\"BenchmarkReveal.ts\" props={" +
      JSON.stringify({
        direction: pick(random, ["left", "right"]),
        distance: scaledPixels(integer(random, 20, 60), resolution),
      }) + "} />",
    "          <Transform id=\"card-transform\" with=\"card-reveal\" duration=\"" +
      modifierFrames + "f\" fill=\"forwards\" easing={" +
      sourceString(easing) + "} keyframes={" + keyframes([
        {
          offset: 0,
          translateX: 0,
          translateY: scaledPixels(42, resolution),
          scaleX: 0.78,
          scaleY: 0.78,
          rotation: -8,
          opacity: 0.2,
        },
        {
          offset: 0.6,
          translateX: 0,
          translateY: -scaledPixels(5, resolution),
          scaleX: 1.04,
          scaleY: 1.04,
          rotation: 2,
          opacity: 1,
        },
        {
          offset: 1,
          translateX: 0,
          translateY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          opacity: 1,
        },
      ]) + "} />",
    "        </Image>",
    "      </Group>",
    "",
    "      <Group id=\"outro-sequence\" mode=\"sequence\" after=\"main-parallel\">",
    "        <Image id=\"outro-image\" duration=\"" + firstSequenceFrames +
      "f\" src=\"assets/card.png\" fit=\"contain\" x={" + centerX +
      "} y={" + centerY + "} width={" + Math.round(width * 0.3) +
      "} height={" + Math.round(height * 0.34) +
      "} layer={5} opacity={0.92} rotation={" +
      integer(random, -4, 4) + "} />",
    "        <Text id=\"outro-label\" offset=\"" + sequenceGap +
      "f\" duration=\"" + secondSequenceFrames +
      "f\" role=\"label\" x={" + centerX + "} y={" + centerY +
      "} width={" + Math.round(width * 0.62) + "} height={" +
      Math.round(height * 0.16) +
      "} layer={7} font=\"fonts/TestFont.ttf\" fontSize={" +
      scaledPixels(integer(random, 36, 48), resolution) +
      "} lineHeight={1.1} color={" + sourceString(secondary) +
      "} align=\"center\" verticalAlign=\"center\" maxLines={1} overflow=\"ellipsis\" background=\"#080B16E8\" content={" +
      sourceString("SEQUENCE COMPLETE · " + seed) + "} />",
    "      </Group>",
    "",
    "      <Audio id=\"benchmark-audio\" with=\"background\" duration=\"" +
      frames +
      "f\" src=\"assets/tone.wav\" sourceIn=\"0f\" volume={0.12} rate={1} muted={false} />",
    "    </Timeline>",
    "  </Project>,",
    ");",
    "",
  ].join("\n");
}

function writeAscii(
  bytes: Uint8Array,
  offset: number,
  value: string,
): void {
  for (let index = 0; index < value.length; index++) {
    bytes[offset + index] = value.charCodeAt(index);
  }
}

async function writeToneWav(
  path: string,
  durationSeconds: number,
  seed: number,
): Promise<void> {
  const sampleRate = 48_000;
  const channels = 2;
  const bytesPerSample = 2;
  const sampleCount = Math.ceil(durationSeconds * sampleRate) + 1;
  const dataSize = sampleCount * channels * bytesPerSample;
  const bytes = new Uint8Array(44 + dataSize);
  const view = new DataView(bytes.buffer);
  writeAscii(bytes, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(bytes, 8, "WAVE");
  writeAscii(bytes, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeAscii(bytes, 36, "data");
  view.setUint32(40, dataSize, true);
  const frequency = 180 + (seed % 260);
  for (let sample = 0; sample < sampleCount; sample++) {
    const envelope = Math.min(1, sample / 480);
    const value = Math.round(
      Math.sin((sample / sampleRate) * frequency * Math.PI * 2) *
        1800 *
        envelope,
    );
    const offset = 44 + sample * channels * bytesPerSample;
    view.setInt16(offset, value, true);
    view.setInt16(offset + bytesPerSample, value, true);
  }
  await Bun.write(path, bytes);
}

async function runFixtureCommand(args: string[]): Promise<void> {
  const process = Bun.spawn(args, {
    stdout: "ignore",
    stderr: "pipe",
  });
  const [exitCode, stderr] = await Promise.all([
    process.exited,
    new Response(process.stderr).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(
      `生成 benchmark 素材失败: ${args.join(" ")}\n${stderr}`,
    );
  }
}

function findBenchmarkFont(): string {
  const candidates = [
    Bun.env.BENCHMARK_FONT_PATH,
    Bun.env.TEST_FONT_PATH,
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
  ].filter((value): value is string => value !== undefined);
  const font = candidates.find(existsSync);
  if (font === undefined) {
    throw new Error(
      "找不到 benchmark 可用的 TTF 字体；请通过 " +
        "BENCHMARK_FONT_PATH 指定字体文件",
    );
  }
  return font;
}

async function generateMediaFixtures(
  directory: string,
  fps: number,
): Promise<void> {
  const assets = join(directory, "assets");
  await Promise.all([
    runFixtureCommand([
      "ffmpeg",
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=320x180:rate=1",
      "-frames:v",
      "1",
      join(assets, "background.png"),
    ]),
    runFixtureCommand([
      "ffmpeg",
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=0x2563EB:s=160x90",
      "-frames:v",
      "1",
      join(assets, "card.png"),
    ]),
    runFixtureCommand([
      "ffmpeg",
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      `testsrc2=size=320x180:rate=${Math.min(30, Math.max(10, fps))}:duration=2`,
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=660:sample_rate=48000:duration=2",
      "-shortest",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      join(assets, "video.mp4"),
    ]),
  ]);
}

export async function prepareBenchmarkProject(
  options: BenchmarkProjectOptions,
): Promise<PreparedBenchmarkProject> {
  const { directory, resolution, frames, fps, seed, iteration } = options;
  await mkdir(join(directory, "assets"), { recursive: true });
  await mkdir(join(directory, "fonts"), { recursive: true });
  await mkdir(join(directory, "components"), { recursive: true });
  await mkdir(join(directory, "motions"), { recursive: true });
  await generateMediaFixtures(directory, fps);
  await Promise.all([
    copyFile(
      findBenchmarkFont(),
      join(directory, "fonts", "TestFont.ttf"),
    ),
    copyFile(
      join(FIXTURE_DIRECTORY, "components", "BenchmarkPanel.tsx"),
      join(directory, "components", "BenchmarkPanel.tsx"),
    ),
    copyFile(
      join(FIXTURE_DIRECTORY, "motions", "BenchmarkReveal.ts"),
      join(directory, "motions", "BenchmarkReveal.ts"),
    ),
    writeToneWav(join(directory, "assets", "tone.wav"), frames / fps, seed),
  ]);
  const projectPath = join(directory, "main.tsx");
  await Bun.write(
    projectPath,
    generateBenchmarkTsx({ resolution, frames, fps, seed, iteration }),
  );
  return {
    projectPath,
    outputPath: join(directory, "render.mp4"),
    resolution,
    seed,
    iteration,
  };
}

export function parseBenchmarkResolutions(
  source: string | undefined,
): ResolutionName[] {
  if (source === undefined || source === "all") {
    return ["1080p", "4k", "8k"];
  }
  const values = source
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value !== "");
  if (values.length === 0) {
    throw new TypeError("--resolutions 不能为空");
  }
  const unique: ResolutionName[] = [];
  for (const value of values) {
    if (value !== "1080p" && value !== "4k" && value !== "8k") {
      throw new TypeError(`未知分辨率 "${value}"，只支持 1080p、4k、8k`);
    }
    if (!unique.includes(value)) unique.push(value);
  }
  return unique;
}

function timestampDirectoryName(seed: number): string {
  const timestamp = new Date()
    .toISOString()
    .replaceAll(":", "-")
    .replace(/\.\d{3}Z$/, "Z");
  return `${timestamp}-seed-${seed}`;
}

export interface BenchmarkOptionOverrides {
  resolutions?: ResolutionName[];
  frames?: number;
  fps?: number;
  iterations?: number;
  warmup?: number;
  seed?: number;
  outputDirectory?: string;
  preset?: string;
  crf?: number;
  frameConcurrency?: number;
  validateMedia?: boolean;
}

function assertInteger(
  value: number,
  field: string,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(`${field} 必须是 ${minimum}—${maximum} 之间的整数`);
  }
}

export function createBenchmarkOptions(
  overrides: BenchmarkOptionOverrides = {},
): BenchmarkOptions {
  const seed = overrides.seed ?? (Date.now() >>> 0);
  const frames = overrides.frames ?? 30;
  const fps = overrides.fps ?? 30;
  const iterations = overrides.iterations ?? 1;
  const warmup = overrides.warmup ?? 0;
  const crf = overrides.crf ?? 23;
  const frameConcurrency =
    overrides.frameConcurrency ?? Math.min(2, availableParallelism());
  assertInteger(seed, "seed", 0, 0xffffffff);
  assertInteger(frames, "frames", 12);
  assertInteger(fps, "fps", 1);
  assertInteger(iterations, "iterations", 1);
  assertInteger(warmup, "warmup", 0);
  assertInteger(crf, "crf", 0, 51);
  assertInteger(frameConcurrency, "frameConcurrency", 1);
  const resolutions = overrides.resolutions ?? ["1080p", "4k", "8k"];
  if (resolutions.length === 0) {
    throw new TypeError("resolutions 不能为空");
  }
  return {
    resolutions: [...resolutions],
    frames,
    fps,
    iterations,
    warmup,
    seed,
    outputDirectory:
      overrides.outputDirectory === undefined
        ? resolve("benchmark", "results", timestampDirectoryName(seed))
        : resolve(overrides.outputDirectory),
    preset: overrides.preset ?? "ultrafast",
    crf,
    frameConcurrency,
    validateMedia: overrides.validateMedia ?? true,
  };
}

async function ensureEmptyOutputDirectory(path: string): Promise<void> {
  if (existsSync(path)) {
    const entries = await readdir(path);
    if (entries.length > 0) {
      throw new Error(`输出目录必须为空，当前包含文件: ${path}`);
    }
  }
  await mkdir(path, { recursive: true });
}

async function ffmpegVersion(): Promise<string> {
  try {
    const process = Bun.spawn(["ffmpeg", "-version"], {
      stdout: "pipe",
      stderr: "ignore",
    });
    const [exitCode, output] = await Promise.all([
      process.exited,
      new Response(process.stdout).text(),
    ]);
    if (exitCode !== 0) return "unavailable";
    return output.split(/\r?\n/, 1)[0] ?? "unknown";
  } catch {
    return "unavailable";
  }
}

async function renderOnce(
  project: PreparedBenchmarkProject,
  options: BenchmarkOptions,
  outputPath: string,
  onProgress?: (progress: RenderProgress) => void,
): Promise<BenchmarkSuccess> {
  let validationCompletedAt: number | undefined;
  let preparationCompletedAt: number | undefined;
  const startedAt = performance.now();
  const result = await renderProject(project.projectPath, {
    output: outputPath,
    overwrite: false,
    validateMedia: options.validateMedia,
    preset: options.preset,
    crf: options.crf,
    frameConcurrency: options.frameConcurrency,
    onProgress(progress) {
      const now = performance.now();
      if (
        progress.phase === "validating" &&
        progress.progress >= 1 &&
        validationCompletedAt === undefined
      ) {
        validationCompletedAt = now;
      }
      if (
        progress.phase === "preparing" &&
        progress.progress >= 1 &&
        preparationCompletedAt === undefined
      ) {
        preparationCompletedAt = now;
      }
      onProgress?.(progress);
    },
  });
  const finishedAt = performance.now();
  const wallElapsedMs = finishedAt - startedAt;
  const validationMs =
    validationCompletedAt === undefined
      ? null
      : validationCompletedAt - startedAt;
  const preparationMs =
    validationCompletedAt === undefined ||
    preparationCompletedAt === undefined
      ? null
      : preparationCompletedAt - validationCompletedAt;
  const encodingMs =
    preparationCompletedAt === undefined
      ? null
      : finishedAt - preparationCompletedAt;
  const wallSeconds = wallElapsedMs / 1000;
  const outputBytes = (await stat(outputPath)).size;
  return {
    status: "ok",
    resolution: project.resolution.name,
    width: project.resolution.width,
    height: project.resolution.height,
    iteration: project.iteration,
    seed: project.seed,
    projectPath: project.projectPath,
    outputPath,
    totalFrames: result.totalFrames,
    videoDurationSeconds: result.durationSeconds,
    engineElapsedMs: result.elapsedMs,
    wallElapsedMs,
    renderFps: result.totalFrames / wallSeconds,
    realtimeFactor: result.durationSeconds / wallSeconds,
    megapixelsPerSecond:
      (project.resolution.width *
        project.resolution.height *
        result.totalFrames) /
      wallSeconds /
      1_000_000,
    outputBytes,
    validationMs,
    preparationMs,
    encodingMs,
  };
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = values.toSorted((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const right = sorted[middle];
  if (right === undefined) return null;
  if (sorted.length % 2 === 1) return right;
  const left = sorted[middle - 1];
  return left === undefined ? right : (left + right) / 2;
}

function summarize(
  measurements: BenchmarkMeasurement[],
  resolutions: ResolutionName[],
): ResolutionSummary[] {
  return resolutions.map((name) => {
    const resolution = RESOLUTIONS[name];
    const all = measurements.filter(
      (measurement) => measurement.resolution === name,
    );
    const success = all.filter(
      (measurement): measurement is BenchmarkSuccess =>
        measurement.status === "ok",
    );
    return {
      resolution: name,
      width: resolution.width,
      height: resolution.height,
      successfulRuns: success.length,
      failedRuns: all.length - success.length,
      averageElapsedMs: average(
        success.map((measurement) => measurement.wallElapsedMs),
      ),
      medianElapsedMs: median(
        success.map((measurement) => measurement.wallElapsedMs),
      ),
      averageRenderFps: average(
        success.map((measurement) => measurement.renderFps),
      ),
      averageRealtimeFactor: average(
        success.map((measurement) => measurement.realtimeFactor),
      ),
      averageMegapixelsPerSecond: average(
        success.map((measurement) => measurement.megapixelsPerSecond),
      ),
    };
  });
}

function humanBytes(bytes: number): string {
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index++;
  }
  return `${fixed(value, index === 0 ? 0 : 2)} ${units[index]}`;
}

function displayNumber(value: number | null, digits = 2): string {
  return value === null ? "—" : fixed(value, digits);
}

function markdownReport(report: BenchmarkReport): string {
  const lines = [
    "# Fourier TSX 渲染基准报告",
    "",
    `- 开始时间：${report.startedAt}`,
    `- 完成时间：${report.finishedAt}`,
    `- CPU：${report.system.cpu}（${report.system.logicalCpus} logical CPUs）`,
    `- 内存：${humanBytes(report.system.totalMemoryBytes)}`,
    `- Bun：${report.system.bunVersion}`,
    `- FFmpeg：${report.system.ffmpegVersion}`,
    `- 参数：${report.config.frames} 帧 @ ${report.config.fps} fps，` +
      `${report.config.iterations} 次计时，preset=${report.config.preset}，` +
      `CRF=${report.config.crf}，frameConcurrency=${report.config.frameConcurrency}`,
    `- 随机种子：${report.config.seed}`,
    "",
    "## 汇总",
    "",
    "| 分辨率 | 成功/失败 | 平均耗时 | 中位耗时 | 渲染 FPS | 实时倍率 | MP/s |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...report.summaries.map(
      (summary) =>
        `| ${summary.resolution} (${summary.width}×${summary.height}) | ` +
        `${summary.successfulRuns}/${summary.failedRuns} | ` +
        `${displayNumber(summary.averageElapsedMs)} ms | ` +
        `${displayNumber(summary.medianElapsedMs)} ms | ` +
        `${displayNumber(summary.averageRenderFps)} | ` +
        `${displayNumber(summary.averageRealtimeFactor)}× | ` +
        `${displayNumber(summary.averageMegapixelsPerSecond)} |`,
    ),
    "",
    "## 明细",
    "",
    "| 分辨率 | 轮次 | 状态 | 总耗时 | 校验 | 预生成 | 编码 | 输出 |",
    "| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |",
    ...report.measurements.map((measurement) => {
      if (measurement.status === "failed") {
        return `| ${measurement.resolution} | ${measurement.iteration} | failed | — | — | — | — | — |`;
      }
      return (
        `| ${measurement.resolution} | ${measurement.iteration} | ok | ` +
        `${fixed(measurement.wallElapsedMs)} ms | ` +
        `${displayNumber(measurement.validationMs)} ms | ` +
        `${displayNumber(measurement.preparationMs)} ms | ` +
        `${displayNumber(measurement.encodingMs)} ms | ` +
        `${humanBytes(measurement.outputBytes)} |`
      );
    }),
    "",
    "完整路径、随机种子和失败详情见 `report.json`。",
    "",
  ];
  return lines.join("\n");
}

export function formatBenchmarkReport(report: BenchmarkReport): string {
  const rows = report.summaries.map((summary) => ({
    resolution: `${summary.resolution} ${summary.width}×${summary.height}`,
    runs: `${summary.successfulRuns} ok / ${summary.failedRuns} failed`,
    elapsed: `${displayNumber(summary.averageElapsedMs)} ms`,
    fps: displayNumber(summary.averageRenderFps),
    realtime: `${displayNumber(summary.averageRealtimeFactor)}x`,
    throughput: `${displayNumber(summary.averageMegapixelsPerSecond)} MP/s`,
  }));
  const widths = {
    resolution: Math.max(18, ...rows.map((row) => row.resolution.length)),
    runs: Math.max(13, ...rows.map((row) => row.runs.length)),
    elapsed: Math.max(12, ...rows.map((row) => row.elapsed.length)),
    fps: Math.max(10, ...rows.map((row) => row.fps.length)),
    realtime: Math.max(10, ...rows.map((row) => row.realtime.length)),
    throughput: Math.max(14, ...rows.map((row) => row.throughput.length)),
  };
  const row = (values: typeof rows[number]): string =>
    [
      values.resolution.padEnd(widths.resolution),
      values.runs.padEnd(widths.runs),
      values.elapsed.padStart(widths.elapsed),
      values.fps.padStart(widths.fps),
      values.realtime.padStart(widths.realtime),
      values.throughput.padStart(widths.throughput),
    ].join("  ");
  return [
    "",
    "Fourier TSX 渲染基准报告",
    `CPU: ${report.system.cpu} | Bun ${report.system.bunVersion}`,
    `参数: ${report.config.frames} frames @ ${report.config.fps} fps | ` +
      `preset=${report.config.preset} | seed=${report.config.seed}`,
    "",
    row({
      resolution: "分辨率",
      runs: "运行结果",
      elapsed: "平均耗时",
      fps: "渲染 FPS",
      realtime: "实时倍率",
      throughput: "像素吞吐",
    }),
    "-".repeat(
      Object.values(widths).reduce((sum, width) => sum + width, 0) + 10,
    ),
    ...rows.map(row),
    "",
    `JSON: ${join(report.config.outputDirectory, "report.json")}`,
    `Markdown: ${join(report.config.outputDirectory, "report.md")}`,
  ].join("\n");
}

function errorPayload(error: unknown): unknown {
  try {
    return toErrorResponse(error);
  } catch {
    return {
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function runBenchmark(
  input: BenchmarkOptions,
  onProgress?: (progress: BenchmarkProgress) => void,
): Promise<BenchmarkRunResult> {
  const options = createBenchmarkOptions(input);
  const emit = (
    phase: BenchmarkPhase,
    progress: number,
    message?: string,
  ): void => {
    onProgress?.({
      phase,
      progress: Math.max(0, Math.min(1, progress)),
      ...(message === undefined ? {} : { message }),
    });
  };
  await ensureEmptyOutputDirectory(options.outputDirectory);
  const startedAt = new Date().toISOString();
  const prepared: PreparedBenchmarkProject[] = [];
  const preparationTotal = options.resolutions.length * options.iterations;

  for (const resolutionName of options.resolutions) {
    const resolution = RESOLUTIONS[resolutionName];
    for (let iteration = 1; iteration <= options.iterations; iteration++) {
      const caseSeed =
        (options.seed +
          options.resolutions.indexOf(resolutionName) * 0x9e3779b1 +
          (iteration - 1) * 0x85ebca6b) >>>
        0;
      const caseDirectory = join(
        options.outputDirectory,
        resolutionName,
        `iteration-${String(iteration).padStart(2, "0")}`,
      );
      prepared.push(
        await prepareBenchmarkProject({
          directory: caseDirectory,
          resolution,
          frames: options.frames,
          fps: options.fps,
          seed: caseSeed,
          iteration,
        }),
      );
      emit(
        "preparing",
        prepared.length / preparationTotal,
        `已生成 ${resolutionName} iteration ${iteration}`,
      );
    }
  }

  let validated = 0;
  for (const project of prepared) {
    await validateProject(project.projectPath, {
      validateMedia: options.validateMedia,
    });
    validated++;
    emit(
      "validating",
      validated / prepared.length,
      `已校验 ${project.resolution.name} iteration ${project.iteration}`,
    );
  }

  const warmupTotal = options.resolutions.length * options.warmup;
  let completedWarmups = 0;
  for (const resolutionName of options.resolutions) {
    const warmupProject = prepared.find(
      (project) => project.resolution.name === resolutionName,
    );
    if (warmupProject === undefined) continue;
    for (let warmup = 1; warmup <= options.warmup; warmup++) {
      const output = join(
        dirname(warmupProject.outputPath),
        `warmup-${warmup}.mp4`,
      );
      await renderOnce(
        warmupProject,
        options,
        output,
        (progress) => {
          emit(
            "warming-up",
            (completedWarmups + progress.progress) / warmupTotal,
            `${resolutionName} warmup ${warmup}/${options.warmup}: ${progress.phase}`,
          );
        },
      );
      await rm(output, { force: true });
      completedWarmups++;
    }
  }

  const measurements: BenchmarkMeasurement[] = [];
  let completedMeasurements = 0;
  for (const project of prepared) {
    const label =
      `${project.resolution.name} iteration ${project.iteration}`;
    try {
      measurements.push(
        await renderOnce(
          project,
          options,
          project.outputPath,
          (progress) => {
            emit(
              "measuring",
              (completedMeasurements + progress.progress) / prepared.length,
              `${label}: ${progress.phase}`,
            );
          },
        ),
      );
    } catch (error) {
      measurements.push({
        status: "failed",
        resolution: project.resolution.name,
        width: project.resolution.width,
        height: project.resolution.height,
        iteration: project.iteration,
        seed: project.seed,
        projectPath: project.projectPath,
        outputPath: project.outputPath,
        error: errorPayload(error),
      });
    }
    completedMeasurements++;
    emit(
      "measuring",
      completedMeasurements / prepared.length,
      `${label}: ${measurements.at(-1)?.status ?? "failed"}`,
    );
  }

  const cpu = cpus()[0]?.model ?? "unknown";
  const report: BenchmarkReport = {
    schemaVersion: 1,
    startedAt,
    finishedAt: new Date().toISOString(),
    system: {
      platform: platform(),
      release: release(),
      arch: arch(),
      cpu,
      logicalCpus: cpus().length,
      availableParallelism: availableParallelism(),
      totalMemoryBytes: totalmem(),
      bunVersion: Bun.version,
      ffmpegVersion: await ffmpegVersion(),
    },
    config: {
      resolutions: options.resolutions,
      frames: options.frames,
      fps: options.fps,
      iterations: options.iterations,
      warmup: options.warmup,
      seed: options.seed,
      preset: options.preset,
      crf: options.crf,
      frameConcurrency: options.frameConcurrency,
      validateMedia: options.validateMedia,
      outputDirectory: options.outputDirectory,
    },
    measurements,
    summaries: summarize(measurements, options.resolutions),
  };
  const reportPath = join(options.outputDirectory, "report.json");
  const markdownPath = join(options.outputDirectory, "report.md");
  emit("writing-report", 0, "正在写入 benchmark 报告");
  await Promise.all([
    Bun.write(reportPath, `${JSON.stringify(report, null, 2)}\n`),
    Bun.write(markdownPath, markdownReport(report)),
  ]);
  emit("writing-report", 1, "benchmark 报告已写入");
  emit("completed", 1, "benchmark 完成");
  return { report, reportPath, markdownPath };
}
