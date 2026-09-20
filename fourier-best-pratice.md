# Fourier Project Best Practices

在 Fourier 中，始终按照「Scene → Component → Motion → Render」的方式构建视频。

## 核心原则

一个 Scene 表达一个完整的视觉场景。

不要把整个视频写成一个巨大组件，也不要建立复杂的全局 timeline。每个 Scene 应当能够独立开发、预览、修改和渲染。

优先复用已有组件。

开始实现前，先检查：

- 当前项目已有组件
- Fourier World 中已有组件
- 已有 Scene 是否可以组合或修改

只有现有能力无法满足需求时，才创建新的 Component。

不要重复制造 Button、Card、Chart、Browser、Terminal、Logo、Background 等已有视觉组件。

## Component

Component 负责表达：

- UI
- 视觉元素
- 布局
- 可复用视觉能力

Component 本身应尽量保持通用。

不要把整个 Scene 的业务逻辑写进 Component。

例如：

```tsx
<ProductCard />
<BrowserWindow />
<MetricChart />
<CodeEditor />
```

Scene 决定这些组件如何组合。

## Scene

Scene 是 Fourier 中最重要的组织单位。

每个 Scene 应：

- 有明确视觉目标
- 包含有限数量的核心元素
- 独立控制自己的动画
- 尽量避免依赖其他 Scene 内部状态
- 可以单独预览和渲染

例如：

```tsx
export function GrowthScene() {
  return (
    <Scene>
      <BrowserWindow />
      <MetricChart />
      <GrowthNumber />
    </Scene>
  )
}
```

不同 Scene 之间通过进入、退出和视觉连续性完成衔接，而不是建立庞大的跨场景 timeline。

## Motion

动画优先使用 FourierMotion。

使用 Agent 已经熟悉的 React / JSX / CSS / Motion 模型：

```tsx
<motion.div
  initial={{ opacity: 0, y: 24 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.6 }}
/>
```

复杂动画优先通过：

```text
animate
transition
keyframes
offset
easing
stagger
spring
```

组合完成。

不要为了动画创建新的 DSL。

不要设计复杂 timeline language。

不要模仿 After Effects 时间轴。

动画逻辑应该尽量与对应视觉组件放在一起，使 Agent 可以局部理解和修改。

## 时间组织

优先使用：

```text
Scene
  ├─ Component
  ├─ Component
  └─ Component
```

而不是：

```text
Global Timeline
  ├─ 0.0s element A
  ├─ 0.3s element B
  ├─ 1.2s element C
  ├─ 2.7s element A
  └─ ...
```

描述动画时关注视觉顺序：

```text
先出现标题，
再展开产品界面，
紧接着数据开始增长，
最后镜头聚焦最终结果。
```

具体时间由实现阶段决定。

## 修改项目

修改已有 Fourier 项目时遵循局部修改原则。

如果只需要修改：

```text
Scene03 / MetricChart
```

不要重新生成：

```text
Scene01
Scene02
Scene04
其他无关组件
```

尽量保持节点稳定，使 Fourier 可以利用增量渲染和缓存。

## 文件组织

推荐：

```text
project/
├── main
├── scenes/
│   ├── IntroScene
│   ├── ProductScene
│   └── OutroScene
├── components/
│   ├── BrowserWindow
│   ├── MetricChart
│   └── ProductCard
├── assets/
└── styles/
```

Scene 是视频结构。

Component 是视觉能力。

Motion 属于对应视觉元素。

Asset 只负责素材。

入口只负责组合整个视频。

## Agent 工作流程

收到任务后：

```text
理解视频目标
↓
拆分 Scene
↓
搜索并复用 Component
↓
组合 Scene
↓
添加 FourierMotion
↓
预览
↓
只修改存在问题的 Scene / Component
↓
Render
```

始终优先：

**Reuse > Compose > Modify > Create**

不要一开始就生成大量新代码。

## 最重要的判断

Fourier 不是一个让 Agent「编写视频时间轴」的框架。

Fourier 是一个让 Agent：

**像开发 React 应用一样开发视频。**

把视频理解成：

```text
可复用组件
+
独立场景
+
声明式 Motion
+
确定性时间
+
增量渲染
```

这就是 Fourier 项目的默认最佳实践。