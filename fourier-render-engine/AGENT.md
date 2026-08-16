# Fourier Render Engine Agent 指南

本文件适用于 `fourier-render-engine/` 及其所有子目录。它面向维护渲染引擎本体的 Agent；创作 `main.tsx` 工程或 React/Motion artifact 时，还要同时遵守 `../fourier-sdk` 的公开 API 与 artifact 规则。

## 开始工作

1. 在本目录查看工作树状态并保留用户已有改动。这个包经常与 `../fourier-sdk` 同时演进，但不要顺手修改相邻包、锁文件、缓存或生成媒体。
2. 用 `rg` 找到目标符号，阅读实现、调用方和对应测试。不要只根据 README、旧设计文档或文件名推断当前行为。
3. 先判断改动属于哪条链路：Project 声明编译、Artifact/DOM、视觉准备、Scene/Template、FFmpeg、TTS、Preview、CLI/HTTP 或缓存。跨链路改动要逐项验证下文列出的合同。
4. 先跑最窄测试，再扩大验证。首次安装依赖使用 Bun `>=1.3`；不要仅为“更新到最新”而改依赖。

固定的浏览器运行时由 Playwright `1.62.0` 和指定 Chromium 提供。缺失时使用：

```bash
bunx playwright install chromium
```

Linux 环境通常需要：

```bash
bunx playwright install --with-deps chromium
```

## 引擎的真实数据流

不要把 Project TSX 和视觉 artifact 当成同一种输入：

```text
Project main.tsx
  -> Bun bundle + SDK author runtime
  -> SDK branded Project declaration
  -> Project Compiler
  -> ResolvedProject IR
  -> TTS / Scene & Template units / generated visuals
  -> FFmpeg filter plan
  -> 临时媒体
  -> 原子提交输出 + render manifest

ReactLayer / Motion artifact
  -> import 与确定性策略校验
  -> SDK ABI/schema/props 校验
  -> browser bundle + dependency/snapshot digest
  -> VisualTimelineRuntime 绝对时间采样
  -> PNG、无损 Alpha 媒体或 FFmpeg Video 投影数据
```

`src/renderer.ts` 是正式渲染编排入口。`validateProject`、`renderProject`、CLI、HTTP 和 Preview 必须继续共用 `loadProject` 及同一份 `ResolvedProject` 语义，不能为某个入口另写一套解析器或时间线。

## 代码地图

- `src/project-module-loader.ts`：只接受 `main.tsx`；校验本地静态 import，绑定 SDK/React author runtime，并生成 bundle 指纹。
- `src/project-compiler.ts`：把 SDK branded JSX 编译为 `ResolvedProject`；负责节点结构、时间锚点、资源作用域、Scene/Template 递归加载和 TTS 预处理。
- `src/types.ts`：IR、渲染选项、进度/诊断和 Preview 的核心类型。
- `src/time.ts`、`src/modifiers.ts`：精确时间换算、半开区间、Motion fill、Transform 插值和最终视觉位置。
- `src/artifact-protocol.ts`：SDK ABI v1 marker、artifact kind、schema/props 和 preview adapter 的兼容性边界。
- `src/artifact-compiler.ts`、`src/author-runtime.ts`、`src/image-assets.ts`：artifact import 策略、metadata/browser bundle、字体与图片内嵌、snapshot identity。
- `src/dom-bootstrap-source.ts`：注入浏览器的 DOM runtime；准备媒体/lifecycle、设置绝对时间并暴露稳定 snapshot。
- `src/browser-platform.ts`、`src/browser-check.ts`、`src/visual-timeline-runtime.ts`：固定 Chromium 配置、compositor commit、共享 browser/page pool、绝对时间采样和恢复/关闭逻辑。
- `src/visual-renderer.ts`：文本/React/Motion/Video Motion 的视觉准备，legacy Satori 路径与 DOM artifact 路径在这里汇合。
- `src/visual-cache.ts`：持久视觉缓存、内容摘要、完整性验证、隔离和原子提交。
- `src/render-module-renderer.ts`：递归准备 Scene/Template 的 raw 与 derived 无损单元及内容寻址缓存。
- `src/ffmpeg.ts`：将 IR、视觉素材和模块单元编成 filter graph，执行 FFmpeg 并原子提交最终文件。
- `src/media-probe.ts`、`src/tts.ts`：FFmpeg 能力检查、媒体覆盖校验、字幕批量合成和 TTS 缓存。
- `src/preview.ts`：稀疏采样选中节点、递归模块预览和 Motion/Transform 标注。
- `src/render-manifest.ts`、`src/render-profile.ts`：输出摘要、artifact snapshot、固定工具版本和像素运行时身份。
- `src/cli.ts`、`src/server.ts`、`src/project-summary.ts`：面向用户和自动化的入口；`src/index.ts` 是包公开导出面。
- `benchmark/`：生成 TSX 压测工程并测量渲染；`scripts/` 包含浏览器和 DOM suite 入口。
- `tests/`：单元、合同和条件启用的真实浏览器/FFmpeg 测试。

