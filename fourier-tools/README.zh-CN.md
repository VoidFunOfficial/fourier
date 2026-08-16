# Fourier Tools

[English](./README.md) | 简体中文

**为视频 Agent 提供素材获取与加工能力。**

Render Engine 解决“如何稳定呈现”，Fourier Tools 解决“素材从哪里来、如何变成可用状态”。它把抠图、超分和外部模型等能力从视频设计中拆开，让 Agent 可以先准备素材，再交给 SDK 组件与 Render Engine 使用。

## 为什么选择 Fourier Tools

- **素材处理与视觉设计解耦**：换模型或服务不会迫使 Project、Scene 和组件改写。
- **输入输出可追踪**：Tool 以明确的文件和参数工作，结果可以缓存、检查并再次使用。
- **本地模型优先**：当前能力可以使用仓库内模型运行，减少运行时网络依赖并提高可复现性。
- **适合 Agent 调度**：小而明确的函数边界便于 Agent 组合成“搜索 → 抠图 → 超分 → 入场动画”之类的流程。

## 当前能力

| 能力 | 入口 | 说明 |
| --- | --- | --- |
| 指定颜色背景移除 | `tools/matting/matting_router.py` | 基于 Pillow 与 NumPy，输出透明 PNG 和 alpha mask |
| AI 抠图 | `tools/matting/BiRefNet/matting_ai.py` | 使用本地 BiRefNet 权重，支持自动选择 CUDA、MPS 或 CPU |
| 图片超分 | `tools/scaleup/scaleup.py` | 通过 ModelScope 加载本地 RealESRGAN 模型并输出放大结果 |
| 本地模型资产 | `models/` | 包含抠图、超分、CLIP 与语音相关模型；并非所有模型都已接入公开 Tool |

> 当前目录是能力原型与本地模型集合：尚未提供统一的依赖清单、CLI 或服务入口，根目录 `main.py` 也尚未实现。请按所用能力安装 Python 依赖，并直接调用对应模块。

## 使用示例

在 `fourier-tools` 目录下运行。基础颜色抠图需要 `numpy` 和 `Pillow`：

```python
from tools.matting.matting_router import remove_color_background

remove_color_background(
    "input.png",
    target_color=(255, 255, 255),
    tolerance=30,
    output_path="output/subject.png",
    mask_path="output/mask.png",
)
```

使用本地 BiRefNet 模型进行 AI 抠图：

```python
from tools.matting.matting_router import matting

subject, mask = matting("input.png", "ai", device="auto")
subject.save("output/subject.png")
mask.save("output/mask.png")
```

AI 抠图还需要兼容版本的 PyTorch、Transformers 及模型依赖。首次加载模型会比后续调用慢；进程内会按模型路径与设备复用实例。

使用本地超分模型：

```python
from tools.scaleup.scaleup import upscale_image

result = upscale_image("input.png", "output/upscaled.png")
print(result)  # outputPath、width、height
```

超分能力还需要 ModelScope 及其模型运行依赖。

## 目录结构

```text
fourier-tools/
├── models/            # 本地模型权重与各模型说明
├── tools/
│   ├── matting/       # 颜色背景移除与 BiRefNet AI 抠图
│   └── scaleup/       # RealESRGAN 图片超分
└── main.py            # 预留的统一入口，当前未实现
```

## 与其他子项目的关系

Tools 不负责决定画面设计，也不直接渲染视频。推荐的数据流是：

```text
原始素材 → Fourier Tools → 工程内可复现素材 → SDK Scene/组件 → Render Engine
```

当某项能力形成稳定 Tool 后，可以让 Agent 调用它准备素材；表现方式仍由 [Fourier SDK](../fourier-sdk/README.zh-CN.md) 与 [Fourier World](../fourier-world/README.zh-CN.md) 中的组件决定。
