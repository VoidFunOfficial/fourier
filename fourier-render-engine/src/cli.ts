#!/usr/bin/env bun

import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  createBenchmarkOptions,
  formatBenchmarkReport,
  parseBenchmarkResolutions,
  runBenchmark,
} from "../benchmark/benchmark.ts";
import type {
  BenchmarkOptions,
  BenchmarkProgress,
} from "../benchmark/benchmark.ts";
import { RenderEngineError } from "./errors.ts";
import { checkArtifact } from "./artifact-check.ts";
import { loadProject } from "./project-compiler.ts";
import { renderProjectPreview } from "./preview.ts";
import { summarizeProject } from "./project-summary.ts";
import { renderProject, validateProject } from "./renderer.ts";
import type {
  PreviewOptions,
  RenderDiagnostic,
  RenderOptions,
  RenderProgress,
  TtsOptions,
} from "./types.ts";

const COMMANDS = [
  "check",
  "render",
  "preview",
  "benchmark",
  "validate",
  "inspect",
  "tts",
] as const;

export type CommandName = (typeof COMMANDS)[number];

export interface CliIo {
  stdout(value: string): void;
  stderr(value: string): void;
}

export interface CliRuntime {
  runBenchmark: typeof runBenchmark;
  checkArtifact?: typeof checkArtifact;
}

interface HelpInvocation {
  kind: "help";
  ai: boolean;
  target?: CommandName;
}

interface VersionInvocation {
  kind: "version";
  ai: boolean;
}

interface ProjectInvocationBase {
  ai: boolean;
  project: string;
}

interface RenderInvocation extends ProjectInvocationBase {
  kind: "render";
  verbose: boolean;
  options: Omit<RenderOptions, "onProgress" | "onDiagnostic">;
}

interface PreviewInvocation extends ProjectInvocationBase {
  kind: "preview";
  options: PreviewOptions;
}

interface ValidateInvocation extends ProjectInvocationBase {
  kind: "validate";
  options: {
    ffmpegPath?: string;
    ffprobePath?: string;
    validateMedia: boolean;
    tts?: TtsOptions;
  };
}

interface InspectInvocation extends ProjectInvocationBase {
  kind: "inspect";
  options: { tts?: TtsOptions };
}

interface BenchmarkInvocation {
  kind: "benchmark";
  ai: boolean;
  options: BenchmarkOptions;
}

interface CheckInvocation {
  kind: "check";
  ai: boolean;
  entryPath: string;
}

interface TtsInvocation {
  kind: "tts";
  ai: boolean;
  action: "bind" | "show" | "unbind";
  baseUrl?: string;
}

export type CliInvocation =
  | HelpInvocation
  | VersionInvocation
  | RenderInvocation
  | PreviewInvocation
  | ValidateInvocation
  | InspectInvocation
  | BenchmarkInvocation
  | CheckInvocation
  | TtsInvocation;

interface CliFailure {
  code: string;
  message: string;
  exitCode: 1 | 2;
  details?: Record<string, unknown>;
  hint?: string;
}

class CliUsageError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;
  readonly hint?: string;

  constructor(
    code: string,
    message: string,
    options: {
      details?: Record<string, unknown>;
      hint?: string;
    } = {},
  ) {
    super(message);
    this.name = "CliUsageError";
    this.code = code;
    if (options.details !== undefined) this.details = options.details;
    if (options.hint !== undefined) this.hint = options.hint;
  }
}

class BenchmarkFailedError extends Error {
  readonly details: Record<string, unknown>;

  constructor(details: Record<string, unknown>) {
    super("一个或多个 benchmark 测量失败，报告已保存");
    this.name = "BenchmarkFailedError";
    this.details = details;
  }
}

const ROOT_HELP = `Fourier TSX Render Engine

用法:
  fourier <command> [选项]

命令:
  check       检查 SDK artifact ABI 与固定 Chromium
  render      渲染 TSX 工程为视频
  preview     生成静态设计预览 PNG
  benchmark   运行可复现的渲染性能测试
  validate    校验 TSX 工程、素材和时间线
  inspect     输出求解后的工程 IR
  tts         绑定独立的 TTS HTTP 服务

全局选项:
  --ai         输出 schemaVersion=1 的 JSONL 事件流
  -h, --help   显示帮助
  -V, --version 显示版本

运行 fourier <command> --help 查看子命令参数。`;

