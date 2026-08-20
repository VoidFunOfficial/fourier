# SDK ABI v1.1 Artifact 开发规范

## 新代码使用 component

React/Motion artifact 必须由 `defineReact`/`defineMotion` 创建，并在同一模块实现 `name`、`schema`、`component()`、`designPreview()`。Motion 还必须声明 `supportsTextMotion`；支持文本时单独实现 `textComponent()`。

文件默认导出 definition 即可。不要创建 preview renderer、逐帧截图服务或第二份 preview 配置；`fourier-sdk preview` 会把 definition 编译成浏览器 DOM runtime，直接在播放器内挂载并控制时间。`designPreview()` 只提供样例 props、composition、字体和 Motion subject。

建议结构：

```text
components/
  MetricPanel.tsx
  MetricPanel.test.ts
  assets/
  fonts/
```

component 只读取 props/subject。不要建立逐帧 Context；稳定尺寸与 seed 使用 `useFourierContext()`，动画使用 lifecycle + timeline。

## React 由 SDK 持有

作者只能从 `@fourier-video/sdk`、`@fourier-video/sdk/react`、`@fourier-video/sdk/motion` 或 `@fourier-video/sdk/three` 导入 React hook 和类型；透视 React 世界 interface 另从 `@fourier-video/sdk/universe-3d` 导入：

```tsx
import {
  defineMotion,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "@fourier-video/sdk/motion";
```

不要从 `react`、`react/jsx-runtime` 或 `react/jsx-dev-runtime` 直接导入。JSX 编译产生的隐式 runtime 由 SDK 或 render 的 Core host adapter 绑定到 SDK 自带版本，视频工程不需要安装 React，也不需要维护 React peer version。

3D artifact 的 Three.js class、loader 和类型也只能从 `@fourier-video/sdk/three` 导入，不直接导入 `three` 或 `three/addons/*`。这保证所有组件与渲染器使用 SDK 持有的同一 Three.js 版本。

## 生命周期与动画

```tsx
const target = useRef<HTMLDivElement>(null);
const timeline = useFourierTimeline();

useFourierLifecycle({
  fourierStart() {
    if (target.current === null) throw new Error("missing target");
    timeline.animate(target.current, keyframes, { fill: "both" });
  },
  fourierEnd() {},
});
```

- Motion 必须注册一次 lifecycle；React 可以零或一次。
- start/end 必须同步且可重复构建同一个最终 animation manifest。
- 不保存、播放或修改原生 Animation；`timeline.animate()` 不返回它。
- 省略 duration 以跟随宿主时长。
- 关键帧只使用 replace composite，playback rate 固定为 1。
- 初始化完成后不得自行改变 DOM 结构、attribute、文字或 animation timing。

CSS transition/keyframes 受支持；SDK WAAPI 必须通过 `useFourierTimeline()` 注册。原生 `element.animate()` 会被拒绝。

原生 `<audio>`/`<video>` 与 SVG SMIL（`animate`、`animateMotion`、`animateTransform`、`set`）也由宿主绝对时间控制，不需要额外注册。runtime 会暂停它们并在每次采样时设置时间；media 固定 `playbackRate=1`，普通 media 在素材结尾 clamp，声明 `loop` 时按素材时长循环。不要自行调用 `play()`、修改 `currentTime`，或调用 SVG 的 timeline 控制方法。

## 确定性

允许输出只由 props、subject、稳定 context、静态依赖和宿主绝对时间决定。禁止：

- fetch/XMLHttpRequest/WebSocket/EventSource
- Date、performance.now、Math.random
- setTimeout/setInterval/requestAnimationFrame
- 自行播放、seek 或修改 audio/video 与 SMIL timeline
- 未注册 WAAPI
- 初始化后的任意非引擎 DOM mutation

`FourierCanvas.onFrame()` 是 WebGL 的受控采样路径。它必须只根据本次收到的绝对 `timeMilliseconds`、`timeSeconds` 或 `progress` 赋值，不能使用 `rotation.y += ...` 等依赖历史采样顺序的写法，也不能返回 Promise。

