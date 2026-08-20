# Fourier Agent SDK 操作手册

本文供编程 Agent 在 Fourier 工程中开发、修改和验收 React、Motion、Three.js 视觉 artifact。目标不是罗列所有 API，而是规定一条可重复执行的工程流程。完整类型与边界条件仍以 [API 文档](./API.md) 和 [开发规范](./DEVELOPMENT.md) 为准。

> SDK ABI v1.1 统一使用 `defineReact({ component })` 或 `defineMotion({ component })`；render engine 保持 ABI v1 读取兼容。

## 1. Agent 的完成标准

一个任务只有同时满足以下条件才算完成：

1. 选择了正确的 artifact 类型，默认导出唯一的 `defineReact()` 或 `defineMotion()` definition。
2. Props 由 schema 定义并推导类型，设计预览覆盖全部必填输入。
3. 输出只取决于 props、subject、本地资源、稳定 seed 和宿主绝对时间。
4. 没有绕过 SDK 直接依赖 React、Three.js、原生 WAAPI、浏览器计时器或网络。
5. 根元素尺寸、透明背景、素材加载和 Three.js 资源释放行为明确。
6. 已完成类型检查、预览、确定性测试和适用的发布前检查。
7. 最终交付说明包含改动文件、artifact 类型、验证结果以及尚未验证的风险。

## 2. 开始前先做类型决策

| 用户目标 | 选择 | 核心入口 | 时间来源 |
| --- | --- | --- | --- |
| 卡片、字幕排版、图表、UI、静态视觉 | React artifact | `defineReact` | 静态，或 Fourier timeline |
| 给图片、视频、React subject 添加入场、退场、故障、转场效果 | Motion artifact | `defineMotion` | Fourier timeline |
| 给源文本逐字、逐词或整体添加效果 | Text Motion | `defineMotion` + `textComponent` | Fourier timeline |
| WebGL 场景、模型、相机、灯光、程序化几何体 | 3D React artifact | `defineReact` + `FourierCanvas` | `onFrame` 的绝对时间 |
| 视频贴到 3D 平面并由 FFmpeg 保留视频像素 | 3D Video Motion | `defineMotion` + `videoComposition: "ffmpeg"` | `FourierCanvas.onFrame` |

决策规则：

- 组件本身就是画面内容，选 React。
- 组件接收并改变宿主 subject，选 Motion。
- Motion 需要处理 text/subtitle 原始字符串时，必须选 Text Motion；普通 `component` 不会收到原始文本。
- Three.js 只是 React artifact 的渲染实现，不是第三种 definition。
- 生产画面完全不随宿主时间变化的 React 必须声明 `static: true`。
- 不确定时先检查相邻 artifact 和 [示例目录](../example)，不要同时实现多个互斥入口。

## 3. 标准工作流

Agent 每次按下面的顺序执行。

### 3.1 读取本地上下文

1. 查找仓库规则文件、目标目录、相邻 artifact、测试和 `package.json`。
2. 确认 SDK 版本与现有 import 风格。
3. 复用项目已有的 schema 命名、画布比例、视觉 token 和本地素材。
4. 保留用户已有改动，不重写与任务无关的文件。

常用检查命令：

```bash
rg --files -g 'AGENTS.md' -g '!node_modules'
rg -n 'defineReact|defineMotion|FourierCanvas|FourierMotion' . -g '*.tsx'
git status --short
```

### 3.2 把需求转成实现合同

动手前明确：

- artifact 名称与 React/Motion/3D 类型；
- 可配置 props、默认值、范围和素材类型；
- 画布宽高、设计预览时长、背景和循环行为；
- 动画的开始态、关键态、结束态和 easing；
- 是否支持 text/subtitle；
- 3D 模型的格式、相机、光照、旋转圈数和清理策略；
- 验收时需要检查的开始、代表、结束时间点。

需求没有指定非关键视觉细节时，Agent 可以选择合理默认值，但要把它们放进 schema 或 `designPreview()`，不要散落成不可配置的魔法值。

