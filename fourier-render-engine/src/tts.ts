import { createHash } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import {
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { fail } from "./errors.ts";
import type {
  SubtitleTtsArtifact,
  TtsOptions,
} from "./types.ts";

export interface SubtitleTtsSpec {
  id: string;
  text: string;
  style?: string;
  referencePath?: string;
}

interface CacheMetadata extends SubtitleTtsArtifact {
  version: 3;
}

interface PendingSynthesis {
  spec: SubtitleTtsSpec;
  key: string;
  finalAudioPath: string;
  finalMetadataPath: string;
  temporaryAudioPath: string;
}

interface TtsHttpResultItem {
  id?: unknown;
  outputPath?: unknown;
  samples?: unknown;
  sampleRate?: unknown;
  durationSeconds?: unknown;
}

function fingerprintPath(path: string): string {
  if (!existsSync(path)) return `${path}:missing`;
  const stat = statSync(path);
  return `${path}:${stat.size}:${stat.mtimeMs}:${stat.isDirectory() ? "d" : "f"}`;
}

function fingerprintModel(modelPath: string): string {
  return [
    fingerprintPath(modelPath),
    fingerprintPath(join(modelPath, "config.json")),
    fingerprintPath(join(modelPath, "model.safetensors")),
    fingerprintPath(join(modelPath, "audiovae.pth")),
    fingerprintPath(join(modelPath, "tokenizer.json")),
  ].join("|");
}

function cacheKey(
  spec: SubtitleTtsSpec,
  baseUrl: string,
  modelPath?: string,
): string {
  return createHash("sha256")
    .update("subtitle-tts-http-v3-optional-style\0")
    .update(spec.text)
    .update("\0")
    .update(spec.style ?? "no-style")
    .update("\0")
    .update(baseUrl)
    .update("\0")
    .update(
      modelPath === undefined
        ? "server-owned-model"
        : fingerprintModel(modelPath),
    )
    .update("\0")
    .update(
      spec.referencePath === undefined
        ? "no-reference"
        : fingerprintPath(spec.referencePath),
    )
    .digest("hex");
}

function validArtifact(value: unknown): value is SubtitleTtsArtifact {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const artifact = value as Partial<SubtitleTtsArtifact>;
  return (
    typeof artifact.sourcePath === "string" &&
    Number.isSafeInteger(artifact.samples) &&
    (artifact.samples ?? 0) > 0 &&
    Number.isSafeInteger(artifact.sampleRate) &&
    (artifact.sampleRate ?? 0) > 0 &&
    typeof artifact.durationSeconds === "number" &&
    Number.isFinite(artifact.durationSeconds) &&
    artifact.durationSeconds > 0
  );
}

async function readCachedArtifact(
  audioPath: string,
  metadataPath: string,
): Promise<SubtitleTtsArtifact | undefined> {
  if (!existsSync(audioPath) || !existsSync(metadataPath)) return undefined;
  try {
    const metadata = JSON.parse(
      await readFile(metadataPath, "utf8"),
    ) as unknown;
    if (
      !validArtifact(metadata) ||
      (metadata as Partial<CacheMetadata>).version !== 3
    ) {
      return undefined;
    }
    return {
      sourcePath: audioPath,
      samples: metadata.samples,
      sampleRate: metadata.sampleRate,
      durationSeconds: metadata.samples / metadata.sampleRate,
    };
  } catch {
    return undefined;
  }
}

function parseHttpResponse(
  parsed: unknown,
  pending: PendingSynthesis[],
): Map<string, SubtitleTtsArtifact> {
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !Array.isArray((parsed as { items?: unknown }).items)
  ) {
    fail("TTS_INVALID_RESPONSE", "TTS HTTP 返回结果缺少 items");
  }
  const items = (parsed as { items: TtsHttpResultItem[] }).items;
  const byId = new Map(items.map((item) => [item.id, item]));
  const artifacts = new Map<string, SubtitleTtsArtifact>();
  for (const entry of pending) {
    const item = byId.get(entry.spec.id);
    const candidate = {
      sourcePath: entry.finalAudioPath,
      samples: item?.samples,
      sampleRate: item?.sampleRate,
      durationSeconds:
        typeof item?.samples === "number" &&
        typeof item.sampleRate === "number"
          ? item.samples / item.sampleRate
          : Number.NaN,
    };
    if (!validArtifact(candidate)) {
      fail(
        "TTS_INVALID_RESPONSE",
        `TTS HTTP 返回的字幕 "${entry.spec.id}" 音频信息无效`,
        { node: entry.spec.id, item },
      );
    }
    artifacts.set(entry.spec.id, candidate);
  }
  return artifacts;
}

