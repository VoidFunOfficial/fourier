# @fourier-video/sdk

English | [简体中文](./README.zh-CN.md)

**Turn frontend visual capabilities into video components that agents can understand, configure, and reuse.**

Fourier SDK is the typed interface between the Render Engine and the developer ecosystem. It declares Projects, Scenes, and Templates, and it authors React, Motion, Text Motion, Three.js, and other programmatic visual artifacts. SDK ABI v1 uses real DOM/CSS/WAAPI, sampled by Playwright Chromium at an absolute rational time supplied by the host.

## Why Fourier SDK

- **Reuse the web platform:** author with TypeScript, TSX, React, CSS, Motion, and Three.js instead of learning a closed animation description format.
- **Designed for deterministic rendering:** absolute time, stable randomness, controlled media, and a host-owned timeline keep preview, seek, test, and export behavior aligned.
- **Types and schemas serve people and agents:** developers get type checking, while agents get discoverable parameters, defaults, constraints, and usage descriptions.
- **Build once, reuse across projects:** components, Scenes, Templates, and brand systems can be previewed and tested independently, then published to Fourier World.
- **The SDK owns the runtime:** artifacts do not manage their own React, Three.js, or JSX runtime versions, reducing host/component version drift.

Developers use the SDK to create high-quality visual capabilities; agents choose parameters and organize them into videos. The [Render Engine](../fourier-render-engine/README.md) executes the result, and [Fourier World](../fourier-world/README.md) makes components discoverable and reusable.

## Installation

Requires Bun `>= 1.3`. The SDK owns React, its JSX runtime, and React types, so a video project does not need to install or declare React. The DOM Timeline also requires the Chromium build pinned to Playwright `1.62.0`:

```bash
bun add @fourier-video/sdk
bunx playwright install chromium
```

macOS uses headed Chromium with CDP viewport capture. Linux uses a headless shell with `HeadlessExperimental.beginFrame`. Both pause virtual time; wall-clock sleeps and ordinary Playwright screenshots are not fallback rendering paths.

## TSX project declarations

`@fourier-video/sdk/project` exports `defineProject`, `defineTemplate`, and typed JSX nodes. Projects, Scenes, and Templates all use `main.tsx` as their only entry point:

```tsx
import {
  Canvas,
  defineProject,
  Project,
  Text,
  Timeline,
} from "@fourier-video/sdk/project";

export default defineProject(
  <Project id="hello" version="1.0" audioSampleRate={48_000}>
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
        duration="2s"
        role="title"
        content="Hello"
        x={960}
        y={540}
        width={1200}
        height={180}
        layer={1}
        font="fonts/Inter.ttf"
        fontSize={96}
        lineHeight={1.1}
        color="#FFF"
        align="center"
      />
    </Timeline>
  </Project>,
);
```

Authoring properties use native booleans, object-valued `props`, `tts`, and `keyframes`, and string `content`. `after` and `with` reference bare IDs. Trimming and artifact export selection use `sourceIn`/`sourceOut` and `exportName`. Declarations compile into the engine IR and are ultimately rendered by FFmpeg.

## ABI v1 React artifacts

An artifact uses `component`, with the ABI v1 marker. `component` reads props; stable width, height, and seed values come from hooks. Frame, FPS, progress, and time are deliberately absent from the component interface.

```tsx
import {
  defineReact,
  field,
  useRef,
  useFourierContext,
  useFourierLifecycle,
  useFourierTimeline,
} from "@fourier-video/sdk";

export default defineReact({
  name: "MetricPanel",
  schema: { value: field.number({ min: 0, default: 42 }) },
  component({ props }) {
    const root = useRef<HTMLDivElement>(null);
    const { width, height } = useFourierContext();
    const timeline = useFourierTimeline();

    useFourierLifecycle({
      fourierStart() {
        if (root.current === null) throw new Error("missing root");
        timeline.animate(root.current, [
          { opacity: 0, transform: "translateY(20px)" },
          { opacity: 1, transform: "translateY(0px)" },
        ]);
      },
      fourierEnd() {},
    });

    return <div ref={root} style={{ width, height }}>{props.value}</div>;
  },
  designPreview() {
    return {
      props: {},
      composition: { width: 640, height: 360, durationSeconds: 3 },
    };
  },
});
```