### 3.3 创建最小 artifact

推荐目录：

```text
ComponentName/
  ComponentName.tsx
  ComponentName.test.ts
  assets/
  fonts/
  package.json          # 仅发布到 Fourier World 时需要
```

源码模块应默认导出 artifact definition。不要创建第二套 preview renderer、逐帧截图服务或单独的 preview 配置。

### 3.4 按由低到高的成本验证

1. 先运行目标文件相关测试和类型检查。
2. 再用 preview 检查开始、中间和结束状态，并拖动时间轴验证任意顺序采样。
3. 再运行确定性测试、DOM 测试和构建。
4. 只有要发布 World 时才运行 dry-run 和真实发布。

## 4. 所有 artifact 的硬性规则

### 4.1 Import 只能来自 SDK

Artifact 中的 React hook、JSX 类型、`ReactNode`、`CSSProperties`、`RefObject` 必须从以下入口导入：

```ts
import { /* React API */ } from "@fourier-video/sdk";
import { /* React API */ } from "@fourier-video/sdk/react";
import { /* Motion API */ } from "@fourier-video/sdk/motion";
import { /* Three.js + React API */ } from "@fourier-video/sdk/three";
import { Universe3D, World3D, defineCamera3D } from "@fourier-video/sdk/universe-3d";
```

禁止：

```ts
import React from "react";
import { useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
```

普通视频工程不需要自行安装 React 或 Three.js。SDK 和渲染器会持有唯一兼容版本。

### 4.2 Schema 是 props 的单一事实来源

```ts
import {
  defineSchema,
  field,
  type InferFields,
} from "@fourier-video/sdk/react";

export const panelSchema = defineSchema({
  title: field.string({ minLength: 1, default: "Fourier" }),
  value: field.number({ min: 0, max: 100, default: 72 }),
  visible: field.boolean({ default: true }),
  accent: field.color({ default: "#7c3aed" }),
  delay: field.time({ default: "0f" }),
  tone: field.enum(["calm", "active"] as const, { default: "calm" }),
  logo: field.asset({ accept: ["image/png", "image/webp"] }),
});

export type PanelProps = InferFields<typeof panelSchema>;
```

- 不另写一份重复的 props interface。
- 无 `default` 的字段是必填字段，必须在 `designPreview().props` 中给值。
- 路径或可序列化素材用 `field.asset()`。
- Artifact 的复杂 React 子树用 `field.node()`；Project Template schema 不支持该字段。
- 给字段补充 `label` 和 `description`，让人和 Agent 都能正确选择参数。

### 4.3 Design preview 是必需入口

```ts
designPreview() {
  return {
    props: {},
    composition: {
      width: 960,
      height: 540,
      durationSeconds: 3,
    },
    player: { loop: true, background: "#020617" },
  };
}
```

- 静态预览 `durationSeconds: 0`；动态预览使用 1—30 的整数秒。
- 帧率固定为 60，不要声明 `fps`。
- `props` 可以省略有默认值的字段，但必须包含所有无默认值字段。
- 普通 Motion 和 Text Motion 预览必须提供 `subject`；FFmpeg Video Motion 不提供 React subject。
- `preview()` 和 `overlay()` 只能同步描述预览，不承担实际渲染。

### 4.4 确定性是渲染合同

允许的输入：props、subject、`useFourierContext()` 的 width/height/seed、本地静态依赖，以及 Fourier 提供的绝对时间。

禁止使用：

- `fetch`、`XMLHttpRequest`、`WebSocket`、`EventSource`；
- `Date`、`performance.now()`、`Math.random()`；
- `setTimeout`、`setInterval`、`requestAnimationFrame`；
- 原生 `element.animate()`；
- 自行播放、seek 或修改音视频与 SMIL timeline；
- 初始化完成后的非引擎 DOM mutation；
- 依赖上一次采样结果的增量状态。

允许直接声明原生 `<audio>`/`<video>` 和 SVG SMIL animation；runtime 会自动发现并按宿主绝对时间暂停采样。media 素材使用本地相对 import 或 data URI，循环通过 `loop` 声明，不编写命令式播放逻辑。

