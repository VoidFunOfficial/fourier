# @fourier-video/sdk

[English](./README.md) | 简体中文

**把前端视觉能力变成 Agent 可理解、可配置、可复用的视频组件。**

Fourier SDK 是 Fourier 宿主与开发者生态之间的类型化创作接口。它既用于声明 Project、Scene 和 Template，也用于开发 React、Motion、Text Motion、Three.js 与程序化视觉 artifact。SDK ABI v1.1 使用真实 DOM/CSS/WAAPI，由 Fourier Core 在宿主给定的绝对有理时间采样；Core/render 继续兼容读取 ABI v1。

## 为什么选择 Fourier SDK

- **复用 Web 开发生态**：继续使用 TypeScript、TSX、React、CSS、Motion 和 Three.js，而不是学习封闭的动画描述格式。
- **为确定性渲染而设计**：绝对时间、稳定随机数、受控媒体和宿主时间轴让预览、seek、测试与导出保持一致。
- **类型与 schema 同时服务人和 Agent**：开发者获得类型检查，Agent 获得可发现的参数、默认值、边界与用途描述。
- **能力开发一次、跨项目复用**：组件、Scene、Template 和品牌视觉系统可以独立预览、测试，并发布到 Fourier World。
- **运行环境由 SDK 持有**：artifact 不必自行管理 React、Three.js 和 JSX runtime 版本，减少组件与宿主版本漂移。

Fourier SDK 的分工是让开发者创造高质量视觉能力，让 Agent 选择参数并组织视频；SDK 的 preview/testing/World 使用 [Fourier Core](../fourier-core/README.md)，完整工程执行由 [Render Engine](../fourier-render-engine/README.zh-CN.md) 完成，组件可通过 [Fourier World](../fourier-world/README.zh-CN.md) 发布和发现。

## 安装

要求 Bun `>=1.3`。安装 SDK 会传递安装 `@fourier-video/core`，无需显式安装 Core。React、JSX runtime 与 React 类型由 SDK 持有，视频工程不需要安装或声明 React。DOM Timeline 还需要安装与 Playwright `1.62.0` 对应的 Chromium：

```bash
bun add @fourier-video/sdk
bunx playwright install chromium
```

macOS 使用 headed Chromium + CDP viewport capture；Linux 使用 headless shell + `HeadlessExperimental.beginFrame`。两者都暂停虚拟时间，不使用墙钟 sleep 或普通 Playwright screenshot 作为降级路径。

## TSX 工程声明

`@fourier-video/sdk/project` 提供 `defineProject`、`defineTemplate` 和类型化 JSX 节点。工程、Scene 与 Template 都以 `main.tsx` 为唯一入口：

```tsx
import { Canvas, defineProject, Project, Text, Timeline } from "@fourier-video/sdk/project";

export default defineProject(
  <Project id="hello" version="1.0" audioSampleRate={48_000}>
    <Canvas width={1920} height={1080} fps={30} background="#000000" colorSpace="sRGB" />
    <Timeline>
      <Text id="title" duration="2s" role="title" content="Hello"
        x={960} y={540} width={1200} height={180} layer={1}
        font="fonts/Inter.ttf" fontSize={96} lineHeight={1.1}
        color="#FFF" align="center" />
    </Timeline>
  </Project>,
);
```

作者属性使用原生 boolean、对象 props、`content`、`tts` 和 `keyframes`；`after`/`with` 使用裸 ID；裁切和导出字段分别是 `sourceIn`/`sourceOut`、`exportName`。声明会编译为引擎 IR，最终仍由 FFmpeg 渲染。

## ABI v1 React

Artifact 使用 `component`，marker 固定为 ABI v1。`component` 只能读取 props；稳定的 width、height、seed 通过 hook 获取，逐帧 frame/fps/progress/time 不进入组件接口。

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