## 必须保持的核心合同

### Project 声明与 IR

- 工程、Scene、Template 入口均只发现 `main.tsx`。普通工程/Scene 默认导出 `defineProject(...)`；Template 默认导出 `defineTemplate(...)`。不要恢复 XML parser 或第二种工程入口。
- Project 源码只允许目录内本地静态依赖以及 SDK/编译器注入的 React runtime。继续拒绝动态 import、越界 import 和其他 bare import。
- `ResolvedProject` 是后续阶段的单一事实来源。新增节点字段时同步 `src/types.ts`、编译器、summary、Preview、视觉准备、FFmpeg、缓存身份和测试；不要在后端重新读取 JSX props。
- `at` / `after` / `with` 只能有一个；引用只允许已声明节点。Group 子节点使用局部 `offset`，`parallel` 与 `sequence` 的游标语义不能混淆。
- ID 在同一工程 IR 中全局唯一，声明顺序用于稳定的同层排序。合成顺序始终是 `layer`，再是 `declarationOrder`。
- `enabled` 与 `preview` 会从 Group 向子节点传播；禁用的 Scene/Template 不应被异步加载，但也不能成为后续时间引用目标。

### 时间与帧边界

- 声明时间只在编译边界通过 `parseTimeToFrames` 转为整数帧；支持 `f`、`s`、`ms` 组合，使用精确有理数计算并四舍五入。不要在时间线内部累积浮点秒。
- 保存并传递 `canvas.fpsSource`。FFmpeg 秒、音频采样位置和 DOM frame-start 都应从它推导，不能只依赖已经转成浮点数的 `fps`。
- 所有活动区间是半开区间 `[startFrame, endFrame)`。Motion 的 active 区间、Preview 选择、FFmpeg `enable`、媒体 trim 和 total frame 计算必须一致。
- DOM 采样只接受 `SampleClock` 产生的精确有理时间。乱序、重复和真实等待后的同一 snapshot/time 必须逐字节一致。
- TTS 时长按真实 `samples / sampleRate` 向上覆盖到整帧；不能四舍五入到更短时长。

### 资源与模块隔离

- 媒体、字体、组件、Scene/Template 路径必须是作用域内相对路径。保留 `realpath`/`relative` 检查，禁止绝对 URL、目录逃逸和符号链接逃逸。
- 根工程共享资源可由嵌套模块读取；一个 Scene/Template 不能读取另一个模块的私有目录。组件的递归依赖也必须落在 `resourceRoots` 内。
- Scene 不能嵌套 Scene 或 Template。Template 可以递归包含模块，但必须检测 source-path 循环；同一路径的 Template 还要把绑定值计入实例身份。
- 父子模块的 canvas 和 audio sample rate 必须完全匹配。Scene/Template 的 `in`、`out`、`duration` 与 `overflow` 继续由模块单元阶段统一处理。

### Artifact ABI 与确定性

- SDK artifact 只认 `Symbol.for("@fourier-video/sdk/artifact")`、ABI v1、`react | motion` kind 和 `dom-timeline | dom-timeline-ffmpeg-video` renderer。marker、schema、renderer 名、错误码和 manifest 字段都是兼容性合同。
- ABI v1 生产入口只支持 default export；`component`、`designPreview()` 和 Motion 的 Text/Video 能力声明必须通过 `artifact-protocol.ts` 校验。不要悄悄兼容异步 render 或旧 `render` 字段。
- Project 传入的 props 必须和 artifact schema 重新绑定：拒绝未知字段、补默认值、校验声明类型；`node` schema 字段不能从 Project props 注入。
- 被采样的 artifact/组件禁止网络、墙钟时间、`Math.random()`、timer、运行时全局对象和不受控 bare import。React 能力必须从 SDK 公开入口导入，不能直接从 `react` 导入。
- 动态效果必须是绝对时间的纯函数；随机性使用稳定 seed。禁止依赖上一帧、采样顺序或真实等待时间。
- 本地图片由虚拟 URL + route 提供，字体内嵌到 browser bundle；浏览器 context 默认拦截所有其他网络请求。

### DOM runtime 与浏览器资源