需要随机视觉时只在初始化阶段使用稳定 seed：

```ts
import {
  createFourierPrng,
  useFourierContext,
} from "@fourier-video/sdk/react";

const { seed } = useFourierContext();
const random = createFourierPrng(`${seed}:component-name`);
const offsets = Array.from({ length: 8 }, () => random() * 20 - 10);
```

## 5. React artifact

### 5.1 静态 React 模板

适合卡片、徽标、排版和不随宿主时间变化的 UI。

```tsx
import {
  defineReact,
  defineSchema,
  field,
  useFourierContext,
} from "@fourier-video/sdk/react";

const schema = defineSchema({
  title: field.string({ default: "Metric" }),
  value: field.number({ default: 42 }),
  accent: field.color({ default: "#22c55e" }),
});

export default defineReact({
  name: "MetricCard",
  schema,
  static: true,
  component({ props }) {
    const { width, height } = useFourierContext();
    return (
      <div style={{
        width,
        height,
        display: "grid",
        placeItems: "center",
        color: "white",
        background: "transparent",
      }}>
        <div style={{ borderTop: `4px solid ${props.accent}` }}>
          <div>{props.title}</div>
          <strong>{props.value}</strong>
        </div>
      </div>
    );
  },
  designPreview() {
    return {
      props: {},
      composition: { width: 960, height: 540, durationSeconds: 0 },
      player: { background: "#0f172a" },
    };
  },
});
```

`static: true` 的组件不能注册 lifecycle、timeline animation、media、SMIL 或 render driver。预览时长为 0 不能代替 `static: true`。

### 5.2 动态 React 模板

复杂的精确 WAAPI 动画使用 `useFourierTimeline()`。React 最多注册一个 lifecycle。

```tsx
import {
  defineReact,
  useFourierContext,
  useFourierLifecycle,
  useFourierTimeline,
  useRef,
} from "@fourier-video/sdk/react";

export default defineReact({
  name: "EntranceCard",
  schema: {},
  component() {
    const root = useRef<HTMLDivElement>(null);
    const { width, height } = useFourierContext();
    const timeline = useFourierTimeline();

    useFourierLifecycle({
      fourierStart() {
        if (root.current === null) throw new Error("EntranceCard root is missing");
        timeline.animate(root.current, [
          { opacity: 0, transform: "translateY(36px) scale(.96)" },
          { opacity: 1, transform: "translateY(0) scale(1)" },
        ], { fill: "both", easing: "cubic-bezier(.16,1,.3,1)" });
      },
      fourierEnd() {},
    });

    return <div ref={root} style={{ width, height }}>Animated content</div>;
  },
  designPreview() {
    return {
      props: {},
      composition: { width: 960, height: 540, durationSeconds: 3 },
      player: { loop: true },
    };
  },
});
```

`timeline.animate()` 不返回原生 `Animation`。省略 `duration` 时，动画铺满宿主时长；传入时单位是毫秒。

## 6. Motion artifact

### 6.1 优先使用声明式 Fourier Motion

普通 CSS transform、opacity、filter 动画优先使用 `FourierMotion` 和 `motion.*`，无需安装 `motion` 或 `framer-motion`。

```tsx
import {
  FourierMotion,
  defineMotion,
  motion,
} from "@fourier-video/sdk/motion";

export default defineMotion({
  name: "ElegantReveal",
  schema: {},
  supportsTextMotion: false,
  component({ subject }) {
    return (
      <FourierMotion>
        <motion.div
          style={{ width: "100%", height: "100%", display: "flex" }}
          animate={[
            { opacity: 0, y: 48, filter: "blur(14px)", offset: 0 },
            { opacity: 1, y: 0, filter: "blur(0px)", offset: 0.42 },
            { opacity: 1, y: 0, filter: "blur(0px)", offset: 1 },
          ]}
          transition={{ ease: [0.16, 1, 0.3, 1], fill: "both" }}
        >
          {subject}
        </motion.div>
      </FourierMotion>
    );
  },
  designPreview() {
    return {
      props: {},
      subject: (
        <div style={{ width: 640, height: 360, background: "#7c3aed" }} />
      ),
      composition: { width: 640, height: 360, durationSeconds: 3 },
      player: { loop: true, background: "#020617" },
    };
  },
});
```

