# @fourier-video/sdk API

本文对应 `@fourier-video/sdk@1.1.0`。当前 `SDK_ABI_VERSION` 为 `1`。

## Project declarations

`@fourier-video/sdk/project` 导出：

```ts
defineProject(declaration: ReactElement): ProjectDefinition;
defineTemplate({ schema, render }): TemplateDefinition;

Project; Canvas; Timeline; Group;
Video; Audio; Image; Text; Subtitle; ReactLayer;
Scene; Template; Motion; Transform;
```

这些组件创建 data-only 品牌 JSX 节点，由 render-engine 直接编译为 `ResolvedProject`。时间属性接受 `string | TimeValue`；Artifact `props`、TTS 与 Transform keyframes 使用类型化对象；boolean 属性不做字符串化。Template 的 `render(props)` 类型从 schema 推导，绑定时校验必填、未知字段、默认值与字段类型。

## Artifact definitions

`defineReact` 和 `defineMotion` 使用 DOM component：

```ts
defineReact({ name, schema, static?, component, designPreview });
defineMotion({ name, schema, supportsTextMotion: false, component, designPreview, preview?, overlay? });
```

每个 Motion 必须显式声明 `supportsTextMotion`。普通 Motion 写 `false`；写 `true` 时必须提供与普通 subject 路径分离的文本实现：

```ts
defineMotion({
  supportsTextMotion: true,
  component({ subject, props }) { /* image/video/react subject */ },
  textComponent({ text, props }) { /* source text */ },
  // name/schema/designPreview ...
});
```

省略能力声明会抛出 `TEXT_MOTION_CAPABILITY_REQUIRED`；声明支持但缺少对应实现会抛出 `TEXT_MOTION_IMPLEMENTATION_REQUIRED`。文本宿主使用不支持 Text Motion 的 artifact 时，引擎抛出 `TEXT_MOTION_UNSUPPORTED`。

ABI v1 marker 固定包含：

```ts
{
  package: "@fourier-video/sdk";
  sdkAbiVersion: 1;
  renderer: "dom-timeline";
  kind: "react" | "motion";
  component: Function;
  // schema/name/designPreview，Motion 还包含 supportsTextMotion，
  // 支持文本时包含 textComponent；另可有 preview/overlay
}
```

Marker 不含逐帧 `render()`；definition 必须提供 `component`。

### Component inputs

```ts
interface ReactComponentInput<Schema> {
  props: Readonly<InferFields<Schema>>;
}

interface MotionComponentInput<Schema> {
  subject: React.ReactNode;
  props: Readonly<InferFields<Schema>>;
}

interface TextMotionComponentInput<Schema> {
  text: string;
  props: Readonly<InferFields<Schema>>;
}
```

普通 `component` 不会接收文本宿主的原始字符串；文本只进入独立的 `textComponent`。输入中没有 frame、fps、progress 或 time。时间只存在于宿主控制的 CSS/WAAPI timeline。

### `loadFont(source, options?)`

`@fourier-video/sdk`、`/react` 和 `/motion` 都导出同步的 `loadFont()`：

```ts
loadFont(
  source: string,
  options?: {
    weight?: number | "normal" | "bold";
    style?: "normal" | "italic" | "oblique";
  },
): string;
```

`source` 使用本地 `.otf`、`.ttf`、`.woff`、`.woff2` import 或 data URI。返回值是由 source 和 descriptors 派生的稳定 CSS family；浏览器 runtime 会自动注册对应 `@font-face`，并在首次采样前通过 `document.fonts.ready` 等待字体。因此 artifact 不需要手写 family 名、CSS `@font-face` 或 `designPreview().fonts`。远程 URL 仍受 ABI v1 网络约束禁止。

## Runtime hooks

### `useFourierContext()`

返回 timeline instance 生命周期内不变的值：

```ts
interface FourierStableContext {
  readonly width: number;
  readonly height: number;
  readonly seed: number;
  readonly fps: number;
  readonly durationInFrames: number;
  readonly durationMilliseconds: number;
}
```

