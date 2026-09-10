"""Lazy, serialized model access shared by HTTP and direct Python callers."""

from pathlib import Path
from threading import RLock

MODELS = Path(__file__).resolve().parents[1] / "models"


class ModelUnavailable(RuntimeError):
    pass


class ModelSlot:
    def __init__(self, loader):
        self.loader = loader
        self.model = None
        self.lock = RLock()
        self.state = "unloaded"

    def run(self, operation):
        # Protect initialization AND inference: most upstream pipelines mutate caches.
        with self.lock:
            if self.model is None:
                self.state = "loading"
                try:
                    self.model = self.loader()
                except Exception as exc:
                    self.state = "unavailable"
                    raise ModelUnavailable("Model or runtime could not be loaded") from exc
                self.state = "ready"
            return operation(self.model)


def local_model(path):
    path = Path(path).expanduser().resolve()
    if not path.is_dir():
        raise FileNotFoundError(f"Model directory does not exist: {path}")
    return str(path)


def select_device():
    import torch

    if torch.cuda.is_available():
        return "cuda"
    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return "mps"
    return "cpu"
