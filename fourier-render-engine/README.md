# Fourier Render Engine

English | [简体中文](./README.zh-CN.md)

**Compile structured video projects into reliable deliverables.**

Fourier Render Engine is Fourier's deterministic execution layer. It loads an SDK-authored `main.tsx`, compiles branded JSX nodes into a `ResolvedProject`, prepares React, Motion, text, media, and TTS content, and uses FFmpeg to produce the final video. TSX is the declaration layer, not a separate browser rendering backend.

## Why Fourier Render Engine

- **Deterministic execution:** the host controls absolute time, random seeds, assets, and browser sampling so the same project can be rebuilt consistently.
- **Incremental rendering:** dependency fingerprints and layered caches reuse unchanged Scene/Template modules, artifact frames, prepared visuals, and TTS output, so a local edit does not restart all expensive work.
- **Efficient rendering:** independent visual preparation can run concurrently, shared browser runtimes avoid per-frame startup, static artifacts reuse one image, and FFmpeg consumes simple media layers directly when no DOM preparation is needed.
- **Structured rather than opaque:** Projects, Scenes, Templates, and nodes compile into one intermediate representation, allowing errors to point to a declaration or asset.
- **Designed for real projects:** modular timelines, bounded parallelism, cache integrity checks, and FFmpeg composition support long videos, repeated revisions, and batch production.
- **One set of semantics:** CLI, HTTP, Preview, and final Render share the compiler and visual runtime, reducing preview/export drift.
- **Agent-friendly operation:** `validate`, `inspect`, stable error codes, and `--ai` JSONL events support inspect-before-execute automation and precise diagnosis.

If all you need is a one-off, non-editable result, a general video model may be more direct. Fourier is a better fit when the video must remain editable, repeatable, batchable, component-based, and verifiable.

This package owns execution. Use the [Fourier SDK](../fourier-sdk/README.md) to declare projects and build visual capabilities, [Fourier Tools](../fourier-tools/README.md) to prepare media, and [Fourier World](../fourier-world/README.md) to discover reusable visual resources.

## Incremental and efficient rendering

Fourier optimizes around the structure of the video project rather than treating every render as a new opaque job:

1. **Fingerprint dependencies:** project declarations, Scene/Template bundles, component source, local assets, fonts, Motion timing, TTS inputs, FPS, and the render profile participate in cache identity.
2. **Reuse unchanged layers:** raw module content, derived module ranges, prepared visuals, static artifact images, dynamic visual output, and synthesized speech can be reused when their inputs remain unchanged.
3. **Invalidate precisely:** editing one dependency invalidates the cache entries that depend on it instead of discarding unrelated Scene and component work.
4. **Prepare independent work concurrently:** visual nodes and artifact sampling can use bounded concurrency and a shared browser runtime; one Chromium process is not launched for every node or frame.
5. **Keep the fast path simple:** Image and Video nodes without Motion go directly to FFmpeg, while only Text, React, and Motion content enters visual preparation.

The performance model depends on determinism. Cache entries include content hashes and render-profile information, are validated before use, and are rebuilt when their identity or integrity no longer matches. The result is faster iteration without silently accepting stale pixels.

## Project entry point

Every video project uses `main.tsx` as its entry point:

```tsx
import {
  Canvas,
  defineProject,
  Image,
  Project,
  Timeline,
} from "@fourier-video/sdk/project";

export default defineProject(
  <Project id="example" version="1.0" audioSampleRate={48_000}>
    <Canvas
      width={1920}
      height={1080}
      fps={30}
      background="#000000"
      colorSpace="sRGB"
    />
    <Timeline>
      <Image
        id="cover"
        at="0f"
        duration="3s"
        src="assets/cover.png"
        fit="cover"
        x={960}
        y={540}
        width={1920}
        height={1080}
        layer={1}
      />
    </Timeline>
  </Project>,
);
```

Available nodes include `Project`, `Canvas`, `Timeline`, `Group`, `Video`, `Audio`, `Image`, `Text`, `Subtitle`, `ReactLayer`, `Scene`, `Template`, `Motion`, and `Transform`.

Declarations use native values:

- `content` is a string; `props`, `tts`, and `keyframes` are objects.
- `audio`, `enabled`, and `loop` are booleans.
- `after` and `with` reference a bare node ID.
- Media and module trimming uses `sourceIn` and `sourceOut`.
- Artifact export selection uses `exportName`.
- Time values support `30f`, `1s`, `500ms`, and the SDK `TimeValue` type.

## CLI

From this package directory:

```bash
bun run src/cli.ts validate /path/to/project/main.tsx
bun run src/cli.ts inspect /path/to/project/main.tsx
bun run src/cli.ts preview /path/to/project/main.tsx \
  --output /tmp/preview.png \
  --anchor 1s \
  --range-start 0s \
  --range-end 2s
bun run src/cli.ts render /path/to/project/main.tsx \
  --output /tmp/output.mp4 \
  --overwrite
```

