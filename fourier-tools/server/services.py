"""Media orchestration; no dependency on HTTP request or response objects."""

from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Lock

from PIL import Image, UnidentifiedImageError

from tools.clip.clip import ClipMatcher
from tools.matting import ai
from tools.matting.matting_router import remove_color_background
from tools.runtime import ModelUnavailable
from tools.scaleup.scaleup import upscale_image
from tools.transcribe.transcribe import Transcriber
from tools.tts.tts import SpeechSynthesizer


def validate_image(path):
    try:
        with Image.open(path) as image:
            if image.width * image.height > 16_000_000:
                raise ValueError("Image exceeds 16 million pixels")
            image.verify()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise ValueError("File is not a valid supported image") from exc


class MediaServices:
    def __init__(self, store):
        self.store = store
        self.transcriber = Transcriber()
        self.clip = ClipMatcher()
        self.speech = SpeechSynthesizer()
        self.scale_lock = Lock()
        self.scale_state = "unloaded"

    def capabilities(self):
        return [
            {"id": "matting.color", "endpoint": "/v1/matting", "state": "ready"},
            {"id": "matting.ai", "endpoint": "/v1/matting", "model": "BiRefNet", "state": ai.slot.state},
            {"id": "scaleup", "endpoint": "/v1/scaleup", "model": "RealESRGAN", "state": self.scale_state},
            {"id": "transcribe", "endpoint": "/v1/transcribe", "model": "iic/SenseVoiceSmall", "state": self.transcriber.slot.state},
            {"id": "clip", "endpoint": "/v1/clip", "model": "FG-CLIP2", "state": self.clip.slot.state},
            *[{"id": f"tts.{provider}", "endpoint": "/v1/tts", "state": slot.state}
              for provider, slot in self.speech.slots.items()],
        ]

    def _image(self, file_id):
        _, source = self.store.get(file_id)
        validate_image(source)
        return source

    def _audio(self, file_id):
        _, source = self.store.get(file_id)
        if source.suffix not in {".wav", ".mp3", ".flac", ".ogg", ".m4a", ".aac", ".opus", ".aiff", ".webm", ".mp4"}:
            raise ValueError("Unsupported audio container")
        return source

    def matting(self, request):
        source = self._image(request.fileId)
        with TemporaryDirectory(prefix="fourier-matting-") as temporary:
            output, mask = Path(temporary) / "subject.png", Path(temporary) / "mask.png"
            if request.method == "color":
                result, alpha = remove_color_background(
                    source, request.targetColor, request.tolerance, request.strength, output, mask,
                )
            else:
                result, alpha = ai.extract_object(source, image_size=request.imageSize)
                result.save(output)
                alpha.save(mask)
            published = self.store.add(output)
            try:
                published_mask = self.store.add(mask)
            except Exception:
                self.store.delete(published["id"])
                raise
            return {"image": published, "mask": published_mask,
                    "width": result.width, "height": result.height}

    def scaleup(self, request):
        source = self._image(request.fileId)
        with TemporaryDirectory(prefix="fourier-scaleup-") as temporary:
            output = Path(temporary) / "upscaled.png"
            with self.scale_lock:
                try:
                    result = upscale_image(source, output)
                except (ImportError, FileNotFoundError, ModelUnavailable) as exc:
                    self.scale_state = "unavailable"
                    raise ModelUnavailable("Super-resolution runtime or model is missing") from exc
                self.scale_state = "ready"
            return {"image": self.store.add(output), "width": result["width"], "height": result["height"]}

    def transcribe(self, request):
        return self.transcriber.transcribe(self._audio(request.fileId), request.language, request.useItn)

    def match(self, request):
        return self.clip.match(self._image(request.fileId), request.texts)

    def tts(self, request):
        reference = self._audio(request.referenceFileId) if request.referenceFileId else None
        with TemporaryDirectory(prefix="fourier-tts-") as temporary:
            output = Path(temporary) / "speech.wav"
            result = self.speech.synthesize(output, request.text, request.provider, reference, request.promptText)
            return {"audio": self.store.add(output), "provider": request.provider, **result}