const COMMAND_HELP: Record<CommandName, string> = {
  check: `用法:
  fourier check <artifact.tsx> [选项]

选项:
  --ai                     输出 JSONL 事件流`,
  render: `用法:
  fourier render <main.tsx> -o <output.mp4> [选项]

选项:
  -o, --output <path>       输出文件（.mp4/.mov/.mkv）
  --overwrite              覆盖已有输出
  --crf <number>           H.264 CRF，0—51，默认 18
  --preset <name>          x264 preset，默认 medium
  --frame-concurrency <n>  React 帧并发数
  --dom-pages <n>          DOM Timeline page 数（Linux headless 固定为 1）
  --verbose                输出 Scene、节点、缓存和 FFmpeg 的详细追踪
  --no-media-validation    跳过 ffprobe 时长校验
  --keep-temp              保留临时帧
  --ffmpeg <path>          FFmpeg 可执行文件
  --ffprobe <path>         ffprobe 可执行文件
  --tts-url <url>          TTS HTTP 地址
  --tts-port <port>        本机 TTS HTTP 端口（默认主机 127.0.0.1）
  --tts-model <path>       TTS 模型目录
  --tts-cache <path>       TTS 音频缓存目录
  --tts-timeout-ms <n>     TTS HTTP 超时，默认 1800000
  --ai                     输出 JSONL 事件流`,
  preview: `用法:
  fourier preview <main.tsx> -o <output.png> --anchor <time> --range-start <time> --range-end <time> [选项]

选项:
  -o, --output <path>       输出 PNG 文件
  --anchor <time>           真实画面基准时间（ms/s/f）
  --range-start <time>      动画说明范围开始（包含）
  --range-end <time>        动画说明范围结束（不包含）
  --overwrite              覆盖已有输出
  --frame-concurrency <n>  React/Motion 生成并发数
  --dom-pages <n>          DOM Timeline page 数（Linux headless 固定为 1）
  --no-media-validation    跳过 ffprobe 时长校验
  --keep-temp              保留临时帧
  --ffmpeg <path>          FFmpeg 可执行文件
  --ffprobe <path>         ffprobe 可执行文件
  --tts-url/--tts-port/--tts-model/--tts-cache/--tts-timeout-ms 与 render 相同
  --ai                     输出 JSONL 事件流`,
  benchmark: `用法:
  fourier benchmark [选项]

选项:
  --resolutions <list>      1080p,4k,8k 的逗号分隔列表（默认全部）
  --frames <n>              每个视频的总帧数，至少 12（默认 30）
  --fps <n>                 画布帧率（默认 30）
  --iterations <n>          每个分辨率的计时次数（默认 1）
  --warmup <n>              每个分辨率的预热次数（默认 0）
  --seed <n>                32 位无符号随机种子（默认当前时间）
  --output-dir <path>       结果目录
  --preset <name>           x264 preset（默认 ultrafast）
  --crf <n>                 H.264 CRF，0—51（默认 23）
  --frame-concurrency <n>   React/Motion 帧并发数
  --no-media-validation     跳过 ffprobe 素材时长校验
  --ai                      输出 JSONL 事件流`,
  validate: `用法:
  fourier validate <main.tsx> [选项]

选项:
  --no-media-validation    跳过 ffprobe 素材时长校验
  --ffmpeg <path>          FFmpeg 可执行文件
  --ffprobe <path>         ffprobe 可执行文件
  --tts-url/--tts-port/--tts-model/--tts-cache/--tts-timeout-ms 与 render 相同
  --ai                     输出 JSONL 事件流`,
  inspect: `用法:
  fourier inspect <main.tsx> [选项]

选项:
  --tts-url/--tts-port/--tts-model/--tts-cache/--tts-timeout-ms 与 render 相同
  --ai                     输出 JSONL 事件流`,
  tts: `用法:
  fourier tts bind <url>
  fourier tts bind --port <port>
  fourier tts show
  fourier tts unbind

说明:
  bind      持久绑定独立的 TTS HTTP 服务
  show      显示当前绑定
  unbind    删除当前绑定

选项:
  --port <port>            绑定 http://127.0.0.1:<port>
  --ai                     输出 JSONL 事件流`,
};

const HELP_OPTION = {
  help: { type: "boolean", short: "h" },
} as const;

const TTS_OPTIONS = {
  "tts-url": { type: "string" },
  "tts-port": { type: "string" },
  "tts-model": { type: "string" },
  "tts-cache": { type: "string" },
  "tts-timeout-ms": { type: "string" },
} as const;

const MEDIA_OPTIONS = {
  ffmpeg: { type: "string" },
  ffprobe: { type: "string" },
  "no-media-validation": { type: "boolean" },
} as const;

function usageError(
  message: string,
  command?: CommandName,
  details?: Record<string, unknown>,
): CliUsageError {
  return new CliUsageError("CLI_INVALID_ARGUMENT", message, {
    ...(details === undefined ? {} : { details }),
    hint: command === undefined
      ? "运行 fourier --help 查看可用命令"
      : `运行 fourier ${command} --help 查看参数`,
  });
}

