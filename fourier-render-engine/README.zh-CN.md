# Fourier Render Engine

[English](./README.md) | 简体中文

**把结构化视频工程稳定地编译成可交付结果。**

Fourier Render Engine 是 Fourier 的确定性执行层。它读取 SDK 声明的 `main.tsx`，将品牌 JSX 节点编译为 `ResolvedProject`，准备 React、Motion、文字、媒体和 TTS 内容，最后通过 FFmpeg 合成视频。TSX 是声明层，不是新的浏览器渲染后端。

## 为什么选择 Fourier Render Engine

- **确定性执行**：宿主控制绝对时间、随机种子、资源和浏览器采样，相同工程可以稳定重建。
- **增量渲染**：依赖指纹与分层缓存会复用未变化的 Scene/Template 模块、artifact 帧、已准备视觉结果和 TTS 输出，因此局部修改不必从头执行全部高成本工作。
- **高效渲染**：独立视觉任务可以并发准备，共享浏览器 runtime 避免逐帧启动，静态 artifact 只生成一张图片，没有 DOM 处理需求的普通媒体则直接交给 FFmpeg。
- **结构化而非黑盒**：Project、Scene、Template 和节点会先编译成统一 IR，错误可以定位到具体声明与资源。
- **适合复杂工程**：模块化时间线、有界并发、缓存完整性校验与 FFmpeg 合成共同支撑长视频、反复修改和批量生产。
- **预览就是同一套语义**：CLI、HTTP、Preview 与正式 Render 复用编译器和视觉运行时，减少“预览正确、导出不同”的分叉。
- **Agent 友好**：`validate`、`inspect`、稳定错误码和 `--ai` JSONL 事件让自动化可以先检查、再执行、再诊断。

如果你只需要一次性的不可编辑视频结果，通用生成模型可能更直接；如果视频需要持续修改、批量生成、组件复用和可验证交付，Fourier 的工程化执行模型更合适。

本包负责工程执行、缓存、TTS、Preview、CLI/HTTP 与工程级 FFmpeg 合成。共用的 artifact 编译与确定性 DOM 采样来自 [Fourier Core](../fourier-core/README.md)。工程声明与视觉能力开发见 [Fourier SDK](../fourier-sdk/README.zh-CN.md)，素材处理见 [Fourier Tools](../fourier-tools/README.zh-CN.md)，组件发现见 [Fourier World](../fourier-world/README.zh-CN.md)。

## 增量渲染与高效渲染

Fourier 围绕视频工程的结构做优化，而不是把每次渲染都当成一个全新的黑盒任务：

1. **为依赖建立指纹**：工程声明、Scene/Template bundle、组件源码、本地素材、字体、Motion 时间、TTS 输入、FPS 和渲染配置都会进入缓存身份。
2. **复用未变化的层**：模块原始内容、派生裁切区间、已准备视觉结果、静态 artifact 图片、动态视觉输出和合成语音都可以在输入未变化时复用。
3. **精确失效**：修改一个依赖只会使依赖它的缓存条目失效，不会丢弃无关 Scene 和组件已经完成的工作。
4. **并发准备独立任务**：视觉节点和 artifact 采样使用有界并发与共享浏览器 runtime，不会为每个节点或每一帧重新启动 Chromium。
5. **保持快速路径简单**：没有 Motion 的 Image 和 Video 直接交给 FFmpeg，只有 Text、React 与 Motion 内容进入视觉准备阶段。

这套性能模型建立在确定性之上。缓存条目包含内容哈希与渲染配置信息，使用前会校验，身份或完整性不匹配时会重新构建，从而在加速迭代的同时避免悄悄复用过期像素。

## 工程入口

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

可用节点：`Project`、`Canvas`、`Timeline`、`Group`、`Video`、`Audio`、`Image`、`Text`、`Subtitle`、`ReactLayer`、`Scene`、`Template`、`Motion`、`Transform`。

声明使用原生值：

- `content` 是字符串；`props`、`tts`、`keyframes` 是对象。
- `audio`、`enabled`、`loop` 等是 boolean。
- `after`/`with` 使用裸节点 ID。
- 媒体或模块裁切使用 `sourceIn`/`sourceOut`。
- Artifact 导出名使用 `exportName`。
- 时间支持 `30f`、`1s`、`500ms` 和 SDK `TimeValue`。

## CLI