- 一次正式渲染共享一个 `VisualTimelineRuntime`；不要按节点或按帧启动 Chromium。每个 `TimelineInstance` 串行采样自身 page，不同 instance 通过 page pool 并行。
- macOS 使用 headed page capture，其他平台使用 headless BeginFrame。Linux 无论调用方请求多少 `domPages` 都固定为 1，并保留单 renderer/process 的容器约束和有界恢复路径。
- 截图前后 animation/media state 必须相同；透明背景必须保留 alpha。修改虚拟时间、BeginFrame、media seek 或 lifecycle barrier 时必须运行真实 DOM suite。
- 所有 browser、context、page、CDP session、TimelineInstance 和 runtime 都必须在成功、失败、超时和取消路径关闭。不要用外层竞速超时包住 Playwright launch 并留下孤儿进程。
- 任何可能改变像素的 browser/runtime 语义都要评估 `DOM_RENDER_PROFILE.runtimeRevision`、snapshot identity、视觉缓存和 render manifest；不能让旧像素缓存被误命中。

### 视觉准备与缓存

- 没有 Motion 的 Image/Video 由 FFmpeg 直接消费；Text、React 和 Motion 会生成 `PreparedVisual`。普通 Motion 包装 raster/text subject，FFmpeg Video Motion 只允许挂载 Video，并输出唯一的 `subject` surface。
- Text Motion 必须走独立 `textComponent` 能力；不要先把文字栅格化后伪装成已声明的 Text Motion。
- 持久视觉缓存仅用于拥有真实 `sourcePath` 的工程；内存 fixture/同步编译测试使用临时缓存，不能污染 fixture 目录。
- 缓存键必须覆盖所有影响像素或投影的输入：节点语义、props/type、组件和本地依赖内容、字体/媒体、subject key、seed、profile、FPS、Motion 区间与 fill。新增影响项时同步 cache identity。
- 持久动态帧先封装成无损 Alpha 媒体，再提交缓存。缓存写入使用 staging + rename；读取验证 schema、路径边界、文件集合、size 和 SHA-256；损坏条目要隔离后重建。
- Scene/Template 缓存分 raw content 和 derived unit 两层。内容键覆盖 source fingerprint、工程依赖、Template bindings 和 child unit；派生键再覆盖 `in/out/duration/overflow`。不要把表现层参数混进 raw key，也不要漏掉内容依赖。

### FFmpeg、媒体与输出

- FFmpeg 只消费 `ResolvedProject`、`PreparedVisual` 和 `RenderModuleUnit`。新增合成行为应进入 `buildFfmpegPlan`，测试 filter graph；不要在 CLI、Server 或 Preview 复制正式渲染计划。
- 视觉叠加以中心坐标放置，Transform 在宿主局部帧采样；音频延迟使用整数 sample 位置。视频视觉与音频的 `in/rate/loop` 必须保持同步。
- 最终 profile 使用 H.264/AAC；模块 profile 使用 `qtrle argb` + PCM，以保留透明度和可重复派生。不要让模块缓存经过有损编码。
- 输出先写同目录随机临时文件，FFmpeg 成功且文件存在后再 rename。覆盖检查、取消清理和失败详情不能绕过该提交路径。
- `assertFfmpegTools` 不只检查可执行文件，还检查 perspective/alpha/blend 等必需 filter；媒体校验要递归覆盖 Scene/Template，并区分普通覆盖与 loop 起点。
- 成功渲染必须生成 `<output>.manifest.json`，记录输出哈希、SDK/Chromium/Playwright 版本、render profile 和去重后的 artifact snapshots。

### TTS、Preview、CLI 与 HTTP

- TTS 是 `loadProject` 的编译前置步骤：先收集所有启用字幕需求，批量请求服务/命中 v3 缓存，再用真实采样数编译时间线。启用 TTS 的字幕禁止手工 `duration`。
- Preview 是稀疏采样和设计标注，不是第二个正式 renderer。它应复用编译器、视觉采样、Motion preview adapter、资源作用域和媒体校验。
- `--ai` 模式的 stdout 是稳定 JSONL 协议，只能输出 `start/progress/diagnostic/result/error` 事件；人类日志写 stderr。不要用任意 `console.log` 污染 stdout。
- `RenderEngineError.code`、CLI exit code、HTTP 400/422 结构和 job 状态是调用方可观察合同。边界失败使用 `fail(code, message, details)`；不要迫使测试或用户解析模糊字符串。
- `onProgress` 面向总体进度，`onDiagnostic` 面向可选的细粒度追踪。新增长操作时同时考虑取消信号、进度、诊断和 cleanup。

## TypeScript 与实现风格