async function requestHttpBatch(
  pending: PendingSynthesis[],
  baseUrl: string,
  modelPath: string | undefined,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<Map<string, SubtitleTtsArtifact>> {
  const timeoutController = new AbortController();
  const timeout = setTimeout(() => timeoutController.abort(), timeoutMs);
  const abortController = new AbortController();
  const abort = () => abortController.abort();
  signal?.addEventListener("abort", abort, { once: true });
  timeoutController.signal.addEventListener("abort", abort, { once: true });
  const request = {
    ...(modelPath === undefined ? {} : { modelPath }),
    items: pending.map((entry) => ({
      id: entry.spec.id,
      text: entry.spec.text,
      outputPath: entry.temporaryAudioPath,
      ...(entry.spec.style === undefined
        ? {}
        : { style: entry.spec.style }),
      ...(entry.spec.referencePath === undefined
        ? {}
        : { referenceWavPath: entry.spec.referencePath }),
    })),
  };
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/v1/tts/batch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
      signal: abortController.signal,
    });
  } catch (error) {
    if (signal?.aborted) fail("RENDER_CANCELLED", "渲染已取消");
    if (timeoutController.signal.aborted) {
      fail("TTS_HTTP_TIMEOUT", `TTS HTTP 请求超过 ${timeoutMs}ms`, {
        baseUrl,
        timeoutMs,
      });
    }
    fail(
      "TTS_HTTP_UNAVAILABLE",
      `无法连接 TTS HTTP 服务: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { baseUrl },
    );
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
    timeoutController.signal.removeEventListener("abort", abort);
  }
  const responseText = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    fail("TTS_INVALID_RESPONSE", "TTS HTTP 返回了无效 JSON", {
      status: response.status,
      response: responseText.slice(-4_000),
    });
  }
  if (!response.ok) {
    const error =
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as { error?: { message?: unknown } }).error?.message ===
        "string"
        ? (parsed as { error: { message: string } }).error.message
        : `HTTP ${response.status}`;
    fail("TTS_SYNTHESIS_FAILED", `TTS HTTP 合成失败: ${error}`, {
      status: response.status,
      response: parsed,
    });
  }
  return parseHttpResponse(parsed, pending);
}

/**
 * Sends all cache misses to the MCP companion TTS HTTP service in one batch.
 * The returned map is keyed by subtitle node ID.
 */
export async function prepareSubtitleTts(
  specs: SubtitleTtsSpec[],
  projectDir: string,
  options: TtsOptions = {},
  signal?: AbortSignal,
): Promise<Map<string, SubtitleTtsArtifact>> {
  const artifacts = new Map<string, SubtitleTtsArtifact>();
  if (specs.length === 0) return artifacts;
  if (signal?.aborted) fail("RENDER_CANCELLED", "渲染已取消");

  let baseUrl: string;
  try {
    const url = new URL(
      options.baseUrl ??
        process.env.TTS_HTTP_URL ??
        `http://${process.env.TTS_HTTP_HOST ?? "127.0.0.1"}:${
          process.env.TTS_HTTP_PORT ?? "8765"
        }`,
    );
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new TypeError("protocol must be http or https");
    }
    url.pathname = url.pathname.replace(/\/+$/, "");
    url.search = "";
    url.hash = "";
    baseUrl = url.toString().replace(/\/$/, "");
  } catch (error) {
    fail(
      "INVALID_TTS_HTTP_URL",
      `TTS HTTP URL 非法: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  const configuredModelPath = options.modelPath ?? process.env.TTS_MODEL;
  const modelPath = configuredModelPath === undefined
    ? undefined
    : resolve(configuredModelPath);
  const cacheDirectory = resolve(
    options.cacheDirectory ??
      process.env.TTS_CACHE ??
      join(projectDir, ".render-cache", "tts"),
  );
  if (
    modelPath !== undefined &&
    (!existsSync(modelPath) || !statSync(modelPath).isDirectory())
  ) {
    fail("TTS_MODEL_NOT_FOUND", `TTS 模型目录不存在: ${modelPath}`, {
      modelPath,
    });
  }
  const requestTimeoutMs =
    options.requestTimeoutMs ?? 30 * 60 * 1_000;
  if (
    !Number.isSafeInteger(requestTimeoutMs) ||
    requestTimeoutMs <= 0
  ) {
    fail(
      "INVALID_TTS_HTTP_TIMEOUT",
      "TTS HTTP 超时必须是正安全整数毫秒",
      { requestTimeoutMs },
    );
  }
  await mkdir(cacheDirectory, { recursive: true });

  const pending: PendingSynthesis[] = [];
  for (const spec of specs) {
    const key = cacheKey(spec, baseUrl, modelPath);
    const finalAudioPath = join(cacheDirectory, `${key}.wav`);
    const finalMetadataPath = join(cacheDirectory, `${key}.json`);
    const cached = await readCachedArtifact(
      finalAudioPath,
      finalMetadataPath,
    );
    if (cached !== undefined) {
      artifacts.set(spec.id, cached);
      continue;
    }
    pending.push({
      spec,
      key,
      finalAudioPath,
      finalMetadataPath,
      temporaryAudioPath: join(
        cacheDirectory,
        `.${key}.${crypto.randomUUID()}.wav`,
      ),
    });
  }
  if (pending.length === 0) return artifacts;

  let generated: Map<string, SubtitleTtsArtifact>;
  try {
    generated = await requestHttpBatch(
      pending,
      baseUrl,
      modelPath,
      requestTimeoutMs,
      signal,
    );
    for (const entry of pending) {
      const artifact = generated.get(entry.spec.id);
      if (artifact === undefined || !existsSync(entry.temporaryAudioPath)) {
        fail(
          "TTS_OUTPUT_MISSING",
          `字幕 "${entry.spec.id}" 未生成音频文件`,
          { node: entry.spec.id },
        );
      }
      await rename(entry.temporaryAudioPath, entry.finalAudioPath);
      const metadata: CacheMetadata = {
        version: 3,
        sourcePath: entry.finalAudioPath,
        samples: artifact.samples,
        sampleRate: artifact.sampleRate,
        durationSeconds: artifact.durationSeconds,
      };
      const temporaryMetadataPath =
        `${entry.finalMetadataPath}.${crypto.randomUUID()}.tmp`;
      await writeFile(temporaryMetadataPath, JSON.stringify(metadata));
      await rename(temporaryMetadataPath, entry.finalMetadataPath);
      artifacts.set(entry.spec.id, metadata);
    }
    return artifacts;
  } finally {
    await Promise.all(
      pending.map((entry) =>
        rm(entry.temporaryAudioPath, { force: true }).catch(() => {})
      ),
    );
  }
}
