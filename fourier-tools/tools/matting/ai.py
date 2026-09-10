"""BiRefNet adapter owned by Fourier Tools, independent of the nested checkout."""

import numpy as np
from threading import Lock
from PIL import Image, ImageChops

from tools.runtime import MODELS, ModelSlot, local_model, select_device


def _load(model_path=MODELS / "matting_model", device="auto"):
    from transformers import AutoModelForImageSegmentation
    return AutoModelForImageSegmentation.from_pretrained(
        local_model(model_path), trust_remote_code=True, local_files_only=True,
    ).to(select_device() if device == "auto" else device).eval()


slot = ModelSlot(_load)
_slots = {}
_slots_lock = Lock()


def extract_object(image_path, model_path=MODELS / "matting_model", device="auto", image_size=1024):
    if not 64 <= image_size <= 2048:
        raise ValueError("image_size must be between 64 and 2048")

    def infer(model):
        import torch

        with Image.open(image_path) as source:
            image = source.convert("RGBA")
        resized = image.convert("RGB").resize((image_size, image_size), Image.Resampling.BILINEAR)
        array = np.asarray(resized, dtype=np.float32) / 255.0
        tensor = torch.from_numpy(array).permute(2, 0, 1)
        tensor = (tensor - torch.tensor([.485, .456, .406])[:, None, None]) / torch.tensor([.229, .224, .225])[:, None, None]
        param = next(model.parameters())
        tensor = tensor.unsqueeze(0).to(device=param.device, dtype=param.dtype)
        with torch.inference_mode():
            mask = model(tensor)[-1].sigmoid()[0].squeeze().float().cpu().numpy()
        mask = Image.fromarray(np.rint(np.clip(mask, 0, 1) * 255).astype(np.uint8)).resize(
            image.size, Image.Resampling.BILINEAR)
        mask = ImageChops.multiply(mask, image.getchannel("A"))
        image.putalpha(mask)
        return image, mask
    selected = slot
    if model_path != MODELS / "matting_model" or device != "auto":
        with _slots_lock:
            key = (str(model_path), device)
            if key not in _slots:
                _slots[key] = ModelSlot(lambda: _load(model_path, device))
            selected = _slots[key]
    return selected.run(infer)
