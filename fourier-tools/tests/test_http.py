import io
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Lock
from time import sleep

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from server.app import create_app
from server.files import FileStore
from tools.runtime import ModelSlot, ModelUnavailable


def png(color=(255, 255, 255, 255)):
    data = io.BytesIO()
    Image.new("RGBA", (12, 8), color).save(data, format="PNG")
    return data.getvalue()


@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(tmp_path), raise_server_exceptions=False) as client:
        yield client


def upload(client, data=None, name="test.png"):
    response = client.post("/v1/files", files={"file": (name, data if data is not None else png())})
    assert response.status_code == 201, response.text
    return response.json()


def test_discovery_does_not_load_models(client):
    assert client.get("/health").json()["status"] == "ok"
    tools = client.get("/v1/tools").json()["tools"]
    assert len(tools) == 7
    assert all(tool["state"] == "unloaded" for tool in tools if tool["id"] != "matting.color")
    paths = client.get("/openapi.json").json()["paths"]
    assert all(f"/v1/{name}" in paths for name in ("matting", "scaleup", "transcribe", "clip", "tts"))


def test_file_lifecycle_and_persistence(client, tmp_path):
    record = upload(client, name="../../test.png")
    assert record["name"] == "test.png"
    assert client.get(record["url"]).content == png()
    assert client.get(f"/v1/files/{record['id']}").json() == record
    assert FileStore(tmp_path).get(record["id"])[0] == record
    assert client.delete(f"/v1/files/{record['id']}").status_code == 204
    assert client.get(record["url"]).status_code == 404


def test_real_color_matting_and_reuse(client):
    record = upload(client)
    response = client.post("/v1/matting", json={"fileId": record["id"], "method": "color"})
    assert response.status_code == 200, response.text
    result = response.json()
    assert (result["width"], result["height"]) == (12, 8)
    with Image.open(io.BytesIO(client.get(result["image"]["url"]).content)) as image:
        assert image.mode == "RGBA"
        assert image.getchannel("A").getextrema() == (0, 0)
    with Image.open(io.BytesIO(client.get(result["mask"]["url"]).content)) as mask:
        assert mask.mode == "L"
        assert mask.getextrema() == (0, 0)
    assert client.post("/v1/matting", json={"fileId": result["image"]["id"], "method": "color"}).status_code == 200


def test_existing_alpha_is_preserved(client):
    record = upload(client, png((255, 0, 0, 50)))
    response = client.post("/v1/matting", json={"fileId": record["id"], "method": "color", "strength": 0})
    with Image.open(io.BytesIO(client.get(response.json()["image"]["url"]).content)) as image:
        assert image.getchannel("A").getextrema() == (50, 50)


@pytest.mark.parametrize("endpoint,body", [
    ("matting", {"fileId": "a" * 32, "tolerance": 0}),
    ("matting", {"fileId": "a" * 32, "targetColor": [256, 0, 0]}),
    ("matting", {"fileId": "a" * 32, "targetColor": [0.5, 0, 0]}),
    ("matting", {"fileId": "../../etc/passwd"}),
    ("scaleup", {"fileId": "a" * 32, "outputPath": "/tmp/test"}),
    ("transcribe", {"fileId": "a" * 32, "language": "invalid"}),
    ("clip", {"fileId": "a" * 32, "texts": []}),
    ("clip", {"fileId": "a" * 32, "texts": ["  "]}),
    ("tts", {"text": " "}),
    ("tts", {"text": "hello", "provider": "cosyvoice"}),
    ("tts", {"text": "hello", "promptText": "reference"}),
])
def test_validation(client, endpoint, body):
    response = client.post(f"/v1/{endpoint}", json=body)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_request"


def test_bad_media_missing_and_oversize(client, tmp_path):
    assert client.post("/v1/scaleup", json={"fileId": "a" * 32}).status_code == 404
    record = upload(client, b"not an image")
    assert client.post("/v1/matting", json={"fileId": record["id"], "method": "color"}).status_code == 422
    assert client.post("/v1/transcribe", json={"fileId": record["id"]}).status_code == 422
    with TestClient(create_app(tmp_path / "small", max_file_bytes=4)) as small:
        assert small.post("/v1/files", files={"file": ("x.bin", b"12345")}).status_code == 413
        assert small.post("/v1/files", files={"file": ("x.bin", b"")}).status_code == 422
    assert not list((tmp_path / "small").iterdir())