随机样式在初始化时使用 `createFourierPrng(seed)` 一次生成关键帧。不要把随机数生成放进采样路径。

## Schema 与 designPreview

- Props 类型从 schema 推导，不维护重复 interface。
- 无 default 字段是必填字段。
- 图片路径等序列化值用 `field.asset()`。
- Artifact 组合节点用 `field.node()`；Project Template schema 不支持该字段。
- `designPreview().props` 覆盖所有必填字段。
- composition 声明 width/height/durationSeconds；静态为 0，动态为 1—30 整数秒，不声明 fps。
- 生产画面不随时间变化的 ABI v1.1 React 声明 `static: true`；它不能注册 lifecycle、animation、media、SMIL 或 render driver。
- Motion designPreview 必须提供本地或 data URI subject。

## 字体、CSS 与素材

- 开发 `designPreview()` 时优先使用 SDK `placeholder/` 中的图片、视频、字体和 3D 模型；在独立组件中将所需文件复制到组件自己的 `assets/` 或 `fonts/`，不要依赖远程 URL。
- Placeholder 只用于可复现的样例输入；生产素材继续通过 schema props、Motion subject 或工程资源传入。
- 字体放入工程，以本地 import 传给 `loadFont()`，使用其返回的稳定 family；不要手写 `@font-face`、family 名或依赖系统字体。
- 图片、media、GLB/GLTF 和 CSS asset 使用工程内相对 import 或 data URI；`.blend` 必须先导出为浏览器可加载的 GLB/GLTF。
- runtime 默认拒绝网络；图片会等待 `decode()`，media 会等待当前帧加载和 seek 完成，字体会等待 `document.fonts.ready`。
- 根元素显式给出尺寸，背景省略时保持透明。
- macOS 与 Linux profile 不承诺跨平台 PNG byte-for-byte 一致；同一 profile/snapshot/time 必须一致。

## Motion subject/fill

image/video/react subject 会变成引擎持有的当前时刻 PNG，再传给普通 `component()`。text/subtitle 保留原始字符串，只传给显式支持文本的 `textComponent()`；不支持文本的 Motion 会被拒绝。Motion 不读取逐帧上下文。

- none：非 active 区间直接复用原 subject。
- backwards：before 区间使用局部时间 0。
- forwards：after 区间使用完整 duration。
- both：两侧都填充，active 内保持连续局部时间。

不要在 Motion 中重复实现 fill。TSX Transform、layer、blend、opacity 仍在 Motion PNG 之后执行。

## 测试

ABI v1.1 必须从路径打开：

```ts
const fixture = await openArtifact(new URL("./MetricPanel.tsx", import.meta.url).pathname);
try {
  await fixture.assertDeterministic({ frames: [0, 20, 179] });
  await fixture.assertDeterministic({ times: [
    { numerator: 1n, denominator: 3n },
  ] });
} finally {
  await fixture.close();
}
```

最低覆盖：

1. 静态或 start/end/代表时间像素。
2. 正序、倒序、随机、重复采样哈希。
3. lifecycle 缺失/重复/异步/异常。
4. schema required/default/range。
5. Motion 四种 fill 与边界。
6. font/image/media readiness 和网络拒绝。
7. media/SMIL 正序、倒序、循环和越界采样。
8. preview descriptor 保持同步。

## 发布前

```bash
fourier check ./MetricPanel.tsx
fourier-sdk publish ./MetricPanel --dry-run
bun run typecheck
bun test
bun run test:dom
bun run build
```

`fourier check` 会验证 ABI v1.1、DOM bundle 和浏览器环境；非法 marker、浏览器缺失或版本不匹配会稳定失败。prepack 必须运行真实 DOM Adapter 测试，浏览器未安装时不允许 skip。

发布到 Fourier World 的目录还必须包含 `package.json`，具体字段与账号流程见 [Fourier World 发布规范](./PUBLISHING.md)。
