"""Local ModelScope image super-resolution tool."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image


DEFAULT_MODEL_PATH = Path(__file__).resolve().parents[2] / "models" / "scaleup_model"
_pipelines: dict[str, Any] = {}


def _load_pipeline(model_path: str | Path) -> Any:
    from modelscope.pipelines import pipeline
    from modelscope.utils.constant import Tasks

    resolved = str(Path(model_path).expanduser().resolve())
    super_resolution = _pipelines.get(resolved)
    if super_resolution is None:
        super_resolution = pipeline(
            Tasks.image_super_resolution,
            model=resolved,
        )
        _pipelines[resolved] = super_resolution
    return super_resolution


def _save_modelscope_image(image: Any, output_path: Path) -> None:
    """Save ModelScope's OpenCV-style BGR/BGRA output with Pillow."""

    array = np.asarray(image)
    if array.ndim == 3 and array.shape[2] == 3:
        array = array[:, :, ::-1]
    elif array.ndim == 3 and array.shape[2] == 4:
        array = array[:, :, [2, 1, 0, 3]]
    array = np.clip(array, 0, 255).astype(np.uint8)
    Image.fromarray(array).save(output_path)


def upscale_image(
    image_path: str | Path,
    output_path: str | Path,
    model_path: str | Path = DEFAULT_MODEL_PATH,
) -> dict[str, Any]:
    """Upscale one image with the local RealESRGAN ModelScope model."""

    from modelscope.outputs import OutputKeys

    source = Path(image_path).expanduser().resolve()
    if not source.is_file():
        raise FileNotFoundError(f"input image does not exist: {source}")
    model_directory = Path(model_path).expanduser().resolve()
    if not model_directory.is_dir():
        raise FileNotFoundError(
            f"super-resolution model directory does not exist: {model_directory}"
        )

    destination = Path(output_path).expanduser().resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    result = _load_pipeline(model_directory)(str(source))
    output_image = result[OutputKeys.OUTPUT_IMG]
    _save_modelscope_image(output_image, destination)
    with Image.open(destination) as saved:
        width, height = saved.size
    return {
        "outputPath": str(destination),
        "width": width,
        "height": height,
    }


if __name__ == "__main__":
    print(DEFAULT_MODEL_PATH)
    raise SystemExit(
        "Use upscale_image(...) or run the unified project/mcp-server.py service."
    )