A React artifact with no lifecycle, animation, media, SMIL, or render driver is static and can reuse one sampled PNG. React artifacts may register zero or one lifecycle; Motion artifacts must register exactly one.

React hooks and types such as `ReactNode`, `CSSProperties`, and `RefObject` must come from `@fourier-video/sdk` or its `/react`, `/motion`, and `/three` entry points. Do not import `react`, `react/jsx-runtime`, or `three` directly from artifact source. The compiler aliases the implicit JSX runtime and SDK to the single versions owned by the renderer, so an artifact directory does not need its own `package.json` or `node_modules`.

## ABI v1 Motion

A Motion explicitly declares whether it supports text. Image, video, and React subjects enter `component` at the current time. Text never enters that interface; a text-capable Motion implements a separate `textComponent` that receives the source string.

```tsx
export default defineMotion({
  name: "Reveal",
  schema: {},
  supportsTextMotion: false,
  component({ subject }) {
    const root = useRef<HTMLDivElement>(null);
    const timeline = useFourierTimeline();
    useFourierLifecycle({
      fourierStart() {
        if (root.current === null) throw new Error("missing root");
        timeline.animate(root.current, [
          { opacity: 0, transform: "scale(.9)" },
          { opacity: 1, transform: "scale(1)" },
        ]);
      },
      fourierEnd() {},
    });
    return <div ref={root}>{subject}</div>;
  },
  designPreview() {
    return {
      props: {},
      subject: <img src={imageDataUri} width={640} height={360} />,
      composition: { width: 640, height: 360, durationSeconds: 3 },
    };
  },
});
```

A text-capable Motion supplies both interfaces:

```tsx
export default defineMotion({
  name: "TextReveal",
  schema: {},
  supportsTextMotion: true,
  component({ subject }) {
    return <div>{subject}</div>;
  },
  textComponent({ text }) {
    return <span>{text}</span>;
  },
  designPreview() {
    return {
      props: {},
      subject: "Fourier",
      composition: { width: 640, height: 120, durationSeconds: 3 },
    };
  },
});
```

Declaring `supportsTextMotion: true` without `textComponent` fails during definition. A Motion that declares `false` is rejected when applied to a text or subtitle host. A string returned as `designPreview().subject` automatically selects the text entry point.

With `fill="none"`, inactive intervals return the original subject. `backwards`, `forwards`, and `both` use the local start boundary, continuous active time, or full-duration boundary as appropriate.

## Timeline and deterministic randomness

`useFourierTimeline().animate()` does not return a native `Animation`; playback remains under host control. When duration is omitted, the animation fills the host duration. The runtime supports a constrained set of duration, delay, iteration, playback-rate, and composite semantics. Calling `element.animate()` directly fails with `UNREGISTERED_WAAPI_ANIMATION`.

The DOM timeline also controls native `<audio>`, `<video>`, and SVG SMIL animations. Media remains paused and seeks to the host's absolute time. Do not call `play()`, set `currentTime`, or advance the SVG timeline yourself.

Random effects must use a stable seed:

```ts
const { seed } = useFourierContext();
const random = createFourierPrng(`${seed}:noise`);
const x = random() * 20 - 10;
```

### Declarative Fourier Motion

Common CSS animation can use the SDK's built-in `motion.*` interface without installing `motion` or `framer-motion`. `FourierMotion` hides the single lifecycle registration and places any number of `motion.div`, `motion.span`, or `motion.create(tag)` elements on the same host-controlled timeline:

