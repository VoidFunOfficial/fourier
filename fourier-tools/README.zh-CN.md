# Fourier Tools

[English](./README.md) | 简体中文

为视频 Agent 提供 HTTP 素材处理服务：上传文件、调用工具、下载产物，再交给 Fourier SDK 和 Render Engine 使用。

## 启动

在 `fourier-tools` 下运行，Python 需要 3.10 或更高版本：

```sh
python main.py
# 或
uvicorn main:app --host 127.0.0.1 --port 8000
```

交互文档：`http://127.0.0.1:8000/docs`；OpenAPI：`/openapi.json`。
`requirements-http.txt` 只声明 HTTP 与颜色抠图依赖。模型运行环境、设备部署、权重下载管理暂不纳入本服务。默认监听本机，未实现用户鉴权或租户隔离。

## 能力

| 接口 | 能力 | 后端 |
| --- | --- | --- |
| `GET /health` | HTTP 进程存活检查 | 不加载模型 |
| `GET /v1/tools` | 能力与模型加载状态 | unloaded / loading / ready / unavailable |
| `POST /v1/matting` | 颜色抠图、AI 抠图，返回透明 PNG 与灰度 mask | Pillow / BiRefNet |
| `POST /v1/scaleup` | 图片超分，返回 PNG 和尺寸 | ModelScope RealESRGAN |
| `POST /v1/transcribe` | 音频转文字，保留原始标签与富文本 | SenseVoiceSmall + FunASR FSMN-VAD |
| `POST /v1/clip` | 图片与候选文本匹配、排序 | FG-CLIP2 |
| `POST /v1/tts` | 文字转语音、参考音色合成 | VoxCPM2 / CosyVoice3 |

`/health` 不代表所有模型已经就绪。模型在首次调用时加载，进程内复用；同一实例的加载和推理串行执行，不同能力可并发处理。同步推理运行在线程池，不阻塞 HTTP 事件循环。修复依赖后，可再次请求重试失败的模型加载。

## 文件流转

1. `POST /v1/files`：multipart 表单，字段名 `file`。
2. 将返回的 `id` 作为工具请求中的 `fileId` 或 `referenceFileId`。
3. 从工具返回的 `image`、`mask`、`audio` 获取相对下载地址 `url`；产物的 `id` 可继续交给其他工具。
4. `GET /v1/files/{id}` 获取元数据；`GET /v1/files/{id}/content` 下载；`DELETE /v1/files/{id}` 删除。

上传和产物使用相同文件结构：

```json
{
  "id": "0123456789abcdef0123456789abcdef",
  "name": "subject.png",
  "size": 12345,
  "mediaType": "image/png",
  "url": "/v1/files/0123456789abcdef0123456789abcdef/content"
}
```

文件保存在本模块的 `.data/`，重启后仍可获取，直到显式删除。请求不能指定服务器本地路径、模型路径或输出路径；上传文件名不会作为存储路径。默认每个文件最多 100 MiB，HTTP 请求体另留 1 MiB 表单开销，图片输入最多 1600 万像素。中间文件在成功或失败后清理，成功产物需要调用方按需删除。

## 示例

```sh
curl -F 'file=@input.png' http://127.0.0.1:8000/v1/files

# 将 fileId 替换成上传响应中的 id
curl http://127.0.0.1:8000/v1/matting \
  -H 'Content-Type: application/json' \
  -d '{"fileId":"0123456789abcdef0123456789abcdef","method":"color","targetColor":[255,255,255]}'
```

所有工具请求均为 JSON；未知字段、非法 ID、空文本和超出范围的参数会被拒绝。

### 抠图与超分

```json
{"fileId":"0123456789abcdef0123456789abcdef","method":"ai","imageSize":1024}
```

`/v1/matting` 默认 `method=ai`；AI 输入边长 `imageSize` 为 64–2048。颜色抠图参数为 `targetColor`（RGB 整数，默认白色）、`tolerance`（大于 0、最多 442，默认 30）和 `strength`（0–1，默认 1）。已有 alpha 通道会保留。

`/v1/scaleup` 只需要 `fileId`，倍率由模型决定。抠图返回 `{image, mask, width, height}`，超分返回 `{image, width, height}`。

### 转写

```json
{"fileId":"0123456789abcdef0123456789abcdef","language":"auto","useItn":true}
```