声明式 Motion 规则：

- 一个 definition 只能有一个、且必须有一个 `<FourierMotion>` 根；不能嵌套。
- 所有 `motion.*` 必须位于这个根下。
- `x/y/z` 数字单位为 px；`rotate/skew` 数字单位为 deg。
- `transition.duration/delay` 单位为秒；`useFourierTimeline` 的对应单位是毫秒。
- 同一个 keyframe 不能同时使用 `transform` 和 `x/y/scale/rotate` 等 shortcut。
- `initial={false}` 表示从元素自身 CSS 状态开始。

### 6.2 Text Motion 模板

支持文字时必须把普通 subject 和源文本实现分开。不要在 `component({ subject })` 中猜测 subject 是否为字符串。

```tsx
import {
  FourierMotion,
  defineMotion,
  motion,
  type ReactNode,
} from "@fourier-video/sdk/motion";

function Reveal({ children }: { children: ReactNode }) {
  return (
    <FourierMotion>
      <motion.div
        style={{ display: "inline-block" }}
        animate={[
          { opacity: 0, y: 24 },
          { opacity: 1, y: 0 },
        ]}
        transition={{ ease: "ease-out", fill: "both" }}
      >
        {children}
      </motion.div>
    </FourierMotion>
  );
}

export default defineMotion({
  name: "TextReveal",
  schema: {},
  supportsTextMotion: true,
  component({ subject }) {
    return <Reveal>{subject}</Reveal>;
  },
  textComponent({ text }) {
    return <Reveal>{text}</Reveal>;
  },
  designPreview() {
    return {
      props: {},
      subject: "FOURIER",
      composition: { width: 960, height: 240, durationSeconds: 3 },
      player: { loop: true },
    };
  },
});
```

当 `designPreview().subject` 是 string 时，SDK 自动调用 `textComponent`。Motion 的 `none`、`forwards`、`backwards`、`both` fill 由宿主处理，不要在 artifact 中重复实现 active 区间之外的逻辑。

### 6.3 何时改用命令式 timeline

以下情况使用 `useFourierTimeline()` 和恰好一个 `useFourierLifecycle()`：

- 多个目标需要共享动态生成的关键帧；
- 需要 `createFourierPrng()` 生成稳定故障切片；
- 声明式 shortcut 无法表达所需 CSS 属性；
- 需要精确的 delay、iterations、direction 或 property-indexed keyframes。

不要在同一 Motion 中同时让 `<FourierMotion>` 和自定义 lifecycle 各注册一次，否则会触发重复 lifecycle 错误。

## 7. Three.js / 3D artifact

### 7.1 最小 3D React 模板

所有 Three.js class、loader、React hook 和 Fourier API 都从 `/three` 导入。

```tsx
import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  FourierCanvas,
  Group,
  Mesh,
  MeshStandardMaterial,
  defineReact,
  useRef,
} from "@fourier-video/sdk/three";

export default defineReact({
  name: "RotatingCube",
  schema: {},
  component() {
    const root = useRef<Group | null>(null);

    return (
      <FourierCanvas
        ariaLabel="旋转立方体"
        style={{ background: "#020617" }}
        onCreate={({ renderer, scene, camera }) => {
          renderer.setClearColor(new Color("#020617"), 1);
          camera.position.set(0, 0, 5);
          camera.lookAt(0, 0, 0);

          const group = new Group();
          const geometry = new BoxGeometry(2, 2, 2);
          const material = new MeshStandardMaterial({ color: "#7c3aed" });
          group.add(new Mesh(geometry, material));

          const ambient = new AmbientLight(0xffffff, 1.2);
          const key = new DirectionalLight(0xffffff, 3);
          key.position.set(3, 4, 5);
          scene.add(ambient, key, group);
          root.current = group;

          return () => {
            scene.remove(ambient, key, group);
            geometry.dispose();
            material.dispose();
            root.current = null;
          };
        }}
        onFrame={({ progress }) => {
          if (root.current === null) return;
          root.current.rotation.y = progress * Math.PI * 2;
          root.current.rotation.x = progress * Math.PI * 0.25;
        }}
      />
    );
  },
  designPreview() {
    return {
      props: {},
      composition: { width: 960, height: 540, durationSeconds: 6 },
      player: { background: "#020617", loop: true },
    };
  },
});
```