After installing the package CLI, replace `bun run src/cli.ts` with `fourier`. The `--ai` flag emits a stable JSONL event stream for automation:

```bash
fourier --ai inspect /path/to/project/main.tsx
fourier --ai render /path/to/project/main.tsx -o /tmp/output.mp4
```

An entry point whose filename is not `main.tsx` fails with `UNSUPPORTED_PROJECT_ENTRY`.

## Artifact MP4 API

Component-publishing tools can render a standalone compiled React or Motion artifact without wrapping it in a project. `renderVisualArtifactVideo` drives the same deterministic DOM timeline used by the engine, writes every sampled frame, and lets FFmpeg encode a browser-compatible H.264/yuv420p MP4:

```ts
import { renderVisualArtifactVideo } from "@fourier-video/render-engine";

const result = await renderVisualArtifactVideo(
  { entryPath: "/absolute/path/to/MetricPanel.tsx" },
  { output: "/tmp/MetricPanel.mp4", overwrite: true },
);

console.log(result.sha256, result.totalFrames);
```

Dynamic artifacts preserve their declared frame count and frame rate. `domPages` controls how many DOM Timeline pages sample dynamic frames in parallel; static artifacts still use one page and are encoded as a one-second still video. Transparent pixels are composited over `#101010` by default; `background`, `crf`, `preset`, `ffmpegPath`, cancellation, and progress callbacks are configurable.

## Subtitle TTS

`Subtitle` and `Text role="subtitle"` nodes can enable speech by passing an empty `tts` object. Do not supply a manual `duration`; the synthesized audio determines it:

```tsx
<Subtitle
  id="voice"
  at="0f"
  content="This subtitle is synthesized and timed automatically."
  tts={{}}
  x={960}
  y={950}
  width={1600}
  height={120}
  layer={20}
  font="fonts/Inter-Bold.ttf"
  fontSize={52}
  lineHeight={1.2}
  color="#FFFFFF"
  align="center"
/>
```

`volume`, `reference`, and the legacy-compatible `style` field are optional. By default, an independent TTS service owns model and voice selection. Only an explicit `--tts-model` or `TTS_MODEL` makes the client validate a local model directory and send `modelPath` to that service. Bind a local service persistently with:

```bash
fourier tts bind --port 8765
```

## Scenes and Templates

Scene and Template directories also use `main.tsx`. A Scene default-exports `defineProject(...)`; a Template default-exports `defineTemplate(...)`:

```tsx
import { field } from "@fourier-video/sdk";
import {
  Canvas,
  defineTemplate,
  Project,
  Text,
  Timeline,
} from "@fourier-video/sdk/project";

export default defineTemplate({
  schema: {
    title: field.string(),
    duration: field.time({ default: "2s" }),
  },
  render: ({ title, duration }) => (
    <Project id="title-card" version="1.0" audioSampleRate={48_000}>
      <Canvas
        width={1920}
        height={1080}
        fps={30}
        background="#000000"
        colorSpace="sRGB"
      />
      <Timeline>
        <Text
          id="title"
          duration={duration}
          role="title"
          content={title}
          x={960}
          y={540}
          width={1400}
          height={200}
          layer={1}
          font="fonts/Inter.ttf"
          fontSize={96}
          lineHeight={1.1}
          color="#FFF"
          align="center"
        />
      </Timeline>
    </Project>
  ),
});
```

The parent passes values with `<Template props={{ title: "Hello" }} />`. The schema handles required and unknown fields, defaults, and type validation. Recursive Template cycles are rejected.

## HTTP API

Start the service:

```bash
bun run src/server.ts
```

The request body accepts an absolute project path or a path allowed by the server configuration:

```json
{
  "project": "/absolute/path/to/main.tsx",
  "output": "/tmp/output.mp4",
  "overwrite": true
}
```

The server, CLI, Preview, `renderProject`, and `validateProject` use the same TSX loader and Project Compiler.

## Rendering architecture

```text
main.tsx + local static imports
  -> Bun bundle with the SDK/React author runtime bound by the host
  -> SDK-branded JSX declaration
  -> Project Compiler
  -> ResolvedProject IR
  -> React/Motion visual preparation + TTS
  -> FFmpeg plan
  -> media output
```

Scene and Template bundle content participates in the project fingerprint, and the rendering cache schema changes when entry-point semantics change. Resource scoping, node ordering, time anchors, cycle detection, TTS, and FFmpeg behavior remain centralized in the engine.

## Development and verification

```bash
bun install
bun run typecheck
bun test
bun run browser:check
bun run test:dom
```

Run a real FFmpeg integration smoke test with:

```bash
RUN_FFMPEG_TESTS=1 bun test tests/ffmpeg.test.tsx
```

The benchmark tool also generates `main.tsx` projects:

```bash
fourier benchmark --resolutions 1080p --frames 12
```

For the complete authoring workflow, see the [Fourier Agent SDK Guide](../fourier-sdk/docs/AGENT_SDK_GUIDE.md).
