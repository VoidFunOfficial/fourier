# Fourier Tools

English | [简体中文 / detailed examples](./README.zh-CN.md)

HTTP media processing for video agents: upload an asset, call a tool using its file ID, and pass the resulting asset to Fourier SDK and Render Engine.

## Run

From `fourier-tools`, with Python 3.10+:

```sh
python main.py
# Or: uvicorn main:app --host 127.0.0.1 --port 8000
```

Interactive documentation: `http://127.0.0.1:8000/docs`; schema: `/openapi.json`. `requirements-http.txt` declares HTTP and color-matting dependencies only. Model environment provisioning, deployment configuration, and weight-download management remain outside this module's scope. The default listener is loopback; authentication and tenant isolation are not implemented.

## API

| Route | Behavior |
| --- | --- |
| `GET /health` | Process liveness without loading models |
| `GET /v1/tools` | Capabilities and model states: unloaded, loading, ready, unavailable |
| `POST /v1/files` | Multipart upload using the `file` field |
| `GET /v1/files/{id}` | File metadata |
| `GET /v1/files/{id}/content` | Download |
| `DELETE /v1/files/{id}` | Delete an uploaded file or generated artifact |
| `POST /v1/matting` | Color removal or BiRefNet; returns image, mask, width, height |
| `POST /v1/scaleup` | ModelScope RealESRGAN; returns image, width, height |
| `POST /v1/transcribe` | SenseVoiceSmall with FSMN-VAD; returns plain/rich text and raw tags |
| `POST /v1/clip` | FG-CLIP2 image-to-text ranking using cosine similarity |
| `POST /v1/tts` | VoxCPM2 or CosyVoice3; returns WAV, sample rate and duration in seconds |

All tool requests use JSON and reject unknown fields. Upload responses and generated files share `{id, name, size, mediaType, url}`. URLs are relative to the service. Generated IDs can be reused as tool inputs. Files persist under `.data/` across restarts until explicitly deleted. Intermediate files are removed after each operation, including failures. Callers cannot supply server filesystem paths, output paths, or model locations.

Each file is limited to 100 MiB by default; HTTP requests allow an additional 1 MiB for multipart framing. Image inputs are limited to 16 million pixels. Models load on first use and are reused in process. Each model serializes initialization and inference; synchronous routes run in worker threads. Failed loads can be retried. Health does not imply model readiness.

## Requests

```sh
curl -F 'file=@input.png' http://127.0.0.1:8000/v1/files

# Replace fileId with the upload response's id.
curl http://127.0.0.1:8000/v1/matting \
  -H 'Content-Type: application/json' \
  -d '{"fileId":"0123456789abcdef0123456789abcdef","method":"color","targetColor":[255,255,255]}'
```

- Matting: `{fileId, method?, targetColor?, tolerance?, strength?, imageSize?}`. Defaults: AI, white, 30, 1, 1024. Tolerance must be positive and at most 442; strength is 0–1; AI imageSize is 64–2048. Existing alpha is preserved.
- Upscaling: `{fileId}`. Uses the model's native scale.
- Transcription: `{fileId, language?, useItn?}`. Languages: auto (default), zh, en, yue, ja, ko, nospeech. ITN defaults to true. Returns `{model, language, text, richText, utterances}`; utterances contain text, richText, rawText and tags. The language field echoes the request; detected language is in the tags. No timestamps, diarization or aligned subtitles are fabricated. Local `models/transcribe_model/` is preferred; otherwise FunASR resolves `iic/SenseVoiceSmall` from ModelScope. VAD handles long-audio segmentation.
- CLIP: `{fileId, texts}`. Accepts 1–64 candidates of up to 2000 characters. Returns descending matches with original index, text and cosine score, not probability. Tokenization truncates to 196 tokens. No vector database is maintained.
- TTS: `{text, provider?, referenceFileId?, promptText?}`. Provider defaults to voxcpm. CosyVoice requires a reference: with promptText it uses zero-shot inference, otherwise cross-lingual inference. VoxCPM supports text alone or reference-based synthesis. Text fields allow up to 10000 characters. All chunks are combined into mono PCM16 WAV using the model's sample rate. Empty or non-finite audio fails instead of publishing an artifact.

Audio/reference containers: WAV, MP3, FLAC, OGG, M4A, AAC, OPUS, AIFF, WEBM, MP4. Actual decoding depends on the runtime; video containers require an audio track.

## Runtime boundaries and errors

Default local model directories: `models/matting_model`, `scaleup_model`, `clip_model`, `tts_model`, `tts_cosy`. Compatible model dependencies are provisioned separately: PyTorch/Transformers, ModelScope, FunASR, VoxCPM, and the official CosyVoice source package with its dependencies. HTTP startup does not import these frameworks or load weights. The Fourier-owned BiRefNet adapter does not require modifying the nested upstream checkout.

Errors use `{error: {code, message, details?}}`: 404 missing file, 413 upload limit, 422 invalid request/input, 503 unavailable model/runtime, 500 processing failure. Internal exception traces are logged server-side. Missing models never return placeholder success.

## Development

`main.py` starts the app. `server/` contains routing, request schemas, file storage, and orchestration. `tools/` contains reusable model adapters and the lazy model lifecycle.

```sh
python -m pytest -q tests
```

Tests require pytest, httpx, torch, soundfile, and HTTP dependencies. Color matting, file lifecycle, and PNG/WAV encoding use real implementations. Model adapters use replacement inference models to check arguments, result conversion, ranking, chunk assembly, concurrency, and failures without downloading weights. Real model inference quality requires separate acceptance in a provisioned environment.

Upstream contracts: [SenseVoiceSmall](https://www.modelscope.cn/models/iic/SenseVoiceSmall/summary), [FG-CLIP](https://github.com/360CVGroup/FG-CLIP), [VoxCPM](https://github.com/OpenBMB/VoxCPM), [CosyVoice](https://github.com/QwenAudio/CosyVoice).