3D 时间规则：

- `onCreate` 是唯一允许异步的阶段，用于加载本地 GLB/GLTF。
- `onFrame` 必须同步，并只根据当前 `timeMilliseconds`、`timeSeconds`、`progress` 或 `durationMilliseconds` 直接赋值。
- 正确：`rotation.y = progress * Math.PI * 2`。
- 错误：`rotation.y += 0.01`，因为结果依赖采样顺序和次数。
- 不调用 `requestAnimationFrame()`、`renderer.setAnimationLoop()` 或自行 `renderer.render()`；SDK 在每个采样点统一渲染。
- Fourier 拥有 canvas 尺寸和 pixel ratio；不要在组件中重新设置输出尺寸或 pixel ratio。

### 7.2 加载 GLB/GLTF

浏览器不能加载 `.blend`。先从 Blender 导出自包含 GLB/GLTF，再通过相对 import 引用：

```tsx
import modelUrl from "./assets/model.glb";
import {
  GLTFLoader,
  Group,
  Mesh,
  useRef,
} from "@fourier-video/sdk/three";

const modelRef = useRef<Group | null>(null);

// 放入 FourierCanvas.onCreate
const gltf = await new GLTFLoader().loadAsync(modelUrl);
scene.add(gltf.scene);
modelRef.current = gltf.scene;

return () => {
  scene.remove(gltf.scene);
  gltf.scene.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) material.dispose();
  });
  modelRef.current = null;
};
```

模型进入场景后应检查 bounding box，按画布构图归一化尺寸并设置相机，而不是假设模型原始单位和轴向正确。参考 [Example3D.tsx](../example/Example3D.tsx)。

### 7.3 3D Video Motion

需要把视频映射到 3D 平面时，不能把 `<video>` 作为浏览器纹理播放。应使用：

- `defineMotion({ videoComposition: "ffmpeg" })`；
- `component({ video, props })` 接收不透明 `FourierVideoHandle`；
- `FourierCanvas` 的 `videoSurface={{ video, meshRef, cornerRadiusRatio }}` 声明投影平面；
- FFmpeg 在浏览器输出的 3D 变换之后合成真实视频像素。

该模式不能声明 `supportsTextMotion`、`textComponent` 或 `overlay`，`designPreview()` 也不提供 subject。完整实现参考 [VideoPanel.tsx](../example/VideoPanel.tsx)。

### 7.4 Universe3D React 空间

需要把已有 React/Motion 视觉放进透视空间时，使用 `@fourier-video/sdk/universe-3d` 的 `Universe3D`、`World3D` 和 `defineCamera3D()`；不要为 DOM 卡片重建 WebGL texture。

- Camera3D 和 World3D 使用 `x/y/z` 位置与角度制 `rx/ry/rz`；Camera Move 只声明需要改变的轴。
- Three.js 在 module 内计算 camera/object matrix 和透视焦距，artifact 不直接导入 `three`。
- Move 仍由宿主绝对时间采样，不能重叠或使用增量状态。
- 过冲/回弹用两个连续 Move 表达：先越过目标姿态，再返回目标；不要把示例 easing 写进规范 interface。
- 普通 React children 保持 DOM 语义，可以在一个 `FourierMotion` 根下复用 `motion.*` 效果。

