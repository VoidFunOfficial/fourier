import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import type { BenchmarkRunResult } from "../benchmark/benchmark.ts";
import {
  parseCli,
  runCli,
  type CliIo,
  type CliRuntime,
} from "../src/cli.ts";

function memoryIo(): {
  io: CliIo;
  stdout: string[];
  stderr: string[];
} {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    io: {
      stdout(value) {
        stdout.push(value);
      },
      stderr(value) {
        stderr.push(value);
      },
    },
  };
}

function jsonLines(chunks: string[]): Array<Record<string, unknown>> {
  return chunks
    .join("")
    .trim()
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

let directory = "";
let projectPath = "";

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "fourier-cli-test-"));
  await mkdir(join(directory, "assets"));
  await Bun.write(join(directory, "assets", "card.png"), new Uint8Array());
  projectPath = join(directory, "main.tsx");
  await Bun.write(
    projectPath,
    `import { Canvas, defineProject, Image, Project, Timeline } from "@fourier-video/sdk/project";
export default defineProject(
  <Project id="cli-test" version="1.0" audioSampleRate={48000}>
    <Canvas width={64} height={36} fps={30} background="#000000" colorSpace="sRGB" />
    <Timeline>
      <Image id="card" at="0f" duration="1f" src="assets/card.png"
        fit="contain" x={32} y={18} width={32} height={18} layer={1} />
    </Timeline>
  </Project>,
);`,
  );
});

afterAll(async () => {
  if (directory !== "") {
    await rm(directory, { recursive: true, force: true });
  }
});

describe("Fourier CLI 参数接口", () => {
  test("路由七个子命令并把输出路径规范化为绝对路径", () => {
    const check = parseCli(["check", "Artifact.tsx"]);
    const render = parseCli(["render", "main.tsx", "-o", "output.mp4"]);
    const preview = parseCli([
      "preview",
      "main.tsx",
      "-o",
      "preview.png",
      "--anchor",
      "0f",
      "--range-start",
      "0f",
      "--range-end",
      "1f",
    ]);
    const benchmark = parseCli(["benchmark", "--frames", "12"]);
    const validate = parseCli(["validate", "main.tsx"]);
    const inspect = parseCli(["inspect", "main.tsx"]);
    const tts = parseCli(["tts", "bind", "http://127.0.0.1:9000"]);

    expect([
      check.kind,
      render.kind,
      preview.kind,
      benchmark.kind,
      validate.kind,
      inspect.kind,
      tts.kind,
    ]).toEqual(["check", "render", "preview", "benchmark", "validate", "inspect", "tts"]);
    if (render.kind !== "render" || preview.kind !== "preview") {
      throw new Error("expected render and preview invocations");
    }
    expect(isAbsolute(render.project)).toBe(true);
    expect(isAbsolute(render.options.output)).toBe(true);
    expect(isAbsolute(preview.options.output)).toBe(true);
    if (check.kind !== "check") throw new Error("expected check invocation");
    expect(isAbsolute(check.entryPath)).toBe(true);
  });

  test("tts 命令接受 HTTP URL 或本机端口", () => {
    expect(parseCli(["tts", "bind", "http://tts.local:9000/"])).toMatchObject({
      kind: "tts",
      action: "bind",
      baseUrl: "http://tts.local:9000",
    });
    expect(parseCli(["tts", "bind", "--port", "9876"])).toMatchObject({
      kind: "tts",
      action: "bind",
      baseUrl: "http://127.0.0.1:9876",
    });
    expect(parseCli(["tts", "show"])).toMatchObject({ kind: "tts", action: "show" });
    expect(parseCli(["tts", "unbind"])).toMatchObject({ kind: "tts", action: "unbind" });
    expect(() => parseCli(["tts", "bind", "ftp://tts.local"])).toThrow("只支持 http");
  });

  test("render/preview 接受显式 DOM page 数", () => {
    const render = parseCli([
      "render", "main.tsx", "-o", "out.mp4", "--dom-pages", "3", "--verbose",
    ]);
    const preview = parseCli([
      "preview", "main.tsx", "-o", "out.png", "--anchor", "0f",
      "--range-start", "0f", "--range-end", "1f", "--dom-pages", "2",
    ]);
    if (render.kind !== "render" || preview.kind !== "preview") throw new Error("unexpected invocation");
    expect(render.options.domPages).toBe(3);
    expect(render.verbose).toBe(true);
    expect(preview.options.domPages).toBe(2);
    const quietRender = parseCli(["render", "main.tsx", "-o", "out.mp4"]);
    if (quietRender.kind !== "render") throw new Error("unexpected invocation");
    expect(quietRender.verbose).toBe(false);
  });

  test("TTS 端口参数映射到本机服务地址", () => {
    const render = parseCli([
      "render", "main.tsx", "-o", "out.mp4", "--tts-port", "9876",
    ]);
    if (render.kind !== "render") throw new Error("unexpected invocation");
    expect(render.options.tts?.baseUrl).toBe("http://127.0.0.1:9876");
    expect(() =>
      parseCli([
        "inspect", "main.tsx", "--tts-port", "9876",
        "--tts-url", "http://localhost:8765",
      ])
    ).toThrow("不能同时使用");
    expect(() =>
      parseCli(["inspect", "main.tsx", "--tts-port", "70000"])
    ).toThrow("参数非法");
  });

  test("--ai 可位于子命令前或后", () => {
    expect(parseCli(["--ai", "inspect", "main.tsx"]).ai).toBe(true);
    expect(parseCli(["inspect", "main.tsx", "--ai"]).ai).toBe(true);
  });

  test("严格拒绝未知参数、缺失参数和多余位置参数", () => {
    expect(() => parseCli(["render", "main.tsx", "--unknown"])).toThrow(
      "Unknown option",
    );
    expect(() => parseCli(["render", "main.tsx"])).toThrow("--output");
    expect(() =>
      parseCli(["inspect", "main.tsx", "other.tsx"])
    ).toThrow("只接受一个");
    expect(() => parseCli(["benchmark", "main.tsx"])).toThrow(
      "不接受位置参数",
    );
  });
});