function parseCommandArgs(
  command: CommandName,
  args: string[],
  options: Record<string, { type: "boolean" | "string"; short?: string }>,
): {
  values: Record<string, string | boolean | undefined>;
  positionals: string[];
} {
  try {
    return parseArgs({
      args,
      options,
      allowPositionals: true,
      strict: true,
    }) as unknown as {
      values: Record<string, string | boolean | undefined>;
      positionals: string[];
    };
  } catch (error) {
    throw usageError(
      error instanceof Error ? error.message : String(error),
      command,
    );
  }
}

function oneProject(
  command: CommandName,
  positionals: string[],
): string {
  if (positionals.length === 0) {
    throw usageError(`${command} 缺少 main.tsx 路径`, command);
  }
  if (positionals.length > 1) {
    throw usageError(`${command} 只接受一个 main.tsx 路径`, command, {
      positionals,
    });
  }
  const source = positionals[0];
  if (source === undefined) throw usageError(`${command} 缺少 main.tsx 路径`);
  return resolve(source);
}

function numberValue(
  source: string | undefined,
  flag: string,
  command: CommandName,
  options: {
    integer?: boolean;
    minimum?: number;
    maximum?: number;
  } = {},
): number | undefined {
  if (source === undefined) return undefined;
  const value = Number(source);
  if (
    !Number.isFinite(value) ||
    (options.integer === true && !Number.isInteger(value)) ||
    (options.minimum !== undefined && value < options.minimum) ||
    (options.maximum !== undefined && value > options.maximum)
  ) {
    throw usageError(`${flag} 参数非法: ${source}`, command, {
      flag,
      value: source,
    });
  }
  return value;
}

function ttsOptions(
  values: Record<string, boolean | string | undefined>,
  command: CommandName,
): TtsOptions | undefined {
  const baseUrlSource = values["tts-url"] as string | undefined;
  const port = numberValue(
    values["tts-port"] as string | undefined,
    "--tts-port",
    command,
    { integer: true, minimum: 1, maximum: 65_535 },
  );
  if (baseUrlSource !== undefined && port !== undefined) {
    throw usageError("--tts-url 与 --tts-port 不能同时使用", command);
  }
  const baseUrl = port === undefined
    ? baseUrlSource ?? process.env.TTS_HTTP_URL ?? readBoundTtsUrl()
    : `http://127.0.0.1:${port}`;
  const modelSource = values["tts-model"] as string | undefined;
  const cacheSource = values["tts-cache"] as string | undefined;
  const requestTimeoutMs = numberValue(
    values["tts-timeout-ms"] as string | undefined,
    "--tts-timeout-ms",
    command,
    { integer: true, minimum: 1 },
  );
  if (
    baseUrl === undefined &&
    modelSource === undefined &&
    cacheSource === undefined &&
    requestTimeoutMs === undefined
  ) {
    return undefined;
  }
  return {
    ...(baseUrl === undefined ? {} : { baseUrl }),
    ...(modelSource === undefined ? {} : { modelPath: resolve(modelSource) }),
    ...(cacheSource === undefined
      ? {}
      : { cacheDirectory: resolve(cacheSource) }),
    ...(requestTimeoutMs === undefined ? {} : { requestTimeoutMs }),
  };
}

interface FourierUserConfig {
  version: 1;
  tts?: { baseUrl: string };
}

function userConfigPath(): string {
  return process.env.FOURIER_CONFIG_PATH ??
    join(homedir(), ".config", "fourier", "config.json");
}

function normalizeTtsUrl(source: string, command: CommandName = "tts"): string {
  const candidate = /^\d+$/.test(source)
    ? `http://127.0.0.1:${source}`
    : source;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new TypeError("只支持 http 或 https");
    }
    if (url.username !== "" || url.password !== "") {
      throw new TypeError("URL 不能包含用户名或密码");
    }
    url.pathname = url.pathname.replace(/\/+$/, "");
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch (error) {
    throw usageError(
      `TTS HTTP URL 非法: ${error instanceof Error ? error.message : String(error)}`,
      command,
      { url: source },
    );
  }
}

function readUserConfig(): FourierUserConfig {
  try {
    const parsed = JSON.parse(readFileSync(userConfigPath(), "utf8")) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return { version: 1 };
    }
    const config = parsed as Partial<FourierUserConfig>;
    const baseUrl = config.tts?.baseUrl;
    return {
      version: 1,
      ...(typeof baseUrl === "string"
        ? { tts: { baseUrl: normalizeTtsUrl(baseUrl) } }
        : {}),
    };
  } catch {
    return { version: 1 };
  }
}

function readBoundTtsUrl(): string | undefined {
  return readUserConfig().tts?.baseUrl;
}