`language` 可选 `auto`、`zh`、`en`、`yue`、`ja`、`ko`、`nospeech`。`useItn` 控制逆文本规范化。启用 VAD 分段及合并处理长音频。优先使用 `models/transcribe_model/`，否则将 `iic/SenseVoiceSmall` 交给 FunASR 从 ModelScope 解析，没有独立的下载管理器。

返回 `{model, language, text, richText, utterances}`。`language` 是请求选项；检测到的语言在 `utterances[].tags` 中。每条结果含纯文本 `text`、官方后处理后的 `richText`、原始 `rawText` 和 `tags`。空识别结果返回空文本与空列表。当前不提供说话人分离、词级时间戳或对齐字幕，不会伪造时间。

转写及 TTS 参考文件接受 `.wav`、`.mp3`、`.flac`、`.ogg`、`.m4a`、`.aac`、`.opus`、`.aiff`、`.webm`、`.mp4` 容器；实际解码取决于模型运行时，视频容器需包含音轨。

### 图文匹配

```json
{"fileId":"0123456789abcdef0123456789abcdef","texts":["红色汽车","蓝色自行车"]}
```

候选文本 1–64 条，每条最多 2000 字符。返回 `{matches, scoreType:"cosine_similarity"}`，每项含原始 `index`、`text`、`score`，按分数降序排列。分数是归一化特征的余弦相似度，不是概率；后端 tokenizer 将长文本截断到 196 tokens。此接口不维护向量库。

### 语音合成

VoxCPM 默认支持仅文本输入：

```json
{"text":"欢迎使用 Fourier。","provider":"voxcpm"}
```

带参考音频合成：

```json
{
  "text":"欢迎使用 Fourier。",
  "provider":"cosyvoice",
  "referenceFileId":"0123456789abcdef0123456789abcdef",
  "promptText":"参考音频的准确文本。"
}
```

`text`、`promptText` 最多 10000 字符。VoxCPM 的参考音频可选；提供 `promptText` 时同时传递参考音频与提示音频。CosyVoice 必须提供参考音频：有 `promptText` 时调用 zero-shot，无文本时调用 cross-lingual。所有音频片段按顺序合并为单声道 PCM16 WAV，返回 `{audio, provider, sampleRate, duration}`，时长单位为秒。采样率来自模型；空音频或非有限值会作为失败处理。

## 错误

```json
{"error":{"code":"model_unavailable","message":"The model or its runtime is unavailable; see server logs"}}
```

状态码：404 文件不存在；413 超过上传限制；422 参数或输入不合法；503 模型/依赖不可用；500 推理或产物处理失败。校验失败还会返回 `error.details`。内部异常栈只写服务器日志。缺少模型不会返回占位图片、空 WAV 或虚假转写成功。

## 模块与运行时边界

`main.py` 是启动入口；`server/` 负责路由、参数校验、文件存储和服务编排；`tools/` 保存独立能力及按需加载逻辑；`tests/` 覆盖 HTTP 与模型适配契约。

默认模型目录为 `models/matting_model`、`scaleup_model`、`clip_model`、`tts_model`、`tts_cosy`。各后端需自行准备兼容的 PyTorch、Transformers、ModelScope、FunASR、VoxCPM、CosyVoice 官方源码包及其依赖；CosyVoice 不应替换为同名的无关 PyPI 包。HTTP 启动不导入这些模型框架，也不下载或加载权重。BiRefNet 适配器位于本模块，无需修改嵌套的 BiRefNet 仓库。

## 验证

```sh
python -m pytest -q tests
```

测试需要 pytest、httpx、torch、soundfile 和 HTTP 依赖。颜色抠图、文件流转、PNG/WAV 编解码使用真实实现；AI 推理使用替代模型验证参数传递、后处理、排序、音频片段合并与失败行为，不下载权重。全模型真实推理质量仍需在准备好的运行环境中另行验收。

接口依据：[SenseVoiceSmall](https://www.modelscope.cn/models/iic/SenseVoiceSmall/summary)、[FG-CLIP](https://github.com/360CVGroup/FG-CLIP)、[VoxCPM](https://github.com/OpenBMB/VoxCPM)、[CosyVoice](https://github.com/QwenAudio/CosyVoice)。