### `useFourierLifecycle(callbacks)`

```ts
interface FourierLifecycle {
  fourierStart(): void;
  fourierEnd(): void;
}
```

hook 通过 layout effect 注册稳定 token；组件重渲染只更新 callback 引用。同一 artifact 多 token 会抛 `DUPLICATE_FOURIER_LIFECYCLE`。bootstrap 在初始 commit 后分别用 `flushSync` 调用 start/end，返回 Promise 会抛 `FOURIER_LIFECYCLE_ASYNC`。

- Motion：必须恰好一次。
- React：零或一次；零次且无 animation、media、SMIL 或 render driver 时视为静态。

### `useFourierTimeline()`

```ts
interface FourierTimeline {
  animate(
    target: Element,
    keyframes: Keyframe[] | PropertyIndexedKeyframes,
    options?: {
      duration?: number; // ms；省略时等于宿主 duration
      delay?: number;
      iterations?: number;
      easing?: string;
      direction?: PlaybackDirection;
      fill?: FillMode;
    },
  ): void;
}
```

不暴露原生 Animation。duration/delay/iterations 必须有限，duration/iterations 非负；playback rate 固定为 1，composite 固定 replace。原生 WAAPI animation 未注册时由 runtime 拒绝。

DOM timeline 同时接管原生 `<audio>`/`<video>` 和 SVG SMIL animation。它们不通过 `animate()` 注册：runtime 挂载后自动发现，保持 paused，并按宿主绝对时间设置 `currentTime`。media 固定 `playbackRate=1`；有限时长的普通 media 在结尾 clamp，带 `loop` 的 media 取模循环；SMIL 通过最外层 SVG 的 `setCurrentTime()` 采样。素材必须通过本地相对 import 或 data URI 打包，作者不能自行播放或 seek。

### `createFourierPrng(seed)`

接受有限 number 或 string，返回确定性的 `[0,1)` PRNG。相同 seed 和调用顺序得到相同序列。

### `FourierMotion` / `motion.*`

声明式 interface 在 `@fourier-video/sdk` 与 `@fourier-video/sdk/motion` 导出：

```ts
interface FourierMotionTransition {
  duration?: number; // seconds；默认使用宿主时长
  delay?: number;    // seconds
  ease?: string | readonly [number, number, number, number];
  repeat?: number;   // 首次播放后的额外次数，必须有限
  repeatType?: "loop" | "reverse";
  fill?: FillMode;
}

type FourierMotionTarget = Omit<
  CSSProperties,
  "offset" | "transform" | "translate" | "rotate" | "scale"
> & {
  x?: string | number;
  y?: string | number;
  z?: string | number;
  scale?: number;
  scaleX?: number;
  scaleY?: number;
  rotate?: string | number;
  rotateX?: string | number;
  rotateY?: string | number;
  skewX?: string | number;
  skewY?: string | number;
  transform?: string;
  offset?: number;
  easing?: string;
};
```

一个 Motion definition 放置恰好一个 `<FourierMotion>`；其下可放任意数量的 `motion.div`、`motion.span` 等 intrinsic element，也可用 `motion.create(tag)`。每个 element 的 `animate` 接受单个 target 或有序 target 数组，`initial={false}` 表示从 authored CSS 开始。

该 module 是 `useFourierLifecycle()` 与 `useFourierTimeline()` 之上的深层 interface：不依赖第三方 Motion 包、不引入其源码、不暴露原生 `Animation`，最终仍注册为宿主控制的 WAAPI manifest。`transform` 与 `x/y/scale/rotate/...` shortcut 不能在同一个 target 中混用。

### `FourierCanvas` / Three.js

`@fourier-video/sdk/three` 是 3D artifact 的唯一 authoring 入口。它重新导出 SDK React API、Three.js core、`GLTFLoader` 和以下 Fourier interface：

