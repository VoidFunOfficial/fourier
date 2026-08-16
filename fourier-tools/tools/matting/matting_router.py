"""Background-removal tools.

The lightweight colour-based implementation only depends on Pillow and NumPy.
The BiRefNet implementation is imported lazily so the MCP server can start
without loading a model or importing PyTorch.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Sequence

import numpy as np
from PIL import Image, ImageFilter


def _validated_color(target_color: Sequence[int]) -> tuple[int, int, int]:
    if len(target_color) != 3:
        raise ValueError("target_color must contain exactly three RGB values")
    color = tuple(int(value) for value in target_color)
    if any(value < 0 or value > 255 for value in color):
        raise ValueError("target_color values must be between 0 and 255")
    return color


def remove_color_background(
    image_path: str | Path,
    target_color: Sequence[int] = (255, 255, 255),
    tolerance: float = 30,
    strength: float = 1.0,
    output_path: str | Path = "result.png",
    mask_path: str | Path = "mask.png",
) -> tuple[Image.Image, Image.Image]:
    """Remove pixels close to an RGB colour and save an RGBA image plus mask.

    ``strength`` controls how much of the matching colour is removed. At 1.0,
    pixels exactly equal to ``target_color`` become fully transparent. Pixels
    at least ``tolerance`` RGB-distance away remain opaque.
    """

    if tolerance <= 0:
        raise ValueError("tolerance must be greater than 0")
    if not 0 <= strength <= 1:
        raise ValueError("strength must be between 0 and 1")

    source = Path(image_path).expanduser().resolve()
    if not source.is_file():
        raise FileNotFoundError(f"input image does not exist: {source}")

    rgb_color = _validated_color(target_color)
    image = Image.open(source).convert("RGB")
    image_array = np.asarray(image, dtype=np.float32)
    target = np.asarray(rgb_color, dtype=np.float32)
    distance = np.linalg.norm(image_array - target, axis=2)

    similarity = np.clip(1.0 - distance / float(tolerance), 0.0, 1.0)
    alpha = np.rint(255.0 * (1.0 - similarity * strength)).astype(np.uint8)
    alpha_image = Image.fromarray(alpha, mode="L").filter(
        ImageFilter.GaussianBlur(radius=1)
    )

    result = image.copy()
    result.putalpha(alpha_image)

    destination = Path(output_path).expanduser().resolve()
    mask_destination = Path(mask_path).expanduser().resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    mask_destination.parent.mkdir(parents=True, exist_ok=True)
    result.save(destination)
    alpha_image.save(mask_destination)
    return result, alpha_image


def matting(
    image_path: str | Path,
    matting_method: str,
    **kwargs: Any,
) -> tuple[Image.Image, Image.Image]:
    """Dispatch to the colour or AI background-removal implementation."""

    if matting_method == "color":
        return remove_color_background(image_path, **kwargs)
    if matting_method == "ai":
        from .BiRefNet.matting_ai import extract_object

        return extract_object(image_path, **kwargs)
    raise ValueError(f"unsupported matting method: {matting_method}")