没有 lifecycle、animation、media、SMIL 和 render driver 的 React artifact 是静态 artifact，只采样一次并复用 PNG。React 可注册零或一个 lifecycle；Motion 必须恰好注册一个。

Artifact 源码中的 React hook、`ReactNode`、`CSSProperties`、`RefObject` 等必须从 `@fourier-video/sdk` 或对应的 `/react`、`/motion`、`/three` 入口导入，不直接导入 `react`、`react/jsx-runtime`。3D 组件同样只能从 `@fourier-video/sdk/three` 导入 Three.js class、loader 和类型，不直接依赖 `three`。Core host 会把隐式 JSX runtime 和 SDK alias 到 SDK/render adapter 解析出的版本，因此 artifact 所在视频目录可以完全没有 `package.json` 和 `node_modules`。

## ABI v1 Motion

Motion 必须通过 `supportsTextMotion` 显式声明是否支持文本。image/video/react 仍以当前时刻 subject 进入 `component`；文本不会混入该接口：支持文本的 Motion 必须另外实现接收原始字符串的 `textComponent`。结果仍按 `Motion PNG → TSX Transform → FFmpeg layer/blend/opacity` 合成。

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

支持 Text Motion 时必须同时提供普通 subject 和文本两个实现：

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

声明 `supportsTextMotion: true` 却缺少 `textComponent` 会在定义时失败；声明为 `false` 的组件用于 text/subtitle 宿主时会被引擎拒绝。

对于支持文本的 Motion，`designPreview().subject` 返回 string 时会自动走文本入口；作者不需要为 preview 编写分支或 renderer。

`fill="none"` 的非 active 区间直接返回原 subject；backwards、forwards、both 分别使用局部 0、连续 active 时间和完整 duration 边界。

## Timeline 与确定性随机数

`useFourierTimeline().animate()` 不返回原生 `Animation`，播放权始终属于宿主。省略 duration 时使用宿主时长；只支持有限的 duration/delay/iterations、固定 playback rate `1` 和 replace composite。直接调用 `element.animate()` 会以 `UNREGISTERED_WAAPI_ANIMATION` 拒绝。

DOM timeline 也自动接管原生 `<audio>`/`<video>` 与 SVG SMIL animation。media 与 SMIL 会保持暂停并按宿主绝对时间 seek；普通 media 在结尾停住，`loop` media 按素材时长循环。素材使用本地相对 import 或 data URI，不要在组件中自行调用 `play()`、设置 `currentTime` 或推进 SVG timeline。

随机关键帧必须只由稳定 seed 生成：

```ts
const { seed } = useFourierContext();
const random = createFourierPrng(`${seed}:noise`);
const x = random() * 20 - 10;
```

### 声明式 Fourier Motion

常规 CSS 动画可以直接使用 SDK 内置的 `motion.*` interface，不安装 `motion`/`framer-motion`，也不复制它们的源码。`FourierMotion` 隐藏一次 lifecycle 注册，任意数量的 `motion.div`、`motion.span` 或 `motion.create(tag)` 都会进入同一条宿主控制时间轴：

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

`x/y/z` 的数字单位为 px，`rotate/skew` 的数字单位为 deg；`transition.duration/delay` 使用秒。省略 duration 时仍铺满 Motion 宿主时长。接口不返回原生 `Animation`，因此预览、测试和正式导出保持相同的绝对时间定位语义。

## Fourier Three.js