该入口显式用 `FourierTextureLoader` 替代 Three.js 同名 `TextureLoader` 导出。它兼容 `new TextureLoader(manager)`，同时接受工程内图片 import、`URL` 和 `{ src }`，可用 `loadManyAsync()` 并把浏览器的 `[object Event]` 转成包含素材地址的解码错误。第二个 constructor 参数可统一设置 `colorSpace` 与 `flipY`：

```ts
const loader = new TextureLoader(undefined, { colorSpace: SRGBColorSpace });
const textures = await loader.loadManyAsync([poster1Url, poster2Url]);
```

Render Engine 会把 `.png`、`.jpg`、`.jpeg`、`.webp`、`.avif`、`.gif`、`.bmp` 和 `.svg` import 作为二进制依赖打包；不会再把图片内容误当 TSX 扫描。

```ts
interface FourierThreeContext {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
  readonly camera: Camera;
  readonly width: number;
  readonly height: number;
}

interface FourierThreeFrame extends FourierThreeContext {
  readonly timeMilliseconds: number;
  readonly timeSeconds: number;
  readonly progress: number;
  readonly durationMilliseconds: number;
}

interface FourierCanvasProps {
  scene?: Scene;
  camera?: Camera;
  rendererOptions?: Omit<WebGLRendererParameters, "canvas">;
  onCreate?(context: Readonly<FourierThreeContext>):
    | void
    | (() => void)
    | Promise<void | (() => void)>;
  onFrame?(frame: Readonly<FourierThreeFrame>): void;
  className?: string;
  style?: CSSProperties;
  ariaLabel?: string;
}
```

默认创建 45° `PerspectiveCamera`、透明 `Scene` 和像素比固定为 1 的 `WebGLRenderer`；Fourier 拥有 canvas、输出尺寸与时间。`onCreate` 是唯一允许异步的阶段，可用 `GLTFLoader.loadAsync()` 加载工程内相对 import 的 GLB，并可返回同步清理函数。所有 driver ready 后，宿主先渲染 0ms，再开始采样。

`onFrame` 在每个 Fourier 绝对时间点同步调用，随后 SDK 执行 `renderer.render(scene, camera)`。它必须以当前 `timeSeconds`/`progress` 直接赋值，不能依赖调用次数或之前帧的对象状态；返回 Promise 会抛 `FOURIER_RENDER_FRAME_ASYNC`。不创建 `requestAnimationFrame` 或 Three `setAnimationLoop()`。

作者源码直接 bare import `three`/`three/addons/*` 会以 `INVALID_COMPONENT_IMPORT` 拒绝。浏览器不支持 `.blend`，请从 Blender 导出自包含 GLB 或 GLTF 资源。

### `@fourier-video/sdk/phy2d`

`phy2d` provides a deterministic position-based 2D soft-body world for React
and Motion artifacts. It runs without timers, browser state, random input, or
an internal animation loop; authors explicitly advance the world and can bake
snapshots into Fourier-controlled keyframes.

```ts
import { createPhy2dWorld } from "@fourier-video/sdk/phy2d";

const world = createPhy2dWorld({
  width: 1920,
  height: 1080,
  damping: 0.955,
  solverIterations: 6,
});

world.addSoftBody({
  center: { x: 480, y: 270 },
  radius: 260,
  particleCount: 18,
  structuralStiffness: 0.94,
  bendingStiffness: 0.38,
  pressureStiffness: 0.16,
});

world.step({
  bodyAccelerations: [{ x: 0.2, y: 0 }],
  targetAreaScale: 1,
  targetStructureScale: 1,
  collisionRelaxation: 0.42,
});

const snapshot = world.snapshot();
```

Each body is a closed particle membrane with structural, bending, and shape
distance constraints plus a signed-area pressure constraint. The world solves
soft-body point-in-polygon collisions and wall constraints on every iteration.
`snapshot()` returns copied readonly particles, centers, current areas, and rest
areas. Identical configuration and step inputs produce identical snapshots.
`targetStructureScale` contracts or expands the membrane spring rest lengths;
combine it with `targetAreaScale` for physically solved extreme compression.

### `Universe` / `World` / Camera

