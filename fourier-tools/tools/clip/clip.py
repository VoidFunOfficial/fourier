from PIL import Image

from tools.runtime import MODELS, ModelSlot, local_model, select_device


class ClipMatcher:
    def __init__(self, model_path=MODELS / "clip_model"):
        self.model_path = model_path
        self.slot = ModelSlot(self._load)

    def _load(self):
        from transformers import AutoImageProcessor, AutoModelForCausalLM, AutoTokenizer

        path = local_model(self.model_path)
        model = AutoModelForCausalLM.from_pretrained(
            path, trust_remote_code=True, local_files_only=True,
        ).to(select_device()).eval()
        tokenizer = AutoTokenizer.from_pretrained(path, local_files_only=True)
        processor = AutoImageProcessor.from_pretrained(path, local_files_only=True)
        return model, tokenizer, processor

    def match(self, source, texts):
        def infer(backend):
            import torch

            model, tokenizer, processor = backend
            with Image.open(source) as image:
                image = image.convert("RGB")
                patches = (image.width // 16) * (image.height // 16)
                max_patches = next((n for n in (128, 256, 576, 784) if patches <= n), 1024)
                inputs = processor(images=image, max_num_patches=max_patches,
                                   return_tensors="pt").to(model.device)
            captions = tokenizer([s.lower() for s in texts], padding="max_length",
                                 max_length=196, truncation=True, return_tensors="pt").to(model.device)
            with torch.inference_mode():
                images = model.get_image_features(**inputs)
                labels = model.get_text_features(**captions, walk_type="long")
                images = torch.nn.functional.normalize(images, dim=-1)
                labels = torch.nn.functional.normalize(labels, dim=-1)
                scores = (images @ labels.T)[0].float().cpu().tolist()
            matches = [{"index": i, "text": text, "score": score}
                       for i, (text, score) in enumerate(zip(texts, scores))]
            return {"matches": sorted(matches, key=lambda row: row["score"], reverse=True),
                    "scoreType": "cosine_similarity"}
        return self.slot.run(infer)