def test_symlink_cannot_escape_store(client, tmp_path):
    record = upload(client)
    directory = tmp_path / record["id"]
    data = next(directory.glob("data.*"))
    data.unlink()
    data.symlink_to(Path(__file__))
    assert client.get(record["url"]).status_code == 404


def test_request_limit_before_multipart_storage(tmp_path):
    with TestClient(create_app(tmp_path, max_file_bytes=4)) as client:
        response = client.post("/v1/files", files={"file": ("large.wav", b"x" * (1024 * 1024 + 5))})
        assert response.status_code == 413
    assert not list(tmp_path.iterdir())


def test_chunked_request_limit_without_content_length(tmp_path):
    def chunks():
        yield b'{"text":"'
        yield b"x" * (1024 * 1024 + 5)
        yield b'"}'
    with TestClient(create_app(tmp_path, max_file_bytes=4)) as client:
        response = client.post("/v1/tts", content=chunks(), headers={"Content-Type": "application/json"})
        assert response.status_code == 413
        assert response.json()["error"]["code"] == "file_too_large"


def test_transcribe_http_dispatch_and_unavailable(client):
    service = client.app.state.services
    record = upload(client, b"sample", "speech.wav")
    calls = []
    class Model:
        def generate(self, **kwargs):
            calls.append(kwargs)
            return [{"text": "<|zh|><|HAPPY|><|Speech|>你好"}, {"text": "<|en|>Hello"}]
    service.transcriber.slot.loader = lambda: (Model(), lambda raw: raw.replace("<|zh|>", ""))
    result = client.post("/v1/transcribe", json={"fileId": record["id"], "language": "zh", "useItn": False})
    assert result.status_code == 200
    assert result.json()["text"] == "你好\nHello"
    assert result.json()["utterances"][0]["tags"] == ["zh", "HAPPY", "Speech"]
    assert calls[0]["language"] == "zh" and calls[0]["use_itn"] is False
    assert calls[0]["merge_vad"] is True
    assert "timestamp" not in result.json()
    service.transcriber.slot = ModelSlot(lambda: (_ for _ in ()).throw(ImportError("funasr")))
    result = client.post("/v1/transcribe", json={"fileId": record["id"]})
    assert result.status_code == 503
    assert result.json()["error"]["code"] == "model_unavailable"
    assert client.get("/health").status_code == 200


def test_inference_failure_is_json(client):
    record = upload(client, b"sample", "speech.wav")
    class Model:
        def generate(self, **kwargs):
            raise RuntimeError("private model path")
    client.app.state.services.transcriber.slot.loader = lambda: (Model(), str)
    response = client.post("/v1/transcribe", json={"fileId": record["id"]})
    assert response.status_code == 500
    assert "private model path" not in response.text
    assert response.json()["error"]["code"] == "processing_failed"


def test_model_initializes_once_and_serializes_inference():
    counts = {"loads": 0, "active": 0, "max_active": 0}
    guard = Lock()
    def load():
        counts["loads"] += 1
        return object()
    def infer(model):
        with guard:
            counts["active"] += 1
            counts["max_active"] = max(counts["max_active"], counts["active"])
        sleep(.01)
        with guard:
            counts["active"] -= 1
        return 42
    slot = ModelSlot(load)
    with ThreadPoolExecutor(max_workers=4) as pool:
        assert list(pool.map(lambda _: slot.run(infer), range(8))) == [42] * 8
    assert counts == {"loads": 1, "active": 0, "max_active": 1}


def test_failed_model_load_can_retry():
    slot = ModelSlot(lambda: (_ for _ in ()).throw(ImportError("missing")))
    with pytest.raises(ModelUnavailable):
        slot.run(str)
    assert slot.state == "unavailable"
    slot.loader = lambda: 42
    assert slot.run(str) == "42"
    assert slot.state == "ready"