async function writeUserConfig(config: FourierUserConfig): Promise<void> {
  const path = userConfigPath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function helpRequested(values: Record<string, unknown>): boolean {
  return values.help === true;
}

function parseRender(args: string[], ai: boolean): CliInvocation {
  const parsed = parseCommandArgs("render", args, {
    ...HELP_OPTION,
    output: { type: "string", short: "o" },
    overwrite: { type: "boolean" },
    crf: { type: "string" },
    preset: { type: "string" },
    "frame-concurrency": { type: "string" },
    "dom-pages": { type: "string" },
    verbose: { type: "boolean" },
    "keep-temp": { type: "boolean" },
    ...MEDIA_OPTIONS,
    ...TTS_OPTIONS,
  });
  if (helpRequested(parsed.values)) return { kind: "help", ai, target: "render" };
  const project = oneProject("render", parsed.positionals);
  const outputSource = parsed.values.output;
  if (typeof outputSource !== "string") {
    throw usageError("render 必须通过 -o/--output 指定输出文件", "render");
  }
  const crf = numberValue(parsed.values.crf as string | undefined, "--crf", "render", {
    minimum: 0,
    maximum: 51,
  });
  const frameConcurrency = numberValue(
    parsed.values["frame-concurrency"] as string | undefined,
    "--frame-concurrency",
    "render",
    { integer: true, minimum: 1 },
  );
  const domPages = numberValue(
    parsed.values["dom-pages"] as string | undefined,
    "--dom-pages",
    "render",
    { integer: true, minimum: 1 },
  );
  const tts = ttsOptions(parsed.values, "render");
  return {
    kind: "render",
    ai,
    verbose: parsed.values.verbose === true,
    project,
    options: {
      output: resolve(outputSource),
      overwrite: parsed.values.overwrite === true,
      validateMedia: parsed.values["no-media-validation"] !== true,
      keepTemporaryFiles: parsed.values["keep-temp"] === true,
      ...(parsed.values.ffmpeg === undefined
        ? {}
        : { ffmpegPath: parsed.values.ffmpeg as string }),
      ...(parsed.values.ffprobe === undefined
        ? {}
        : { ffprobePath: parsed.values.ffprobe as string }),
      ...(crf === undefined ? {} : { crf }),
      ...(parsed.values.preset === undefined
        ? {}
        : { preset: parsed.values.preset as string }),
      ...(frameConcurrency === undefined ? {} : { frameConcurrency }),
      ...(domPages === undefined ? {} : { domPages }),
      ...(tts === undefined ? {} : { tts }),
    },
  };
}

function parsePreview(args: string[], ai: boolean): CliInvocation {
  const parsed = parseCommandArgs("preview", args, {
    ...HELP_OPTION,
    output: { type: "string", short: "o" },
    anchor: { type: "string" },
    "range-start": { type: "string" },
    "range-end": { type: "string" },
    overwrite: { type: "boolean" },
    "frame-concurrency": { type: "string" },
    "dom-pages": { type: "string" },
    "keep-temp": { type: "boolean" },
    ...MEDIA_OPTIONS,
    ...TTS_OPTIONS,
  });
  if (helpRequested(parsed.values)) return { kind: "help", ai, target: "preview" };
  const project = oneProject("preview", parsed.positionals);
  const outputSource = parsed.values.output;
  if (typeof outputSource !== "string") {
    throw usageError("preview 必须通过 -o/--output 指定输出 PNG", "preview");
  }
  const anchor = parsed.values.anchor;
  const rangeStart = parsed.values["range-start"];
  const rangeEnd = parsed.values["range-end"];
  if (
    typeof anchor !== "string" ||
    typeof rangeStart !== "string" ||
    typeof rangeEnd !== "string"
  ) {
    throw usageError(
      "preview 必须同时指定 --anchor、--range-start 和 --range-end",
      "preview",
    );
  }
  const frameConcurrency = numberValue(
    parsed.values["frame-concurrency"] as string | undefined,
    "--frame-concurrency",
    "preview",
    { integer: true, minimum: 1 },
  );
  const domPages = numberValue(
    parsed.values["dom-pages"] as string | undefined,
    "--dom-pages",
    "preview",
    { integer: true, minimum: 1 },
  );
  const tts = ttsOptions(parsed.values, "preview");
  return {
    kind: "preview",
    ai,
    project,
    options: {
      output: resolve(outputSource),
      anchor,
      rangeStart,
      rangeEnd,
      overwrite: parsed.values.overwrite === true,
      validateMedia: parsed.values["no-media-validation"] !== true,
      keepTemporaryFiles: parsed.values["keep-temp"] === true,
      ...(parsed.values.ffmpeg === undefined
        ? {}
        : { ffmpegPath: parsed.values.ffmpeg as string }),
      ...(parsed.values.ffprobe === undefined
        ? {}
        : { ffprobePath: parsed.values.ffprobe as string }),
      ...(frameConcurrency === undefined ? {} : { frameConcurrency }),
      ...(domPages === undefined ? {} : { domPages }),
      ...(tts === undefined ? {} : { tts }),
    },
  };
}

function parseValidate(args: string[], ai: boolean): CliInvocation {
  const parsed = parseCommandArgs("validate", args, {
    ...HELP_OPTION,
    ...MEDIA_OPTIONS,
    ...TTS_OPTIONS,
  });
  if (helpRequested(parsed.values)) return { kind: "help", ai, target: "validate" };
  const project = oneProject("validate", parsed.positionals);
  const tts = ttsOptions(parsed.values, "validate");
  return {
    kind: "validate",
    ai,
    project,
    options: {
      validateMedia: parsed.values["no-media-validation"] !== true,
      ...(parsed.values.ffmpeg === undefined
        ? {}
        : { ffmpegPath: parsed.values.ffmpeg as string }),
      ...(parsed.values.ffprobe === undefined
        ? {}
        : { ffprobePath: parsed.values.ffprobe as string }),
      ...(tts === undefined ? {} : { tts }),
    },
  };
}

function parseInspect(args: string[], ai: boolean): CliInvocation {
  const parsed = parseCommandArgs("inspect", args, {
    ...HELP_OPTION,
    ...TTS_OPTIONS,
  });
  if (helpRequested(parsed.values)) return { kind: "help", ai, target: "inspect" };
  const project = oneProject("inspect", parsed.positionals);
  const tts = ttsOptions(parsed.values, "inspect");
  return {
    kind: "inspect",
    ai,
    project,
    options: { ...(tts === undefined ? {} : { tts }) },
  };
}

function parseBenchmark(args: string[], ai: boolean): CliInvocation {
  const parsed = parseCommandArgs("benchmark", args, {
    ...HELP_OPTION,
    resolutions: { type: "string" },
    frames: { type: "string" },
    fps: { type: "string" },
    iterations: { type: "string" },
    warmup: { type: "string" },
    seed: { type: "string" },
    "output-dir": { type: "string" },
    preset: { type: "string" },
    crf: { type: "string" },
    "frame-concurrency": { type: "string" },
    "no-media-validation": { type: "boolean" },
  });
  if (helpRequested(parsed.values)) {
    return { kind: "help", ai, target: "benchmark" };
  }
  if (parsed.positionals.length > 0) {
    throw usageError("benchmark 不接受位置参数", "benchmark", {
      positionals: parsed.positionals,
    });
  }
  const numberOption = (
    key: string,
    flag: string,
    minimum: number,
    maximum?: number,
  ): number | undefined =>
    numberValue(parsed.values[key] as string | undefined, flag, "benchmark", {
      integer: true,
      minimum,
      ...(maximum === undefined ? {} : { maximum }),
    });
  let resolutions: ReturnType<typeof parseBenchmarkResolutions> | undefined;
  try {
    resolutions = parsed.values.resolutions === undefined
      ? undefined
      : parseBenchmarkResolutions(parsed.values.resolutions as string);
  } catch (error) {
    throw usageError(
      error instanceof Error ? error.message : String(error),
      "benchmark",
    );
  }
  const frames = numberOption("frames", "--frames", 12);
  const fps = numberOption("fps", "--fps", 1);
  const iterations = numberOption("iterations", "--iterations", 1);
  const warmup = numberOption("warmup", "--warmup", 0);
  const seed = numberOption("seed", "--seed", 0, 0xffffffff);
  const crf = numberOption("crf", "--crf", 0, 51);
  const frameConcurrency = numberOption(
    "frame-concurrency",
    "--frame-concurrency",
    1,
  );
  return {
    kind: "benchmark",
    ai,
    options: createBenchmarkOptions({
      ...(resolutions === undefined ? {} : { resolutions }),
      ...(frames === undefined ? {} : { frames }),
      ...(fps === undefined ? {} : { fps }),
      ...(iterations === undefined ? {} : { iterations }),
      ...(warmup === undefined ? {} : { warmup }),
      ...(seed === undefined ? {} : { seed }),
      ...(parsed.values["output-dir"] === undefined
        ? {}
        : { outputDirectory: parsed.values["output-dir"] as string }),
      ...(parsed.values.preset === undefined
        ? {}
        : { preset: parsed.values.preset as string }),
      ...(crf === undefined ? {} : { crf }),
      ...(frameConcurrency === undefined ? {} : { frameConcurrency }),
      validateMedia: parsed.values["no-media-validation"] !== true,
    }),
  };
}

function parseCheck(args: string[], ai: boolean): CliInvocation {
  const parsed = parseCommandArgs("check", args, HELP_OPTION);
  if (helpRequested(parsed.values)) return { kind: "help", ai, target: "check" };
  if (parsed.positionals.length !== 1 || parsed.positionals[0] === undefined) {
    throw usageError("check 必须接受一个 SDK artifact entry 路径", "check", {
      positionals: parsed.positionals,
    });
  }
  return { kind: "check", ai, entryPath: resolve(parsed.positionals[0]) };
}

function parseTts(args: string[], ai: boolean): CliInvocation {
  const parsed = parseCommandArgs("tts", args, {
    ...HELP_OPTION,
    port: { type: "string" },
  });
  if (helpRequested(parsed.values)) return { kind: "help", ai, target: "tts" };
  const [action, source, ...extra] = parsed.positionals;
  if (action !== "bind" && action !== "show" && action !== "unbind") {
    throw usageError("tts 必须指定 bind、show 或 unbind", "tts");
  }
  const port = numberValue(
    parsed.values.port as string | undefined,
    "--port",
    "tts",
    { integer: true, minimum: 1, maximum: 65_535 },
  );
  if (action === "bind") {
    if (extra.length > 0 || (source !== undefined && port !== undefined)) {
      throw usageError("tts bind 只能接受一个 URL 或一个 --port", "tts");
    }
    if (source === undefined && port === undefined) {
      throw usageError("tts bind 缺少 HTTP URL 或 --port", "tts");
    }
    return {
      kind: "tts",
      ai,
      action,
      baseUrl: normalizeTtsUrl(
        source ?? `http://127.0.0.1:${port}`,
      ),
    };
  }
  if (source !== undefined || extra.length > 0 || port !== undefined) {
    throw usageError(`tts ${action} 不接受额外参数`, "tts");
  }
  return { kind: "tts", ai, action };
}

export function parseCli(argv: string[]): CliInvocation {
  if (argv.some((arg) => arg.startsWith("--ai="))) {
    throw usageError("--ai 是布尔开关，不接受参数值");
  }
  const ai = argv.includes("--ai");
  const args = argv.filter((arg) => arg !== "--ai");
  const [command, ...commandArgs] = args;
  if (
    command === undefined ||
    command === "help" ||
    command === "--help" ||
    command === "-h"
  ) {
    if (commandArgs.length > 0) {
      throw usageError("全局帮助不接受额外参数");
    }
    return { kind: "help", ai };
  }
  if (command === "version" || command === "--version" || command === "-V") {
    if (commandArgs.length > 0) {
      throw usageError("版本命令不接受额外参数");
    }
    return { kind: "version", ai };
  }
  if (!COMMANDS.includes(command as CommandName)) {
    throw new CliUsageError("CLI_UNKNOWN_COMMAND", `未知命令 "${command}"`, {
      details: { command },
      hint: "运行 fourier --help 查看可用命令",
    });
  }
  switch (command as CommandName) {
    case "check":
      return parseCheck(commandArgs, ai);
    case "render":
      return parseRender(commandArgs, ai);
    case "preview":
      return parsePreview(commandArgs, ai);
    case "benchmark":
      return parseBenchmark(commandArgs, ai);
    case "validate":
      return parseValidate(commandArgs, ai);
    case "inspect":
      return parseInspect(commandArgs, ai);
    case "tts":
      return parseTts(commandArgs, ai);
  }
}

function jsonLine(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}

function commandForArgv(argv: string[]): string {
  return argv.find((arg) => !arg.startsWith("-")) ?? "cli";
}

function toFailure(error: unknown): CliFailure {
  if (error instanceof CliUsageError) {
    return {
      code: error.code,
      message: error.message,
      exitCode: 2,
      ...(error.details === undefined ? {} : { details: error.details }),
      ...(error.hint === undefined ? {} : { hint: error.hint }),
    };
  }
  if (error instanceof RenderEngineError) {
    return {
      code: error.code,
      message: error.message,
      exitCode: 2,
      ...(error.details === undefined ? {} : { details: error.details }),
    };
  }
  if (error instanceof BenchmarkFailedError) {
    return {
      code: "BENCHMARK_RUN_FAILED",
      message: error.message,
      exitCode: 1,
      details: error.details,
      hint: "查看 report.json 中失败测量的 error 字段",
    };
  }
  return {
    code: "INTERNAL_ERROR",
    message: error instanceof Error ? error.message : String(error),
    exitCode: 1,
  };
}

function emitFailure(
  ai: boolean,
  command: string,
  failure: CliFailure,
  io: CliIo,
): void {
  if (ai) {
    io.stdout(
      jsonLine({
        schemaVersion: 1,
        type: "error",
        command,
        error: {
          code: failure.code,
          message: failure.message,
          ...(failure.details === undefined
            ? {}
            : { details: failure.details }),
          ...(failure.hint === undefined ? {} : { hint: failure.hint }),
        },
        exitCode: failure.exitCode,
      }),
    );
    return;
  }
  io.stderr(
    `${JSON.stringify(
      {
        error: {
          code: failure.code,
          message: failure.message,
          ...(failure.details === undefined
            ? {}
            : { details: failure.details }),
          ...(failure.hint === undefined ? {} : { hint: failure.hint }),
        },
      },
      null,
      2,
    )}\n`,
  );
}

function createReporter(
  command: CommandName,
  ai: boolean,
  verbose: boolean,
  io: CliIo,
) {
  let lastProgressKey = "";
  const startedAt = performance.now();
  return {
    start(input: Record<string, unknown>): void {
      if (!ai) return;
      io.stdout(
        jsonLine({ schemaVersion: 1, type: "start", command, input }),
      );
    },
    progress(progress: {
      phase: string;
      progress: number;
      frame?: number;
      totalFrames?: number;
      message?: string;
    }): void {
      const normalized = Math.max(0, Math.min(1, progress.progress));
      const bucket = Math.floor(normalized * 100);
      const key = `${progress.phase}:${bucket}:${progress.message ?? ""}`;
      if (key === lastProgressKey) return;
      lastProgressKey = key;
      if (ai) {
        io.stdout(
          jsonLine({
            schemaVersion: 1,
            type: "progress",
            command,
            phase: progress.phase,
            progress: normalized,
            ...(progress.frame === undefined ? {} : { frame: progress.frame }),
            ...(progress.totalFrames === undefined
              ? {}
              : { totalFrames: progress.totalFrames }),
            ...(progress.message === undefined
              ? {}
              : { message: progress.message }),
          }),
        );
      } else {
        const percent = Math.round(normalized * 100);
        io.stderr(
          `[${command}:${progress.phase}] ${percent}%${
            progress.message === undefined ? "" : ` ${progress.message}`
          }\n`,
        );
      }
    },
    diagnostic(diagnostic: RenderDiagnostic): void {
      if (!verbose) return;
      if (ai) {
        io.stdout(
          jsonLine({
            schemaVersion: 1,
            type: "diagnostic",
            command,
            ...diagnostic,
          }),
        );
        return;
      }
      const globalElapsed = ((performance.now() - startedAt) / 1_000).toFixed(3);
      const operationElapsed = diagnostic.elapsedMs === undefined
        ? ""
        : ` elapsed=${(diagnostic.elapsedMs / 1_000).toFixed(3)}s`;
      const details = diagnostic.details === undefined
        ? ""
        : ` ${JSON.stringify(diagnostic.details)}`;
      io.stderr(
        `[${command}:verbose +${globalElapsed}s] [${diagnostic.status}] ` +
          `${diagnostic.scope} ${diagnostic.message}${operationElapsed}${details}\n`,
      );
    },
    result(data: unknown, humanText?: string): void {
      if (ai) {
        io.stdout(
          jsonLine({ schemaVersion: 1, type: "result", command, data }),
        );
      } else {
        io.stdout(`${humanText ?? JSON.stringify(data, null, 2)}\n`);
      }
    },
  };
}

async function packageVersion(): Promise<string> {
  const manifest = await Bun.file(
    new URL("../package.json", import.meta.url),
  ).json() as { version?: unknown };
  return typeof manifest.version === "string" ? manifest.version : "unknown";
}

function helpData(target: CommandName | undefined): Record<string, unknown> {
  if (target !== undefined) {
    return {
      command: target,
      usage: COMMAND_HELP[target].split("\n", 2)[1]?.trim() ?? "",
      help: COMMAND_HELP[target],
    };
  }
  return {
    executable: "fourier",
    commands: [...COMMANDS],
    help: ROOT_HELP,
  };
}

function projectInput(
  invocation:
    | RenderInvocation
    | PreviewInvocation
    | ValidateInvocation
    | InspectInvocation,
): Record<string, unknown> {
  return { project: invocation.project, options: invocation.options };
}

async function executeInvocation(
  invocation: Exclude<CliInvocation, HelpInvocation | VersionInvocation>,
  io: CliIo,
  runtime: CliRuntime,
): Promise<void> {
  const verbose = invocation.kind === "render" && invocation.verbose;
  const reporter = createReporter(invocation.kind, invocation.ai, verbose, io);
  if (invocation.kind === "tts") {
    reporter.start({
      action: invocation.action,
      ...(invocation.baseUrl === undefined ? {} : { baseUrl: invocation.baseUrl }),
    });
    const config = readUserConfig();
    if (invocation.action === "bind") {
      const baseUrl = invocation.baseUrl;
      if (baseUrl === undefined) throw new Error("missing normalized TTS URL");
      await writeUserConfig({ ...config, version: 1, tts: { baseUrl } });
      reporter.result(
        { bound: true, baseUrl, configPath: userConfigPath() },
        `TTS HTTP 服务已绑定: ${baseUrl}`,
      );
      return;
    }
    if (invocation.action === "unbind") {
      await writeUserConfig({ version: 1 });
      reporter.result(
        { bound: false, configPath: userConfigPath() },
        "TTS HTTP 服务绑定已删除",
      );
      return;
    }
    const baseUrl = config.tts?.baseUrl;
    reporter.result(
      { bound: baseUrl !== undefined, baseUrl, configPath: userConfigPath() },
      baseUrl === undefined ? "尚未绑定 TTS HTTP 服务" : baseUrl,
    );
    return;
  }
  if (invocation.kind === "check") {
    reporter.start({ entryPath: invocation.entryPath });
    const result = await (runtime.checkArtifact ?? checkArtifact)(invocation.entryPath);
    reporter.result(result);
    return;
  }
  if (invocation.kind === "render") {
    reporter.start({ ...projectInput(invocation), verbose: invocation.verbose });
    const result = await renderProject(invocation.project, {
      ...invocation.options,
      onProgress(progress: RenderProgress) {
        reporter.progress(progress);
      },
      ...(invocation.verbose
        ? {
            onDiagnostic(diagnostic: RenderDiagnostic) {
              reporter.diagnostic(diagnostic);
            },
          }
        : {}),
    });
    reporter.result(result);
    return;
  }
  if (invocation.kind === "preview") {
    reporter.start(projectInput(invocation));
    if (invocation.ai) {
      reporter.progress({
        phase: "previewing",
        progress: 0,
        message: "正在生成设计预览",
      });
    }
    const result = await renderProjectPreview(
      invocation.project,
      invocation.options,
    );
    if (invocation.ai) {
      reporter.progress({
        phase: "previewing",
        progress: 1,
        message: "设计预览生成完成",
      });
    }
    reporter.result(result);
    return;
  }
  if (invocation.kind === "validate") {
    reporter.start(projectInput(invocation));
    if (invocation.ai) {
      reporter.progress({
        phase: "validating",
        progress: 0,
        message: "正在校验工程",
      });
    }
    const project = await validateProject(invocation.project, invocation.options);
    if (invocation.ai) {
      reporter.progress({
        phase: "validating",
        progress: 1,
        totalFrames: project.totalFrames,
        message: "工程校验通过",
      });
    }
    reporter.result({ valid: true, ir: summarizeProject(project) });
    return;
  }
  if (invocation.kind === "inspect") {
    reporter.start(projectInput(invocation));
    if (invocation.ai) {
      reporter.progress({
        phase: "loading",
        progress: 0,
        message: "正在编译工程",
      });
    }
    const project = await loadProject(invocation.project, invocation.options);
    if (invocation.ai) {
      reporter.progress({
        phase: "loading",
        progress: 1,
        totalFrames: project.totalFrames,
        message: "工程编译完成",
      });
    }
    reporter.result(summarizeProject(project));
    return;
  }

  reporter.start({ options: invocation.options });
  const result = await runtime.runBenchmark(
    invocation.options,
    (progress: BenchmarkProgress) => reporter.progress(progress),
  );
  const failedRuns = result.report.measurements.filter(
    (measurement) => measurement.status === "failed",
  ).length;
  const data = {
    config: result.report.config,
    summaries: result.report.summaries,
    failedRuns,
    reportPath: result.reportPath,
    markdownPath: result.markdownPath,
  };
  if (failedRuns > 0) {
    if (!invocation.ai) io.stdout(`${formatBenchmarkReport(result.report)}\n`);
    throw new BenchmarkFailedError(data);
  }
  reporter.result(data, formatBenchmarkReport(result.report));
}

const PROCESS_IO: CliIo = {
  stdout(value) {
    process.stdout.write(value);
  },
  stderr(value) {
    process.stderr.write(value);
  },
};

const DEFAULT_RUNTIME: CliRuntime = { runBenchmark, checkArtifact };

export async function runCli(
  argv: string[],
  io: CliIo = PROCESS_IO,
  runtime: CliRuntime = DEFAULT_RUNTIME,
): Promise<number> {
  const ai = argv.includes("--ai") || argv.some((arg) => arg.startsWith("--ai="));
  let command = commandForArgv(argv);
  try {
    const invocation = parseCli(argv);
    command = invocation.kind;
    if (invocation.kind === "help") {
      const data = helpData(invocation.target);
      if (invocation.ai) {
        io.stdout(
          jsonLine({
            schemaVersion: 1,
            type: "result",
            command: invocation.target ?? "help",
            data,
          }),
        );
      } else {
        io.stdout(`${invocation.target === undefined ? ROOT_HELP : COMMAND_HELP[invocation.target]}\n`);
      }
      return 0;
    }
    if (invocation.kind === "version") {
      const version = await packageVersion();
      if (invocation.ai) {
        io.stdout(
          jsonLine({
            schemaVersion: 1,
            type: "result",
            command: "version",
            data: { version },
          }),
        );
      } else {
        io.stdout(`fourier ${version}\n`);
      }
      return 0;
    }
    await executeInvocation(invocation, io, runtime);
    return 0;
  } catch (error) {
    const failure = toFailure(error);
    emitFailure(ai, command, failure, io);
    return failure.exitCode;
  }
}

if (import.meta.main) {
  process.exitCode = await runCli(process.argv.slice(2));
}