```tsx
import { FourierMotion, motion } from "@fourier-video/sdk/motion";

function Reveal({ children }) {
  return (
    <FourierMotion>
      <motion.div
        animate={[
          { opacity: 0, y: 48, filter: "blur(14px)", offset: 0 },
          { opacity: 1, y: 0, filter: "blur(0px)", offset: 0.42 },
          { opacity: 1, y: 0, filter: "blur(0px)", offset: 1 },
        ]}
        transition={{ ease: [0.16, 1, 0.3, 1] }}
      >
        {children}
      </motion.div>
    </FourierMotion>
  );
}
```

Numeric `x`, `y`, and `z` values use pixels; numeric rotation and skew values use degrees. Transition duration and delay use seconds. Omitting duration still fills the Motion host duration.

## Fourier Three.js

3D React artifacts use the SDK-owned `@fourier-video/sdk/three` entry point, which exports the React authoring API, Three.js, `GLTFLoader`, and `FourierCanvas`:

```tsx
import modelUrl from "./assets/model.glb";
import {
  FourierCanvas,
  GLTFLoader,
  Group,
  defineReact,
  useRef,
} from "@fourier-video/sdk/three";

export default defineReact({
  name: "RotatingModel",
  schema: {},
  component() {
    const model = useRef<Group | null>(null);
    return (
      <FourierCanvas
        onCreate={async ({ scene }) => {
          const gltf = await new GLTFLoader().loadAsync(modelUrl);
          model.current = gltf.scene;
          scene.add(gltf.scene);
        }}
        onFrame={({ progress }) => {
          if (model.current) model.current.rotation.y = progress * Math.PI * 2;
        }}
      />
    );
  },
  designPreview() {
    return {
      props: {},
      composition: { width: 960, height: 540, durationSeconds: 6 },
    };
  },
});
```

`onCreate` may load bundled GLB assets asynchronously. `onFrame` must remain synchronous and derive state directly from `timeMilliseconds`, `timeSeconds`, or `progress`; it must not accumulate state or start `requestAnimationFrame`. Preview scrubbing, tests, and final export all seek to an absolute time before rendering WebGL.

Browsers cannot load `.blend` directly. Export GLB/GLTF from Blender and import it as a local asset. [Example3D.tsx](./example/Example3D.tsx) demonstrates deterministic rotation with the included placeholder model.

## Universe projection

`@fourier-video/sdk/universe` places existing React, Canvas, or `FourierCanvas` output in an unbounded 2D world; it does not introduce a new renderer:

```tsx
import { Universe, World, defineCamera } from "@fourier-video/sdk/universe";

const camera = defineCamera({
  width: 1920,
  height: 1080,
  moves: [{
    at: "0f",
    duration: "60f",
    to: { kind: "fit", target: "diagram", fit: "contain", padding: 80 },
    path: { kind: "linear" },
    ease: "ease-in-out",
  }],
});

function SpatialDiagram() {
  return (
    <Universe camera={camera}>
      <World id="diagram" x={4000} y={-1200} width={1200} height={800}>
        <ArchitectureDiagram />
      </World>
    </Universe>
  );
}
```

Camera coordinates use a center position, logical width and height, zoom, and clockwise rotation. World bounds support camera fitting and safe clipping. Camera Motion supports pose/fit targets, time expressions, several path types, and deterministic custom paths. `defineCameraProgram` adds multiple cameras and cuts; multiple Universe instances can form split-screen or picture-in-picture layouts.

## Placeholder assets and fonts

The [`placeholder`](./placeholder) directory contains local images, transparent subjects, video, fonts, and 3D models for reproducible previews. Copy any placeholder required by a publishable component into that component's own `assets/` or `fonts/` directory and include it in the package `files` list.

Local OTF, TTF, WOFF, and WOFF2 files can be loaded with `loadFont()`:

```tsx
import { defineReact, loadFont } from "@fourier-video/sdk";
import titleFontUrl from "./fonts/Title.otf";

const titleFont = loadFont(titleFontUrl);

// Inside component:
<div style={{ fontFamily: titleFont }}>Fourier</div>
```

