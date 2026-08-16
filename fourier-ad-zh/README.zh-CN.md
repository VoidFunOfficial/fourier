# Fourier Ad

[English](./README.md) | 简体中文

**用一支完整广告片展示 Fourier 如何工作。**

Fourier Ad 是一个可直接交给 Render Engine 的 TSX 视频工程。它把长视频拆成独立 Scene，在根时间线上组织画面、背景音乐和音效，用来验证 Fourier 在真实项目中的组合能力，而不是只展示孤立的组件示例。

## 为什么用 Fourier 制作这支广告

- **长视频仍然可读**：根 `main.tsx` 只负责 Scene 顺序和全局音频，各 Scene 管理自己的视觉实现。
- **修改影响可控**：文案、场景、素材和音效都有明确位置，Agent 可以定位并修改一个局部。
- **时间关系明确**：`at`、`after` 和帧单位直接表达剪辑关系，不依赖隐藏的编辑器状态。
- **组件可以复用**：Scene 可以调用 SDK artifact、Motion 和本地视觉资源，而不是为每条视频从零生成全部代码。
- **交付可以验证**：同一个工程可以先 `validate`、`inspect` 或生成静态预览，再执行最终渲染。

## 工程结构

```text
fourier-ad/
├── main.tsx       # 根 Project、Scene 编排与全局音频时间线
├── scenes/        # 各段独立 Scene，每个有效 Scene 以 main.tsx 为入口
├── components/    # 工程内可复用视觉组件
├── motions/       # 工程内 Motion
├── pic/           # 图片素材
├── fonts/         # 本地字体
├── sfx/           # 背景音乐与音效
└── tsconfig.json  # TSX 与类型检查配置
```

根工程输出为 `1920 × 1080`、`30 fps`、`48 kHz` 音频。Scene 通过 `after` 串联，全局音乐与关键动作音效在根时间线上统一对齐。

## 校验与渲染

先在 monorepo 根目录安装依赖和 Chromium：

```bash
bun install
bunx playwright install chromium
```

然后从根目录运行：

```bash
# 检查声明、素材与时间线
bun run fourier-render-engine/src/cli.ts validate fourier-ad/main.tsx

# 查看求解后的工程结构
bun run fourier-render-engine/src/cli.ts inspect fourier-ad/main.tsx

# 输出视频
bun run fourier-render-engine/src/cli.ts render fourier-ad/main.tsx \
  --output /tmp/fourier-ad.mp4 \
  --overwrite
```

生成静态设计预览时需要明确采样点和标注区间：

```bash
bun run fourier-render-engine/src/cli.ts preview fourier-ad/main.tsx \
  --output /tmp/fourier-ad-preview.png \
  --anchor 10s \
  --range-start 9s \
  --range-end 11s \
  --overwrite
```

## 如何继续创作

1. 在 `scenes/<name>/main.tsx` 中创建或修改一个 Scene。
2. 将图片、字体、视频和音频放在工程内，并使用相对路径引用。
3. 在根 `main.tsx` 中用 `at`、`after` 或 `with` 组织 Scene。
4. 先运行 `validate` 和 `inspect`，确认时间线与资源无误。
5. 渲染最终视频；需要 Agent 消费进度与错误时加上 `--ai`。

工程声明与组件开发分别参见 [Render Engine](../fourier-render-engine/README.zh-CN.md) 和 [Fourier SDK](../fourier-sdk/README.zh-CN.md)。