`@fourier-video/sdk/universe` 是 React artifact 的二维世界 interface。普通 children 先按原方式渲染，`World` 添加静态世界变换，`Universe` 再把 Camera 投影编译进宿主管理的 WAAPI timeline：

```ts
const camera = defineCamera({
  width: 1920,
  height: 1080,
  initial: { x: 0, y: 0, zoom: 1, rotation: 0 },
  moves: [{
    at: "0f",
    duration: "2s",
    to: { kind: "fit", target: "diagram", fit: "contain", padding: 80 },
    path: { kind: "bezier", control1: { x: 500, y: 0 }, control2: { x: 1000, y: 500 } },
    ease: "ease-in-out",
  }],
});
```

- `World` 必须声明 Universe 内唯一 id、x/y、width/height；anchor 默认中心，rotation 默认 0，scale 默认 1。
- `to.kind="pose"` 更新 Camera 数值状态；`to.kind="fit"` 支持 contain、cover、width、height 与四边 padding。
- Path 与时间 easing 分离。内置 linear、bezier、arc、Catmull-Rom curve；custom sampler 在初始化时对每个 progress 执行两次，不确定结果会抛 `NON_DETERMINISTIC_CAMERA_PATH`。
- `overscan` 默认 0.25。World 离开旋转 frustum 与 near-visible 区域时由离散 visibility animation 跳过绘制，但 React 子树保持挂载；边界不保守的节点使用 `cull="never"`。
- `defineCameraProgram()` 接收命名 cameras、initialCamera 和严格递增的 cuts。Cut 从指定 frame 开始切换 Active Camera，不允许用零 duration Move 代替。
- Camera 逻辑尺寸与 artifact viewport 必须同宽高比，否则抛 `CAMERA_ASPECT_MISMATCH`。Universe 不进入 Project JSX/FFmpeg IR。

## Schema

```ts
const schema = defineSchema({
  title: field.string({ minLength: 1 }),
  value: field.number({ min: 0, max: 1 }),
  visible: field.boolean({ default: true }),
  accent: field.color({ default: "#22c55e" }),
  delay: field.time({ default: "0f" }),
  tone: field.enum(["calm", "active"] as const),
  logo: field.asset({ accept: ["image/png"] }),
  content: field.node(),
});
```

| Field | 值 | 主要约束 |
| --- | --- | --- |
| `field.string()` | string | length/default |
| `field.number()` | number | min/max/integer/default |
| `field.boolean()` | boolean | default |
| `field.color()` | string | color/default |
| `field.time()` | `{source,frames,seconds}` | time/default |
| `field.enum()` | 字面量联合 | values/default |
| `field.asset()` | string | accept/default |
| `field.node()` | ReactNode | 仅 Artifact 编程入口；Project Template schema 不支持 |

schema 是 props 的单一事实来源。未知、缺失、非法或声明类型漂移分别对应 `UNKNOWN_ARTIFACT_PROP`、`MISSING_ARTIFACT_PROP`、`INVALID_ARTIFACT_PROP`、`ARTIFACT_PROP_TYPE_MISMATCH`。

## Design preview

每个 artifact 必须同步返回：

```ts
interface DesignPreviewComposition {
  width: number;
  height: number;
  durationSeconds: number; // 0 静态；动态为 1—30 整数
}
```

SDK 固定 design preview 为 60fps。Motion 还必须提供 subject，可选 timing：

```ts
{
  subject: React.ReactNode | ((input: { frame; context }) => React.ReactNode);
  motion?: {
    startFrame: number;
    durationInFrames: number;
    fill: "none" | "forwards" | "backwards" | "both";
  };
}
```

Motion `preview()` 与 `overlay()` 保持纯同步，它们只描述设计预览，不实现渲染。作者的默认导出只需是 `defineReact()`/`defineMotion()` artifact。

ABI v1 React 可声明 `static: true`，表示正式画面在宿主时间内像素不变。DOM runtime 会拒绝同时注册 lifecycle、animation、media、SMIL 或 render driver 的伪静态组件；通过校验后 consumer 只采样一张 PNG。`designPreview().composition.durationSeconds: 0` 只描述设计预览时长，不能代替生产静态声明。