3D React artifact 使用 SDK 持有的 `@fourier-video/sdk/three`。该入口同时导出 React authoring API、Three.js、`GLTFLoader` 与 `FourierCanvas`，组件不安装或直接导入 `react`/`three`：

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
    return { props: {}, composition: { width: 960, height: 540, durationSeconds: 6 } };
  },
});
```

`onCreate` 可以异步加载工程内打包的 GLB；Fourier 会等待资源完成。`onFrame` 必须同步，并根据 `timeMilliseconds`、`timeSeconds` 或 `progress` 直接求出当前状态，不能累加状态或启动 `requestAnimationFrame`。宿主在预览拖动、测试和正式导出时都会先定位绝对时间，再同步渲染 WebGL。

图片纹理同样直接从 `/three` 导入 `TextureLoader`。SDK 导出的版本兼容 Three.js loader，并支持本地图片 import、`URL`、`{ src }`、`loadManyAsync()` 和可读的解码错误；可通过第二个 constructor 参数统一设置 `colorSpace` 或 `flipY`。

浏览器不能直接读取 `.blend`。请从 Blender 导出 GLB/GLTF 后使用相对 import；示例 [Example3D.tsx](./example/Example3D.tsx) 加载由 [`Low+Poly+Earth.blend`](./placeholder/3d_model/Low+Poly+Earth.blend) 导出的 GLB，并完成一圈确定性旋转。

## Universe 世界投影

`@fourier-video/sdk/universe` 在 React artifact 内把普通 React、Canvas 或 `FourierCanvas` 的既有渲染结果放入无限二维世界；它不创建新的渲染后端：

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

Camera 使用中心坐标、逻辑 width/height、zoom 和顺时针 rotation。World 默认中心 anchor；其显式 bounds 同时用于 Camera Fit 与安全裁剪。Camera Motion 支持 pose/fit target、`TimeExpression`、linear/bezier/arc/curve/custom path；custom path 对相同输入必须返回相同坐标。

多镜头使用 `defineCameraProgram({ cameras, initialCamera, cuts })`。Cut 是 Active Camera 切换，不等同于零时长 Move。多个 Universe 可直接组合为 split screen 或 picture-in-picture。Camera 与输出 viewport 必须保持相同宽高比；同一逻辑 Camera 可以等比例输出到更高分辨率。

## Placeholder 示例资源

组件作者在开发 `designPreview()`、Motion subject 和素材插槽时，推荐先使用 SDK [`placeholder`](./placeholder) 目录中的占位资源，而不是连接网络或在组件里维护一份临时 data URI。目录提供：

- [`pic`](./placeholder/pic)：普通图片与透明人物图。
- [`video`](./placeholder/video)：本地 MP4。
- [`fonts`](./placeholder/fonts)：用于验证自带字体加载的字体文件。
- [`3d_model`](./placeholder/3d_model)：浏览器可加载的 GLB 和对应 Blender 源文件。

在 SDK 仓库内可以直接相对导入；组件发布到 Fourier World 前，将需要的占位资源复制到组件自己的 `assets/` 或 `fonts/` 目录，并写入 package `files`：

```tsx
import placeholderImageUrl from "./assets/placeholder.png";

designPreview() {
  return {
    props: {},
    subject: <img src={placeholderImageUrl} width={960} height={540} />,
    composition: { width: 960, height: 540, durationSeconds: 3 },
  };
}
```

OTF、TTF、WOFF、WOFF2 等浏览器字体通过本地 import 交给 `loadFont()`；它会生成稳定的内部 family 并返回可直接用于 `fontFamily` 的字符串，不需要维护 `FONT_FAMILY`、`@font-face` 或 `designPreview().fonts`：

```tsx
import { defineReact, loadFont } from "@fourier-video/sdk";
import titleFontUrl from "./fonts/Title.otf";

const titleFont = loadFont(titleFontUrl);

// component 内：
<div style={{ fontFamily: titleFont }}>Fourier</div>
```

Placeholder 只负责让预览可运行、可复现；生产素材仍应通过 schema props、Motion subject 或工程资源传入。runtime 默认拒绝网络，因此不要把远程图片、视频或字体 URL 当作占位方案。

## 预览、测试与检查

```bash
bunx fourier-sdk preview
# 默认以卡片列表加载 SDK example 下的全部组件

bunx fourier-sdk preview ./components
# 也可以加载一个目录或单个 artifact

