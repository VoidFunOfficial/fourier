# Fourier TSX 渲染基准工具

该工具会为 1080p、4K、8K 分别生成可复现的随机 Fourier TSX 工程，完成静态校验和真实
FFmpeg 渲染，最后在终端打印速度汇总，并保存 JSON/Markdown 报告。

每个 TSX 工程固定覆盖以下能力，随机种子只改变布局、颜色、动画参数和文案：

- `video`、`audio`、`image`、`text`、`subtitle`、`react`
- `parallel` 与 `sequence` Group
- Motion、多个 Transform、完整 Keyframe
- 图层、透明度、旋转、素材适配和音频混合

静态字幕不包含 TTS，因此报告测量的是渲染核心，而不是语音模型加载或合成时间。
测试图片、视频和音频由 FFmpeg 在结果目录内生成，字体会从常见 macOS/Linux
系统路径选择，也可通过 `BENCHMARK_FONT_PATH` 指定。素材生成、随机 TSX 工程和渲染前
的独立校验不计入计时；单次计时本身包含引擎内部
的解析校验、React/Motion 画面预生成和 FFmpeg 合成编码。

## 运行

全局安装后执行：

```bash
fourier benchmark
```

默认配置为每个分辨率 30 帧、30 fps、1 次计时、无预热，使用 x264
`ultrafast`。8K 仍会消耗较多内存和时间，可以先运行一个短的 1080p 冒烟测试：

```bash
fourier benchmark --resolutions 1080p --frames 12
```

更稳定的对比可增加预热和计时次数：

```bash
fourier benchmark \
  --frames 60 \
  --warmup 1 \
  --iterations 3 \
  --seed 20260727 \
  --frame-concurrency 2
```

完整参数：

```bash
fourier benchmark --help
```

## 输出

每次运行写入新的 `benchmark/results/<时间-种子>/` 目录：

```text
report.json
report.md
1080p/iteration-01/main.tsx
1080p/iteration-01/render.mp4
4k/iteration-01/main.tsx
4k/iteration-01/render.mp4
8k/iteration-01/main.tsx
8k/iteration-01/render.mp4
```

报告包含 wall-clock 耗时、引擎耗时、渲染 FPS、实时倍率、MP/s、输出大小以及
校验/画面预生成/编码的近似阶段耗时。阶段边界来自引擎进度事件，适合定位瓶颈，
总耗时和整体吞吐量才是跨机器比较的主要指标。