当 Motion 声明 `supportsTextMotion: true` 且 design preview 的 `subject` 是 string 时，SDK 将它视为源文本并调用 `textComponent`；其他 subject 仍进入普通组件入口。

图片、视频、字体或 3D 输入尚未由真实工程提供时，推荐从 SDK `placeholder/` 选择资源并复制到组件本地目录，再通过相对 import 用于 `designPreview()`。这比远程 URL 或临时内联 data URI 更容易通过网络拒绝、资源 readiness 和确定性检查。Placeholder 不应写死为生产内容；真实素材仍由 props、subject 或工程资源注入。

## Fourier World semantic Search

`@fourier-video/sdk/search` 为 Agent 提供只读、无需登录的自然语言检索入口。Fourier World 在服务端完成关键词与向量混合召回，SDK 负责筛选参数校验、公开响应解析、相对媒体 URL 解析和只读冻结：

```ts
import { searchFourierWorld } from "@fourier-video/sdk/search";

const response = await searchFourierWorld("产品发布的电影感标题动画", {
  type: "motion",
  styles: ["cinematic", "elegant"],
  moods: ["energetic"],
  languages: ["zh-CN"],
  limit: 8,
});

for (const result of response.results) {
  console.log(result.packageName, result.instruction);
  console.log(result.match.score, result.match.semanticScore, result.match.reasons);
}
```

`searchFourierWorld(query, options?)` 的 query 会 trim，长度必须为 1—500 字符。常用 options：

| 字段 | 行为 |
| --- | --- |
| `worldUrl` | Fourier World 地址；默认 `https://www.fourier.video` |
| `type` | `card`、`motion`、`graphic`、`scene-template`、`other` |
| `styles` / `moods` / `languages` | 与 World manifest 相同的结构化枚举筛选 |
| `contentDomains` / `author` | 内容领域或发布者 namespace 筛选 |
| `page` / `limit` | 从 1 开始分页；limit 为 1—48，默认 12 |
| `sessionId` | 可选的 1—100 字符匿名检索会话标识 |
| `signal` | 取消当前请求的 `AbortSignal` |

结果中的 `match.score` 是 0—1 混合分数，`semanticScore` 是语义相似度，`keywordScore` 是关键词得分，`reasons` 是给 Agent 的可解释匹配理由。`downloadable: true` 表示当前审核版本可以交给 `fourier-sdk add` 安装。World 返回不符合公开合同的数据时抛 `FourierWorldApiError`，`status` 为 502。

CLI 使用同一 interface；`--json` 输出稳定的 `WorldSearchResponse`，适合 Agent 直接消费：

```bash
fourier-sdk search "产品发布的电影感标题动画" \
  --type motion --style cinematic --mood energetic --limit 8 --json
```

## Testing

```ts
openArtifact(entryPath: string, { exportName?: "default" }): Promise<ArtifactFixture>
```

`ArtifactFixture`：

```ts
interface ArtifactFixture {
  readonly kind: "react" | "motion";
  readonly name: string;
  readonly snapshotId: string;
  renderFrame({ frame, signal? }): Promise<FrameResult>;
  renderTime({ time: { numerator, denominator }, signal? }): Promise<TimeResult>;
  assertDeterministic(
    { frames: readonly number[] } | { times: readonly RationalTimeInput[] }
  ): Promise<void>;
  inspectMotionPreview({ anchorFrame, range }): Promise<MotionPreviewDescriptor | undefined>;
  close(): Promise<void>;
}
```

time 输入进入 runtime 时立即转成约分后的 bigint 有理秒。`assertDeterministic` 的 frames/times 必须二选一且非空。

## Preview server

```bash
bunx fourier-sdk preview [./Artifact.tsx|./components] \
  [--host 127.0.0.1] [--port 3211] [--open] [--no-watch]
```