```bash
bun run src/cli.ts validate /path/to/project/main.tsx
bun run src/cli.ts inspect /path/to/project/main.tsx
bun run src/cli.ts preview /path/to/project/main.tsx \
  --output /tmp/preview.png \
  --anchor 1s --range-start 0s --range-end 2s
bun run src/cli.ts render /path/to/project/main.tsx \
  --output /tmp/output.mp4 \
  --overwrite
```

全局安装后把 `bun run src/cli.ts` 替换为 `fourier`。`--ai` 输出稳定 JSONL 事件，适合自动化调用：

```bash
fourier --ai inspect /path/to/project/main.tsx
fourier --ai render /path/to/project/main.tsx -o /tmp/output.mp4
```

非 `main.tsx` 入口会返回 `UNSUPPORTED_PROJECT_ENTRY`。

## Artifact MP4 API

组件发布工具可以直接渲染一个已编译的 React 或 Motion artifact，不需要把它包装成视频工程。`renderVisualArtifactVideo` 是 Core 实现的兼容 facade，会驱动同一条确定性 DOM timeline，采样全部帧，再由 FFmpeg 编码为浏览器兼容的 H.264/yuv420p MP4：

```ts
import { renderVisualArtifactVideo } from "@fourier-video/render-engine";

const result = await renderVisualArtifactVideo(
  { entryPath: "/absolute/path/to/MetricPanel.tsx" },
  { output: "/tmp/MetricPanel.mp4", overwrite: true },
);

console.log(result.sha256, result.totalFrames);
```

动态 artifact 保留声明的帧数和帧率；静态 artifact 会编码为 1 秒静帧视频。透明像素默认合成到 `#101010` 背景，也可以配置 `background`、`crf`、`preset`、`ffmpegPath`、取消信号和进度回调。

## 字幕 TTS

`Subtitle` 和 `role="subtitle"` 的 `Text` 可以通过空的 `tts` 对象启用配音，
不需要传入风格提示词，也不要手工声明 `duration`：

```tsx
<Subtitle
  id="voice"
  at="0f"
  content="这段字幕会自动生成配音并匹配时长"
  tts={{}}
  x={960}
  y={950}
  width={1600}
  height={120}
  layer={20}
  font="fonts/SourceHanSansSC-Bold.otf"
  fontSize={52}
  lineHeight={1.2}
  color="#FFFFFF"
  align="center"
/>
```

`volume`、`reference` 和兼容旧服务的 `style` 都是可选字段。默认由独立 TTS
服务选择模型和音色；只有显式设置 `--tts-model`/`TTS_MODEL` 时，客户端才校验模型目录并把
`modelPath` 发送给服务。通过 `fourier tts bind --port 8765` 可以持久绑定本机服务。

## Scene 与 Template

Scene 和 Template 目录同样只发现 `main.tsx`。Scene 默认导出 `defineProject(...)`；Template 默认导出 `defineTemplate(...)`：

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
      <Canvas width={1920} height={1080} fps={30} background="#000000" colorSpace="sRGB" />
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

父工程通过 `<Template props={{ title: "Hello" }} />` 传值。schema 负责必填、未知字段、默认值和类型校验，递归 Template 循环会被拒绝。

## HTTP API

启动服务：

```bash
bun run src/server.ts
```

请求体中的 `project` 传绝对或允许的工程路径：

```json
{
  "project": "/absolute/path/to/main.tsx",
  "output": "/tmp/output.mp4",
  "overwrite": true
}
```

服务端、CLI、preview、`renderProject` 与 `validateProject` 共用同一个 TSX loader 和 Project Compiler。

## 渲染架构

```text
main.tsx + local static imports
  -> Bun bundle（绑定 SDK/React author runtime）
  -> SDK branded JSX declaration
  -> Project Compiler
  -> ResolvedProject IR
  -> React/Motion visual preparation + TTS
  -> FFmpeg plan
  -> media output
```

Scene/Template bundle 内容纳入工程指纹；渲染缓存 schema 会随入口语义变更。资源作用域、节点顺序、时间锚点、循环检测、TTS 与 FFmpeg 行为仍由现有引擎实现。

## 开发与验证

```bash
bun install
bun run typecheck
bun test
bun run browser:check
bun run test:dom
```

真实 FFmpeg 集成冒烟：

```bash
RUN_FFMPEG_TESTS=1 bun test tests/ffmpeg.test.tsx
```

基准工具也生成 `main.tsx` 工程：

```bash
fourier benchmark --resolutions 1080p --frames 12
```

更完整的创作说明见 [Fourier Agent SDK 操作手册](../fourier-sdk/docs/AGENT_SDK_GUIDE.md)。