参考 [Universe3DCameraExample.tsx](../example/Universe3DCameraExample.tsx)。

## 8. 素材、字体和样式

- 预览素材优先从 [`placeholder`](../placeholder) 复制到组件自己的 `assets/` 或 `fonts/`。
- Placeholder 只用于可复现样例；生产素材仍通过 props、Motion subject 或项目资源输入。
- 图片、CSS、GLB/GLTF 使用相对 import 或 data URI，不依赖远程 URL。
- Three.js 图片纹理从 `/three` 导入 `TextureLoader`；它可直接接收本地图片 import，并可用 `loadManyAsync()` 并发加载。颜色贴图用 constructor 第二参数设置 `colorSpace: SRGBColorSpace`。
- 字体随工程携带，并通过本地 import + `loadFont()` 获取可直接用于 `fontFamily` 的稳定 family；不手写 `@font-face` 或 family 名，也不依赖运行机器的系统字体。
- 根元素显式设置 width/height；无需底色时保持透明。
- 图片使用明确的 width/height、`objectFit` 和裁切策略，避免固有尺寸改变构图。
- World package 的 `files` 必须覆盖入口以及全部本地依赖。

## 9. 预览与测试

### 9.1 本地预览

```bash
bunx fourier-sdk preview ./ComponentName.tsx
bunx fourier-sdk preview ./components
```

在预览中至少检查：

1. 0%、代表时间和 100% 三个状态。
2. 时间轴前后乱序拖动后，回到同一时间画面是否一致。
3. 非 16:9 或用户指定尺寸下是否溢出。
4. 背景透明、文字换行、长文本和极值 props。
5. Motion 的普通 subject 与 Text Motion 的 string subject。
6. 3D 模型加载、相机裁切、灯光、材质和循环首尾。

### 9.2 ABI v1.1 确定性测试

ABI v1.1 必须从路径打开 artifact：

```ts
import { test } from "bun:test";
import { openArtifact } from "@fourier-video/sdk/testing";

test("MetricCard is deterministic", async () => {
  const fixture = await openArtifact(
    new URL("./MetricCard.tsx", import.meta.url).pathname,
  );
  try {
    await fixture.assertDeterministic({ frames: [0, 60, 179] });
    await fixture.assertDeterministic({
      times: [{ numerator: 1n, denominator: 3n }],
    });
  } finally {
    await fixture.close();
  }
});
```

测试必须在 `finally` 或测试清理钩子中关闭 fixture。`assertDeterministic` 每次只能传非空的 `frames` 或 `times` 之一。

### 9.3 验证命令

在 SDK 仓库中按顺序运行：

```bash
bun run typecheck
bun test
bun run test:dom
bun run build
```

检查单个可编译 artifact：

```bash
fourier check ./ComponentName.tsx
```

DOM 测试需要与 Playwright `1.62.0` 对应的 Chromium：

```bash
bunx playwright install chromium
```

Agent 不得把浏览器缺失、类型错误或测试失败描述为“已通过”。如果环境阻止某项验证，应明确记录未运行的命令和原因。

## 10. 常见错误与修复