describe("Fourier CLI AI JSONL", () => {
  test("check 输出 ABI v1 DOM artifact 且无迁移警告", async () => {
    const output = memoryIo();
    const runtime: CliRuntime = {
      runBenchmark: async () => { throw new Error("unexpected benchmark"); },
      checkArtifact: async (entryPath) => ({
        valid: true,
        entryPath,
        sdkAbiVersion: 1.1,
        renderer: "dom-timeline",
        snapshotId: "snapshot-v1",
        warnings: [],
      }),
    };
    expect(await runCli(["--ai", "check", "Artifact.tsx"], output.io, runtime)).toBe(0);
    expect(jsonLines(output.stdout).at(-1)).toMatchObject({
      type: "result",
      command: "check",
      data: {
        valid: true,
        sdkAbiVersion: 1.1,
        warnings: [],
      },
    });
  });

  test("help 和 version 在 AI 模式返回单个 result", async () => {
    for (const args of [["--ai", "--help"], ["--version", "--ai"]]) {
      const output = memoryIo();
      expect(await runCli(args, output.io)).toBe(0);
      expect(output.stderr.join("")).toBe("");
      const events = jsonLines(output.stdout);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ schemaVersion: 1, type: "result" });
    }
  });

  test("inspect 输出 start/progress/result，且 stdout 每行均为纯 JSON", async () => {
    const output = memoryIo();
    expect(await runCli(["--ai", "inspect", projectPath], output.io)).toBe(0);
    const source = output.stdout.join("");
    const events = jsonLines(output.stdout);

    expect(output.stderr.join("")).toBe("");
    expect(source).not.toContain("\r");
    expect(source).not.toMatch(/\u001b\[/);
    expect(events.map((event) => event.type)).toEqual([
      "start",
      "progress",
      "progress",
      "result",
    ]);
    expect(events[0]).toMatchObject({
      schemaVersion: 1,
      command: "inspect",
      input: { project: projectPath },
    });
    expect(events.at(-1)).toMatchObject({
      schemaVersion: 1,
      type: "result",
      command: "inspect",
      data: { project: { id: "cli-test" }, totalFrames: 1 },
    });
  });

  test("validate 成功返回 valid 与 IR", async () => {
    const output = memoryIo();
    const exitCode = await runCli(
      ["validate", projectPath, "--no-media-validation", "--ai"],
      output.io,
    );
    const result = jsonLines(output.stdout).at(-1);
    expect(exitCode).toBe(0);
    expect(output.stderr.join("")).toBe("");
    expect(result).toMatchObject({
      type: "result",
      command: "validate",
      data: { valid: true, ir: { totalFrames: 1 } },
    });
  });

  test("参数错误只向 stdout 输出一个 error 并返回 2", async () => {
    const output = memoryIo();
    const exitCode = await runCli(
      ["--ai", "render", projectPath, "--unknown"],
      output.io,
    );
    const events = jsonLines(output.stdout);
    expect(exitCode).toBe(2);
    expect(output.stderr.join("")).toBe("");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      schemaVersion: 1,
      type: "error",
      command: "render",
      error: { code: "CLI_INVALID_ARGUMENT" },
      exitCode: 2,
    });
  });

  test("benchmark 进度可流式输出，部分失败以终端 error 和退出码 1 表示", async () => {
    const reportPath = join(directory, "benchmark", "report.json");
    const markdownPath = join(directory, "benchmark", "report.md");
    const runtime: CliRuntime = {
      async runBenchmark(options, onProgress) {
        onProgress?.({
          phase: "measuring",
          progress: 0.5,
          message: "1080p iteration 1: encoding",
        });
        return {
          report: {
            config: { ...options, outputDirectory: options.outputDirectory },
            summaries: [],
            measurements: [
              {
                status: "failed",
                resolution: "1080p",
                width: 1920,
                height: 1080,
                iteration: 1,
                seed: options.seed,
                projectPath: join(directory, "main.tsx"),
                outputPath: join(directory, "render.mp4"),
                error: { error: { code: "TEST_FAILURE", message: "failed" } },
              },
            ],
          },
          reportPath,
          markdownPath,
        } as unknown as BenchmarkRunResult;
      },
    };
    const output = memoryIo();
    const exitCode = await runCli(
      [
        "--ai",
        "benchmark",
        "--frames",
        "12",
        "--resolutions",
        "1080p",
        "--output-dir",
        join(directory, "benchmark"),
      ],
      output.io,
      runtime,
    );
    const events = jsonLines(output.stdout);

    expect(exitCode).toBe(1);
    expect(output.stderr.join("")).toBe("");
    expect(events.map((event) => event.type)).toEqual([
      "start",
      "progress",
      "error",
    ]);
    expect(events.at(-1)).toMatchObject({
      type: "error",
      command: "benchmark",
      error: {
        code: "BENCHMARK_RUN_FAILED",
        details: { failedRuns: 1, reportPath, markdownPath },
      },
      exitCode: 1,
    });
  });
});