- 使用 ESM、Bun/Web API 和带 `.ts` 后缀的相对 import；类型使用 `import type` 或行内 `type`。
- 项目开启 `strict`、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`、`verbatimModuleSyntax`。边界数据从 `unknown` 开始验证，不要用 `any`、断言或非空操作符掩盖协议问题。
- 可选字段不存在时使用条件展开，不要显式赋 `undefined`。对外 metadata/result 延续 `readonly` 与 `Object.freeze`。
- 错误消息、诊断和测试名称沿用现有中文风格；协议字段、标识符和错误码保持英文。
- 未经任务要求不要新增依赖、改版本号、重写 public exports 或编辑媒体/缓存生成物。
- 公共接口变化同步 `src/index.ts`、类型、README/调用示例和对应合同测试。

## 测试策略

先运行与改动最接近的测试：

| 改动范围 | 最小验证 |
| --- | --- |
| Project JSX、资源作用域、Scene/Template | `bun test tests/project-compiler.test.tsx` |
| 时间、TTS 时长、Transform/FFmpeg 表达式 | `bun test tests/time.test.ts tests/subtitle-tts.test.tsx tests/ffmpeg.test.tsx` |
| Artifact ABI、schema、import 策略 | `bun test tests/artifact-protocol.test.ts tests/sdk-component.test.tsx tests/component-image-assets.test.ts` |
| Browser 参数、BeginFrame、DOM page 并发 | `bun test tests/browser-platform.test.ts tests/visual-timeline-runtime.test.ts`，再跑 `bun run test:dom` |
| 视觉缓存或 render manifest | `bun test tests/visual-cache.test.ts tests/render-manifest.test.ts` |
| CLI、HTTP、summary | `bun test tests/cli.test.ts tests/server.test.ts` |
| TTS HTTP 与缓存 | `bun test tests/tts.test.tsx tests/subtitle-tts.test.tsx` |
| Preview/真实 FFmpeg | `RUN_FFMPEG_TESTS=1 bun test tests/preview.integration.test.tsx` |

所有代码改动至少再运行：

```bash
bun run typecheck
bun test
```

涉及 ABI、DOM runtime、浏览器、像素、生命周期、media/SMIL 或共享 runtime 时，还必须运行：

```bash
bun run browser:check
bun run test:dom
```

真实最终编码冒烟使用：

```bash
RUN_FFMPEG_TESTS=1 bun test tests/ffmpeg.test.tsx tests/preview.integration.test.tsx
```

发布前等价全量入口是：

```bash
bun run prepack
```

注意：

- `bun test` 默认跳过设置了 `RUN_DOM_TESTS=1` / `RUN_FFMPEG_TESTS=1` 的 suite，但部分普通测试也会真实启动 Chromium。报告结果时区分 PASS、FAIL、SKIP 和环境不可用。
- 浏览器测试要求固定 Chromium 能成功启动；FFmpeg 测试要求系统工具和所需 filter。环境失败要保留错误码和原始原因，不能写成测试通过。
- 测试 fixture 使用临时目录，并在 `afterEach` / `afterAll` / `finally` 中关闭 server/browser/runtime 和删除目录。
- 确定性改动至少验证同一时间的重复采样、乱序采样、新 page/runtime 采样和真实等待后采样。
- 只改文档时检查命令、路径和链接与当前 package scripts 一致；不要声称未执行的代码测试通过。

## 完成标准

交付前：

1. 检查工作树和本次 diff，确认没有覆盖用户改动，也没有混入 `.render-cache/`、测试媒体、临时 bundle 或输出 manifest。
2. 运行最窄相关测试和 `bun run typecheck`；按上表扩大到 DOM/FFmpeg/full suite。
3. 逐项检查受影响的入口是否仍共享同一语义：Library、CLI、HTTP、Preview、Scene/Template 与 benchmark。
4. 若像素、协议或缓存身份改变，确认版本/profile/schema/snapshot/cache invalidation 已同步。
5. 最终回复列出修改文件、保持或改变的合同、实际通过的命令，以及未运行或失败的检查和原因。不得把 skip、环境失败或未执行检查描述成 PASS。

## 事实来源

- `README.md`：用户可见的 TSX、CLI、TTS、Scene/Template、HTTP 和开发命令。
- `package.json`：公开 exports、CLI bin、依赖版本和验证脚本。
- `src/types.ts` 与 `src/index.ts`：当前 IR 和包公开 API。
- `src/project-compiler.ts`、`src/artifact-protocol.ts`、`src/visual-timeline-runtime.ts`、`src/ffmpeg.ts`：声明、ABI、采样与合成的主要实现合同。
- `tests/`：可执行行为和稳定错误码；真实浏览器合同以 DOM suite 为准。
- `../fourier-sdk/AGENTS.md` 及其公开文档：SDK 本体和 artifact 作者侧规则。

当 README、类型、测试和实现不一致时，不要静默选择其中之一。先用当前调用链和可执行测试确认事实，再在同一次任务中修正最接近事实来源的文档，或明确向用户报告冲突。