| 错误或症状 | 原因 | 修复 |
| --- | --- | --- |
| `TEXT_MOTION_CAPABILITY_REQUIRED` | Motion 未声明文本能力 | 显式写 `supportsTextMotion: false/true` |
| `TEXT_MOTION_IMPLEMENTATION_REQUIRED` | 声明支持文本但缺少 `textComponent` | 同时实现普通 subject 和源文本入口 |
| `FOURIER_LIFECYCLE_REQUIRED` | Motion 没有 lifecycle | 添加一个 `<FourierMotion>` 或一个 `useFourierLifecycle()` |
| `DUPLICATE_FOURIER_LIFECYCLE` | 同一 artifact 注册多个 lifecycle | 只保留一个根或合并注册逻辑 |
| `FOURIER_MOTION_ROOT_REQUIRED` | `motion.*` 不在根下 | 用一个 `<FourierMotion>` 包裹所有 motion 元素 |
| `NESTED_FOURIER_MOTION_ROOT` | `FourierMotion` 被嵌套 | 上移并合并为一个根 |
| `UNREGISTERED_WAAPI_ANIMATION` | 调用了 `element.animate()` | 改用 `useFourierTimeline().animate()` |
| `UNSUPPORTED_DOM_TIMELINE_API` | 使用网络、timer、媒体或其他禁用 API | 改为本地资源和宿主绝对时间 |
| `DOM_TIMELINE_MUTATED` | 初始化后 DOM 或动画清单漂移 | 把结构和 animation 注册固定在初始化阶段 |
| `FOURIER_RENDER_FRAME_ASYNC` | `onFrame` 返回 Promise | 资源移到 `onCreate` 加载，`onFrame` 保持同步 |
| 3D 拖动时间轴后结果不同 | 使用 `+=` 等累积更新 | 用当前绝对时间直接计算 transform |
| 本地能看、正式渲染丢素材 | 使用远程 URL、系统字体或遗漏 package files | 改为本地 import，并将依赖加入 `files` |
| 模型不显示 | 直接使用 `.blend`、尺度异常或相机未对准 | 导出 GLB/GLTF，计算 bounds，归一化并调整相机 |
| `CHROMIUM_NOT_INSTALLED` | 缺少固定 Playwright Chromium | 安装对应 Chromium 后重试 |

## 11. 发布到 Fourier World

只有需要发布的独立组件目录才需要 `package.json`。其 `name`、`version`、`files` 和 `fourier` 元数据必须与 artifact 一致，尤其要为 Agent 写清楚：

- `fourier.instruction`：什么时候应该选它；
- `fourier.negativeUseCases`：什么时候不应该选它；
- `fourier.useCases`、`tags`、`style`：搜索和匹配依据。

在重复实现能力前，Agent 可以先对已发布组件做语义检索；检索是只读操作且不要求登录：

```bash
fourier-sdk search "产品发布的电影感标题动画" --type motion --style cinematic --json
```

Agent 选择结果时要同时检查 `instruction`、`negativeUseCases`、`downloadable`、`match.reasons` 和语义/关键词分数。找到合适组件后再运行 `fourier-sdk add <packageName>`；`search` 本身不会修改工程或安装组件。

先做无服务器写入的完整检查：

```bash
fourier-sdk publish ./ComponentName --dry-run
```

再由用户明确要求并完成登录后发布：

```bash
fourier-sdk login --email author@example.com
fourier-sdk publish ./ComponentName
```

发布会产生外部写入；Agent 不应仅因“开发完成”而自行执行真实发布。完整清单见 [Fourier World 发布规范](./PUBLISHING.md)。

## 12. Agent 最终交付模板

```text
已完成：<artifact 名称与类型>

改动：
- <文件>: <实现内容>

关键决策：
- <为什么选 React / Motion / Text Motion / 3D>
- <时间和素材如何保证确定性>

验证：
- PASS <实际运行的命令>
- NOT RUN <未运行命令及原因>

使用方式：
- <preview 命令或导入方式>
```

不得声称未执行的检查已经通过，也不要用笼统的“应该没问题”代替具体结果。

## 13. 参考实现

- 静态复杂 React：[Windows7Window.tsx](../example/Windows7Window.tsx)
- 声明式 Motion：[ElegantEntranceMotion.tsx](../example/ElegantEntranceMotion.tsx)
- 稳定随机故障效果：[GlitchMotion.tsx](../example/GlitchMotion.tsx)
- Text Motion：[TextGlowMotion.tsx](../example/TextGlowMotion.tsx)
- Three.js GLB 场景：[Example3D.tsx](../example/Example3D.tsx)
- 3D Video Motion：[VideoPanel.tsx](../example/VideoPanel.tsx)
- SDK API：[API.md](./API.md)
- 开发与测试约束：[DEVELOPMENT.md](./DEVELOPMENT.md)
- World 发布：[PUBLISHING.md](./PUBLISHING.md)
