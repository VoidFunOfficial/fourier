import { parseArgs } from "node:util";
import { availableParallelism, platform } from "node:os";
import { resolve } from "node:path";
import { checkBrowserRuntime } from "../src/browser-check.ts";
import { compileVisualArtifact } from "../src/artifact-compiler.ts";
import { SampleClock } from "../src/time.ts";
import { VisualTimelineRuntime } from "../src/visual-timeline-runtime.ts";

interface CandidateResult {
  pages: number;
  pageInitializationMs: number;
  sampleMs: number;
  totalMs: number;
  framesPerSecond: number;
  peakRssMb: number;
}

const parsed = parseArgs({
  args: process.argv.slice(2),
  options: {
    output: { type: "string" },
    "max-pages": { type: "string" },
    frames: { type: "string" },
    "memory-mb": { type: "string" },
  },
  strict: true,
});
const positive = (source: string | undefined, fallback: number): number => {
  const value = source === undefined ? fallback : Number(source);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`参数必须是正整数: ${source}`);
  return value;
};
const maximumPages = positive(parsed.values["max-pages"], Math.min(4, availableParallelism()));
const frameCount = positive(parsed.values.frames, 24);
const memoryLimitMb = positive(parsed.values["memory-mb"], 1024);
const output = resolve(parsed.values.output ?? `benchmark/dom-timeline-${platform()}.json`);
const elapsed = async <T>(operation: () => Promise<T>): Promise<{ value: T; milliseconds: number }> => {
  const started = performance.now();
  const value = await operation();
  return { value, milliseconds: performance.now() - started };
};

const browser = await elapsed(checkBrowserRuntime);
const compiled = await elapsed(() => compileVisualArtifact({
  entryPath: new URL("./fixtures/components/DomBenchmarkPanel.tsx", import.meta.url).pathname,
  composition: { width: 256, height: 144, fps: 60, durationInFrames: Math.max(120, frameCount) },
}));
const clock = new SampleClock(60);
const candidates: CandidateResult[] = [];

for (let pages = 1; pages <= maximumPages; pages++) {
  const runtime = new VisualTimelineRuntime({ maximumDomPages: pages });
  const initialization = await elapsed(() => Promise.all(
    Array.from({ length: pages }, () => runtime.open(compiled.value)),
  ));
  let peakRss = process.memoryUsage.rss();
  try {
    let cursor = 0;
    const sampling = await elapsed(() => Promise.all(initialization.value.map(async (instance) => {
      while (true) {
        const frame = cursor++;
        if (frame >= frameCount) return;
        await instance.sample({ time: clock.frameStart(frame) });
        peakRss = Math.max(peakRss, process.memoryUsage.rss());
      }
    })));
    const totalMs = initialization.milliseconds + sampling.milliseconds;
    candidates.push({
      pages,
      pageInitializationMs: Number(initialization.milliseconds.toFixed(3)),
      sampleMs: Number(sampling.milliseconds.toFixed(3)),
      totalMs: Number(totalMs.toFixed(3)),
      framesPerSecond: Number((frameCount / sampling.milliseconds * 1000).toFixed(3)),
      peakRssMb: Number((peakRss / 1024 / 1024).toFixed(3)),
    });
  } finally {
    await Promise.all(initialization.value.map((instance) => instance.close()));
    await runtime.close();
  }
}

const eligible = candidates.filter((candidate) => candidate.peakRssMb <= memoryLimitMb);
const recommended = (eligible.length === 0 ? candidates : eligible)
  .toSorted((left, right) => left.totalMs - right.totalMs)[0];
if (recommended === undefined) throw new Error("没有 DOM page benchmark 结果");
const report = {
  schemaVersion: 1,
  platform: `${process.platform}-${process.arch}`,
  browser: browser.value,
  measurements: {
    browserLaunchCommitMs: Number(browser.milliseconds.toFixed(3)),
    artifactCompileMs: Number(compiled.milliseconds.toFixed(3)),
    fontImageBarrierPageInitMs: candidates[0]?.pageInitializationMs,
    singleFrameMs: candidates[0] === undefined
      ? undefined
      : Number((candidates[0].sampleMs / frameCount).toFixed(3)),
    candidates,
  },
  constraints: { frameCount, memoryLimitMb },
  recommendedPages: recommended.pages,
};
await Bun.write(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output, recommendedPages: recommended.pages, candidates }));
// Playwright 的 driver 在某些 headed macOS 运行中会保留 IPC handle；此时报告已持久化。
process.exit(0);
