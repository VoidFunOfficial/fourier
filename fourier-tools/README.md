# Fourier Tools

English | [简体中文](./README.zh-CN.md)

**Media acquisition and processing capabilities for video agents.**

The Render Engine answers “how should this be presented reliably?” Fourier Tools answers “where should the media come from, and how should it be prepared?” It keeps matting, upscaling, and external-model capabilities separate from visual design so an agent can prepare assets before passing them to SDK components and the Render Engine.

## Why Fourier Tools

- **Media processing is decoupled from design:** changing a model or provider does not require rewriting Projects, Scenes, or components.
- **Inputs and outputs are traceable:** tools operate on explicit files and parameters, so results can be cached, inspected, and reused.
- **Local-model friendly:** current capabilities can run against repository-local models, reducing runtime network dependencies and improving reproducibility.
- **Composable by agents:** small, explicit function boundaries let an agent build workflows such as search → matting → upscaling → entrance animation.

## Current capabilities

| Capability | Entry point | Description |
| --- | --- | --- |
| Color background removal | `tools/matting/matting_router.py` | Pillow/NumPy implementation that writes a transparent PNG and alpha mask |
| AI matting | `tools/matting/BiRefNet/matting_ai.py` | Uses local BiRefNet weights and selects CUDA, MPS, or CPU automatically |
| Image upscaling | `tools/scaleup/scaleup.py` | Loads a local RealESRGAN model through ModelScope and writes the enlarged result |
| Local model assets | `models/` | Contains matting, upscaling, CLIP, and speech-related models; not every model is exposed as a public Tool yet |

> This directory is currently a capability prototype and local-model collection. It does not yet provide a unified dependency manifest, CLI, or service entry point, and the root `main.py` is not implemented. Install dependencies for the specific capability you use and call its module directly.

## Examples

Run these examples from `fourier-tools`. Basic color removal requires `numpy` and `Pillow`:

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

Use the local BiRefNet model for AI matting:

```python
from tools.matting.matting_router import matting

subject, mask = matting("input.png", "ai", device="auto")
subject.save("output/subject.png")
mask.save("output/mask.png")
```

AI matting also requires compatible PyTorch, Transformers, and model dependencies. The first load is slower; model instances are reused in-process by model path and device.

Use the local upscaling model:

```python
from tools.scaleup.scaleup import upscale_image

result = upscale_image("input.png", "output/upscaled.png")
print(result)  # outputPath, width, height
```

Upscaling also requires ModelScope and its model runtime dependencies.

## Directory layout

```text
fourier-tools/
├── models/            # Local model weights and model-specific documentation
├── tools/
│   ├── matting/       # Color removal and BiRefNet AI matting
│   └── scaleup/       # RealESRGAN image upscaling
└── main.py            # Reserved unified entry point; currently unimplemented
```

## Relationship to the other projects

Tools does not decide visual design and does not render video directly. The recommended data flow is:

```text
Raw media → Fourier Tools → reproducible project asset → SDK Scene/component → Render Engine
```

Once a capability becomes a stable Tool, an agent can use it to prepare media. Presentation remains the responsibility of components created with the [Fourier SDK](../fourier-sdk/README.md) and discovered through [Fourier World](../fourier-world/README.md).