不传入口时，preview 默认发现 SDK `example` 目录中的所有 `.tsx`/`.jsx` 组件。传入目录时以可搜索、可筛选的 React 卡片列表展示其中的组件；接近视口的卡片才挂载 runtime 并自动循环播放，离开视口或页面进入后台后暂停采样。点击卡片进入带逐帧时间轴的详情页。传入单个 artifact 时仍使用同一套组件库界面。

ABI v1 preview server 编译 entry 中的 DOM bundle、CSS 和字体资源，浏览器播放器直接挂载 artifact，并用宿主管理的绝对时间调用 DOM timeline。它不启动服务端 Playwright，也不提供 `/api/frames/*.png`；源码更新后只重编直接或经本地依赖受影响的 artifact，发布新 snapshot 并刷新对应浏览器 runtime。preview UI 静态资源在单次服务生命周期内使用版本化缓存，嵌入式卡片由库页面统一监听更新，不会为每张卡片各自保持事件流。作者不需要实现 renderer 或导出单独的 preview config。正式导出、确定性测试与像素断言仍使用 `VisualTimelineRuntime.open() → TimelineInstance.sample(time)`。

## Engine/runtime errors

| Code | 含义 |
| --- | --- |
| `TEXT_MOTION_CAPABILITY_REQUIRED` | Motion 未显式声明是否支持文本 |
| `TEXT_MOTION_IMPLEMENTATION_REQUIRED` | 声明支持文本但缺少独立文本实现 |
| `TEXT_MOTION_UNSUPPORTED` | 不支持文本的 Motion 被用于文本宿主 |
| `INVALID_FONT_SOURCE` | `loadFont()` 收到空 source 或远程 URL |
| `INVALID_FONT_OPTIONS` | `loadFont()` 收到无效 weight/style descriptor |
| `FOURIER_RUNTIME_REQUIRED` | hook 在 runtime 外调用 |
| `FOURIER_LIFECYCLE_REQUIRED` | Motion 未注册 lifecycle |
| `DUPLICATE_FOURIER_LIFECYCLE` | lifecycle 多 token |
| `FOURIER_LIFECYCLE_ASYNC` | lifecycle 返回 Promise |
| `FOURIER_MOTION_ROOT_REQUIRED` | `motion.*` 未放在 `FourierMotion` 内 |
| `NESTED_FOURIER_MOTION_ROOT` | 一个 artifact 嵌套了多个声明式 Motion 根 |
| `AMBIGUOUS_FOURIER_MOTION_TRANSFORM` | 同一 target 混用 transform 与 shortcut |
| `FOURIER_RENDER_DRIVER_NOT_READY` | 3D/render driver 未完成初始化就采样 |
| `FOURIER_RENDER_DRIVER_LATE_REGISTRATION` | 初始化完成后才注册 render driver |
| `FOURIER_RENDER_DRIVER_PREPARE_IN_PROGRESS` | 重复并发初始化 render driver |
| `DUPLICATE_FOURIER_RENDER_DRIVER` | 重复注册同一个 render driver |
| `FOURIER_RENDER_FRAME_ASYNC` | `onFrame`/driver render 返回 Promise |
| `UNREGISTERED_WAAPI_ANIMATION` | 绕过 timeline helper |
| `UNSUPPORTED_DOM_TIMELINE_API` | timer、network 等不受支持的浏览器能力 |
| `DOM_MEDIA_FAILED` | media 当前帧加载或 seek 失败 |
| `DOM_SMIL_UNSUPPORTED` | 当前浏览器不能由宿主控制 SMIL timeline |
| `DOM_TIMELINE_MUTATED` | 初始化后的 DOM/animation manifest 漂移 |
| `DOM_ANIMATION_DRIFT` | 截图前后 animation state 漂移 |
| `DOM_COMPOSITOR_COMMIT_FAILED` | CDP commit/capture 失败 |
| `CHROMIUM_NOT_INSTALLED` | 固定浏览器缺失 |
| `CHROMIUM_VERSION_MISMATCH` | Chromium 版本不匹配 |