Placeholders make previews runnable and reproducible. Production assets should still arrive through schema props, a Motion subject, or project resources. The runtime rejects network access by default, so remote image, video, and font URLs are not a placeholder strategy.

## Preview, test, and check

```bash
bunx fourier-sdk preview
# Loads every SDK example as a card gallery

bunx fourier-sdk preview ./components
# Also accepts a directory or one artifact

fourier check ./components/MetricPanel.tsx
```

An authoring entry point only needs one default-exported `defineReact()` or `defineMotion()` definition. Do not create a separate preview renderer, frame endpoint, or preview configuration. `designPreview()` declares props, canvas, duration, and an optional Motion subject; it does not implement rendering.

An ABI v1 React artifact whose production image never changes with host time should declare `static: true`. The runtime verifies that it did not register a lifecycle, animation, media element, SMIL animation, or render driver, then renders one PNG and reuses it for the node duration. Without an explicit declaration, the mounted runtime infers whether the artifact is static.

The standard ABI v1 testing entry point accepts a source file path:

```ts
import { openArtifact } from "@fourier-video/sdk/testing";

const fixture = await openArtifact("/absolute/path/MetricPanel.tsx");
try {
  const frame = await fixture.renderFrame({ frame: 20 });
  const exact = await fixture.renderTime({
    time: { numerator: 1n, denominator: 3n },
  });
  await fixture.assertDeterministic({ times: [
    { numerator: 0n, denominator: 1n },
    { numerator: 1n, denominator: 3n },
  ] });
  console.log(frame.sha256, exact.sha256);
} finally {
  await fixture.close();
}
```

`assertDeterministic` requires exactly one non-empty `frames` or `times` array.

## Publish to Fourier World

A publishable component has its own `package.json` with standard name, version, description, license, and `files` fields. Its `fourier` field declares the entry point, category, agent instruction, use cases, tags, and visual style. Ordinary runtime video projects do not need a `package.json`; this applies only to component packages submitted to World.

```bash
fourier-sdk login --email author@example.com
fourier-sdk publish ./components/MetricPanel --dry-run
fourier-sdk publish ./components/MetricPanel
```

A dry run compiles the artifact and uses three Fourier Render Engine DOM Timeline pages plus FFmpeg to render the same deterministic timeline into a browser-compatible H.264 MP4. Static artifacts still sample one DOM frame. A real publish uploads that preview together with the SHA-256-addressed source archive, binds it to the component's `preview` field, and places the component in `review`. Local publishing therefore requires Playwright Chromium and FFmpeg with `libx264`. After approval, install or safely remove it with:

```bash
fourier-sdk search "cinematic title animation for a product launch" --type motion --style cinematic --json
fourier-sdk add @studio/MetricPanel
fourier-sdk del @studio/MetricPanel
```

`search` requires no login and runs Fourier World's hybrid keyword/semantic retrieval. `--json` preserves package identity, agent instructions, positive and negative use cases, structured tags, quality metrics, and explainable match scores. Programs can import `searchFourierWorld()` from `@fourier-video/sdk/search` for the same readonly typed result. `add` defaults to `components/@studio/MetricPanel` and records the installation in `.fourier-world.json`. `del` moves the component into the recoverable `.fourier-trash` directory by default. See the [Fourier World Publishing Guide](./docs/PUBLISHING.md) for package fields, account requirements, CI authentication, and the full workflow.

## Documentation and examples

- [Agent SDK Guide: React, Motion, and Three.js](./docs/AGENT_SDK_GUIDE.md)
- [Complete API reference](./docs/API.md)
- [Development rules](./docs/DEVELOPMENT.md)
- [Fourier World publishing](./docs/PUBLISHING.md)
- [Declarative Motion and component examples](./example/README.md)
- [Render Engine](../fourier-render-engine/README.md)

## Maintenance commands

```bash
bun run typecheck
bun test
bun run test:dom
bun run build
bun run prepack
```
