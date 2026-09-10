import io
import subprocess
import sys
from pathlib import Path
from types import ModuleType, SimpleNamespace

import numpy as np
import pytest
import soundfile as sf
from fastapi.testclient import TestClient
from PIL import Image

from server.app import create_app
from tools.matting import ai
from tools.runtime import ModelSlot
from tools.scaleup import scaleup
from tools.transcribe.transcribe import Transcriber


@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(tmp_path)) as client:
        yield client


def upload_image(client):
    data = io.BytesIO()
    Image.new("RGB", (8, 6), "red").save(data, format="PNG")
    return client.post("/v1/files", files={"file": ("input.png", data.getvalue())}).json()["id"]


def upload_audio(client):
    data = io.BytesIO()
    sf.write(data, np.zeros(800), 16000, format="WAV")
    return client.post("/v1/files", files={"file": ("prompt.wav", data.getvalue())}).json()["id"]


def test_server_import_does_not_import_model_runtimes():
    result = subprocess.run([sys.executable, "-c", "import main, sys; assert not {'torch', 'funasr', 'transformers', 'modelscope', 'voxcpm', 'cosyvoice'} & sys.modules.keys()"],
                            cwd=Path(__file__).resolve().parents[1], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr


def test_sensevoice_loader_uses_modelscope_and_vad(monkeypatch):
    calls = []
    funasr = ModuleType("funasr")
    funasr.AutoModel = lambda **kwargs: calls.append(kwargs) or object()
    post = ModuleType("funasr.utils.postprocess_utils")
    post.rich_transcription_postprocess = str
    monkeypatch.setitem(sys.modules, "funasr", funasr)
    monkeypatch.setitem(sys.modules, "funasr.utils.postprocess_utils", post)
    model = Transcriber("iic/SenseVoiceSmall")
    model._load()
    assert calls[0]["model"] == "iic/SenseVoiceSmall"
    assert calls[0]["hub"] == "ms"
    assert calls[0]["trust_remote_code"] is False
    assert calls[0]["vad_model"] == "fsmn-vad"


def test_scaleup_bgr_conversion_http(client, monkeypatch, tmp_path):
    outputs = ModuleType("modelscope.outputs")
    outputs.OutputKeys = SimpleNamespace(OUTPUT_IMG="output_img")
    monkeypatch.setitem(sys.modules, "modelscope.outputs", outputs)
    class Pipeline:
        def __call__(self, path):
            return {"output_img": np.full((12, 16, 3), [0, 0, 255], dtype=np.uint8)}
    monkeypatch.setattr(scaleup, "_load_pipeline", lambda _: ModelSlot(Pipeline))
    # Use a temporary model directory; no dependence on untracked local weights.
    import server.services as services
    monkeypatch.setattr(services, "upscale_image", lambda source, output: scaleup.upscale_image(source, output, tmp_path))
    response = client.post("/v1/scaleup", json={"fileId": upload_image(client)})
    assert response.status_code == 200
    result = response.json()
    assert (result["width"], result["height"]) == (16, 12)
    with Image.open(io.BytesIO(client.get(result["image"]["url"]).content)) as image:
        assert image.getpixel((0, 0)) == (255, 0, 0)


def test_ai_matting_resizes_mask_http(client, monkeypatch):
    import torch
    class Model:
        def parameters(self):
            yield torch.zeros(1)
        def __call__(self, tensor):
            assert tensor.shape == (1, 3, 64, 64)
            return [torch.full((1, 1, 64, 64), 20.)]
    monkeypatch.setattr(ai, "slot", ModelSlot(Model))
    response = client.post("/v1/matting", json={"fileId": upload_image(client), "imageSize": 64})
    assert response.status_code == 200
    with Image.open(io.BytesIO(client.get(response.json()["mask"]["url"]).content)) as mask:
        assert mask.size == (8, 6)
        assert mask.getextrema() == (255, 255)


def test_clip_normalizes_and_ranks_http(client):
    import torch
    class Batch(dict):
        def to(self, device):
            return self
    class Model:
        device = "cpu"
        def get_image_features(self, **kwargs):
            return torch.tensor([[2., 0.]])
        def get_text_features(self, **kwargs):
            assert kwargs["walk_type"] == "long"
            return torch.tensor([[0., 3.], [4., 0.]])
    client.app.state.services.clip.slot.loader = lambda: (
        Model(), lambda *args, **kwargs: Batch(), lambda **kwargs: Batch(),
    )
    response = client.post("/v1/clip", json={"fileId": upload_image(client), "texts": ["blue", "red"]})
    assert response.status_code == 200
    assert response.json()["matches"] == [{"index": 1, "text": "red", "score": 1.0},
                                          {"index": 0, "text": "blue", "score": 0.0}]


@pytest.mark.parametrize("with_reference", [False, True])
def test_voxcpm_generates_downloadable_wav(client, with_reference):
    calls = []
    class Model:
        tts_model = SimpleNamespace(sample_rate=48000)
        def generate(self, **kwargs):
            calls.append(kwargs)
            return np.sin(np.linspace(0, 100, 4800)).astype(np.float32) * .25
    client.app.state.services.speech.slots["voxcpm"].loader = Model
    body = {"text": "你好 Fourier"}
    if with_reference:
        body.update(referenceFileId=upload_audio(client), promptText="参考文本")
    response = client.post("/v1/tts", json=body)
    assert response.status_code == 200
    result = response.json()
    assert result["sampleRate"] == 48000 and result["duration"] == .1
    audio, rate = sf.read(io.BytesIO(client.get(result["audio"]["url"]).content))
    assert rate == 48000 and len(audio) == 4800 and abs(audio).max() > .2
    if with_reference:
        assert calls[0]["reference_wav_path"] == calls[0]["prompt_wav_path"]
        assert calls[0]["prompt_text"] == "参考文本"
    else:
        assert "reference_wav_path" not in calls[0]


@pytest.mark.parametrize("prompt", [None, "参考文本"])
def test_cosyvoice_concatenates_all_chunks(client, prompt):
    import torch
    calls = []
    class Model:
        sample_rate = 24000
        def inference_zero_shot(self, text, prompt_text, reference, stream):
            calls.append(("zero_shot", prompt_text, stream))
            yield {"tts_speech": torch.ones(1, 2400) * .1}
            yield {"tts_speech": torch.ones(1, 1200) * .2}
        def inference_cross_lingual(self, text, reference, stream):
            calls.append(("cross_lingual", None, stream))
            yield {"tts_speech": torch.ones(1, 3600) * .1}
    client.app.state.services.speech.slots["cosyvoice"].loader = Model
    response = client.post("/v1/tts", json={"text": "hello", "provider": "cosyvoice",
                                            "referenceFileId": upload_audio(client), "promptText": prompt})
    assert response.status_code == 200
    result = response.json()
    assert result["duration"] == .15
    audio, rate = sf.read(io.BytesIO(client.get(result["audio"]["url"]).content))
    assert rate == 24000 and len(audio) == 3600
    assert calls[0] == ("zero_shot" if prompt else "cross_lingual", prompt, False)


def test_empty_tts_output_does_not_publish_files(client):
    class Model:
        tts_model = SimpleNamespace(sample_rate=48000)
        def generate(self, **kwargs):
            return np.array([])
    client.app.state.services.speech.slots["voxcpm"].loader = Model
    with TestClient(client.app, raise_server_exceptions=False) as connection:
        result = connection.post("/v1/tts", json={"text": "hello"})
    assert result.status_code == 500
    assert not list(client.app.state.store.root.iterdir())