# CLI 还会在 0.0.0.0:3212 暴露允许 CORS 的监听端口
bunx fourier-sdk preview ./components --public-port 4321

fourier check ./components/MetricPanel.tsx
```

作者入口只需要默认导出一个 `defineReact()` 或 `defineMotion()` definition；不编写 preview renderer、逐帧 render handler 或单独的 preview config。ABI v1 preview server 只负责编译 definition 和热更新，播放器直接加载同一份 DOM/CSS/WAAPI runtime，并通过时间轴设置动画时间，不从服务端拉取逐帧 PNG。目录模式会按视口惰性挂载卡片 runtime、复用版本化 UI 资源，并在热更新时只重编受影响的 artifact；离开视口或切到后台的预览暂停采样。`designPreview()` 只声明 props、画布、时长和 Motion subject，不参与具体渲染。

## 发布到 Fourier World

可发布组件必须有独立的 `package.json`，用标准字段声明包名、版本、描述、MIT license 和待归档的 `files`，并在 `fourier` 字段中声明入口、分类、Agent instruction、适用场景、标签和视觉风格。运行时仍不要求普通视频工程拥有 `package.json`；这个要求只适用于要发布到 World 的组件包。

```bash
fourier-sdk login --email author@example.com
fourier-sdk publish ./components/MetricPanel --dry-run
fourier-sdk publish ./components/MetricPanel
```

`--dry-run` 会编译 artifact，并调用 Fourier Core 与 FFmpeg，把同一条确定性时间线渲染为浏览器兼容的 H.264 MP4。真实发布会把该预览视频与带 SHA-256 的源码归档一起上传，将视频绑定到组件的 `preview` 字段，并强制进入 `review`。因此本地发布环境需要 Playwright Chromium 和带 `libx264` 的 FFmpeg。发布者身份来自包名的 namespace 和 World 账号，不从本地清单接受 author ID 或 `published` 状态。审核通过后，可以把组件下载到项目或安全移除：

```bash
fourier-sdk search "产品发布的电影感标题动画" --type motion --style cinematic --json
fourier-sdk add @studio/MetricPanel
fourier-sdk del @studio/MetricPanel
```

`search` 无需登录，调用 Fourier World 的关键词 + 语义混合检索；`--json` 会保留包名、Agent instruction、适用/不适用场景、结构化标签、质量指标和可解释匹配分数。程序可以从 `@fourier-video/sdk/search` 导入 `searchFourierWorld()` 获得同一份只读类型结果。`add` 默认写入 `components/@studio/MetricPanel` 和项目级 `.fourier-world.json`；`del` 默认移动到可恢复的 `.fourier-trash`。字段表、账号要求、CI 登录方式和完整指令见 [Fourier World 发布规范](./docs/PUBLISHING.md)。

生产画面不随宿主时间变化的 ABI v1 React 应显式声明 `static: true`。runtime 会验证该组件没有注册 lifecycle、animation、media、SMIL 或 render driver；正式渲染只生成一张 PNG，再按工程节点时长复用。未声明 `static` 时由 runtime 挂载后自动推断。

ABI v1 的标准 testing 入口是文件路径：

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

`assertDeterministic` 必须且只能传非空 `frames` 或 `times`。

## 文档与示例

- [Agent SDK 操作手册：React / Motion / Three.js](./docs/AGENT_SDK_GUIDE.md)
- [完整 API](./docs/API.md)
- [开发规范](./docs/DEVELOPMENT.md)
- [Fourier World 发布规范](./docs/PUBLISHING.md)
- [声明式 Motion、GlitchMotion 与 Windows7Window 示例](./example/README.md)
- [Render Engine](../fourier-render-engine/README.zh-CN.md)
- [Fourier Core](../fourier-core/README.md)

## 维护命令

```bash
bun run typecheck
bun test
bun run test:dom
bun run build
bun run prepack
```
