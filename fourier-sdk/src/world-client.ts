import { createHash } from "node:crypto";
import type { WorldPackageArchive } from "./world-archive.ts";
import {
  WORLD_COMPONENT_TYPES,
  WORLD_LANGUAGES,
  WORLD_MOODS,
  WORLD_STYLES,
  parseWorldPackageName,
  type LoadedWorldPackage,
  type WorldComponentType,
  type WorldLanguage,
  type WorldMood,
  type WorldStyle,
} from "./world-manifest.ts";
import { MAX_WORLD_PREVIEW_BYTES, type WorldPreviewVideo } from "./world-preview.ts";

export const DEFAULT_FOURIER_WORLD_URL = "https://www.fourier.video";

export type WorldUserRole = "admin" | "reviewer";

export interface WorldUser {
  readonly id: string | number;
  readonly email: string;
  readonly name: string;
  readonly role: WorldUserRole;
}

export interface WorldLoginResult {
  readonly token: string;
  readonly exp?: number;
  readonly user: WorldUser;
}

export interface WorldComponentRecord {
  readonly id: string | number;
  readonly namespace: string;
  readonly name: string;
  readonly version: string;
  readonly status: "draft" | "review" | "published" | "unlisted";
}

export interface WorldPublishResult {
  readonly created: boolean;
  readonly component: WorldComponentRecord;
}

export interface DownloadedWorldPackage {
  readonly packageName: string;
  readonly version: string;
  readonly sha256: string;
  readonly componentId?: string;
  readonly bytes: Uint8Array;
}

export interface WorldSearchOptions {
  readonly type?: WorldComponentType;
  readonly styles?: readonly WorldStyle[];
  readonly contentDomains?: readonly string[];
  readonly moods?: readonly WorldMood[];
  readonly languages?: readonly WorldLanguage[];
  readonly license?: "MIT";
  readonly author?: string;
  readonly page?: number;
  readonly limit?: number;
  /** Groups impressions from several searches without requiring authentication. */
  readonly sessionId?: string;
  readonly signal?: AbortSignal;
}

export interface WorldSearchAuthor {
  readonly id: string | number;
  readonly name: string;
  readonly namespace: string;
  readonly bio?: string | null;
  readonly verified?: boolean | null;
  readonly avatarUrl?: string | null;
}

export interface WorldSearchMedia {
  readonly url: string;
  readonly alt: string;
  readonly mimeType?: string | null;
}

export interface WorldSearchMetrics {
  readonly viewCount: number;
  readonly clickCount: number;
  readonly favoriteCount: number;
  readonly adoptionCount: number;
  readonly qualityScore: number;
}

export interface WorldSearchMatch {
  /** Normalized hybrid score in the inclusive range 0—1. */
  readonly score: number;
  readonly reasons: readonly string[];
  readonly keywordScore: number;
  readonly semanticScore: number;
}

/** A published Fourier World component returned by semantic retrieval. */
export interface WorldSearchResult {
  readonly id: string | number;
  readonly name: string;
  readonly namespace: string;
  readonly packageName: string;
  readonly downloadable: boolean;
  readonly version: string;
  readonly type: WorldComponentType;
  readonly subtype?: string | null;
  readonly summary: string;
  readonly description: string;
  readonly instruction: string;
  readonly styles: readonly WorldStyle[];
  readonly useCases: readonly string[];
  readonly negativeUseCases: readonly string[];
  readonly aliases: readonly string[];
  readonly tags: readonly string[];
  readonly contentDomains: readonly string[];
  readonly moods: readonly WorldMood[];
  readonly languages: readonly WorldLanguage[];
  readonly license: "MIT";
  readonly author: WorldSearchAuthor | null;
  readonly cover: WorldSearchMedia | null;
  readonly preview: WorldSearchMedia | null;
  readonly metrics: WorldSearchMetrics;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly match: WorldSearchMatch;
}

export interface WorldSearchResponse {
  readonly results: readonly WorldSearchResult[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
  readonly queryId?: string | number;
  readonly latencyMs: number;
  readonly mode: "hybrid";
}

export class FourierWorldApiError extends Error {
  readonly status: number;
  readonly details: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "FourierWorldApiError";
    this.status = status;
    this.details = details;
  }
}

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function normalizeToken(token: string): string {
  return token.replace(/^(?:JWT|Bearer)\s+/i, "").trim();
}

export function normalizeWorldUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError(`无效的 Fourier World URL: ${value}`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new TypeError("Fourier World URL 只支持 http 或 https");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new TypeError("Fourier World URL 不能包含账号、查询参数或 fragment");
  }
  return url.href.replace(/\/$/, "");
}

function errorMessage(status: number, body: unknown): string {
  const data = object(body);
  if (typeof data?.message === "string") return data.message;
  if (Array.isArray(data?.errors)) {
    const messages = data.errors
      .map((entry) => object(entry)?.message)
      .filter((entry): entry is string => typeof entry === "string");
    if (messages.length > 0) return messages.join("；");
  }
  if (status === 401) return "登录已失效，请重新运行 fourier-sdk login";
  if (status === 403) return "当前 Fourier World 账号没有发布权限";
  return `Fourier World 请求失败 (HTTP ${status})`;
}

async function responseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function loginResult(value: unknown): WorldLoginResult {
  const data = object(value);
  const user = object(data?.user);
  if (
    typeof data?.token !== "string" ||
    (typeof user?.id !== "string" && typeof user?.id !== "number") ||
    typeof user.email !== "string" ||
    typeof user.name !== "string" ||
    (user.role !== "admin" && user.role !== "reviewer")
  ) {
    throw new FourierWorldApiError(502, "Fourier World 登录响应格式无效", value);
  }
  return Object.freeze({
    token: normalizeToken(data.token),
    ...(typeof data.exp === "number" ? { exp: data.exp } : {}),
    user: Object.freeze({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    }),
  });
}

function componentRecord(value: unknown): WorldComponentRecord {
  const wrapper = object(value);
  const data = object(wrapper?.doc) ?? wrapper;
  if (
    data === undefined ||
    (typeof data.id !== "string" && typeof data.id !== "number") ||
    typeof data.namespace !== "string" ||
    typeof data.name !== "string" ||
    typeof data.version !== "string" ||
    !["draft", "review", "published", "unlisted"].includes(String(data.status))
  ) {
    throw new FourierWorldApiError(502, "Fourier World 组件响应格式无效", value);
  }
  return Object.freeze({
    id: data.id,
    namespace: data.namespace,
    name: data.name,
    version: data.version,
    status: data.status as WorldComponentRecord["status"],
  });
}

function requiredString(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`字段 ${key} 不是非空字符串`);
  }
  return value;
}

function finiteNumber(source: Record<string, unknown>, key: string): number {
  const value = source[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`字段 ${key} 不是有限数字`);
  }
  return value;
}

function nonNegativeInteger(source: Record<string, unknown>, key: string): number {
  const value = finiteNumber(source, key);
  if (!Number.isInteger(value) || value < 0) throw new TypeError(`字段 ${key} 不是非负整数`);
  return value;
}

function positiveIntegerField(source: Record<string, unknown>, key: string): number {
  const value = finiteNumber(source, key);
  if (!Number.isInteger(value) || value < 1) throw new TypeError(`字段 ${key} 不是正整数`);
  return value;
}

function stringList(source: Record<string, unknown>, key: string): readonly string[] {
  const value = source[key];
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new TypeError(`字段 ${key} 不是字符串数组`);
  }
  return Object.freeze([...value]);
}

function worldEnumList<T extends string>(
  source: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
): readonly T[] {
  const values = stringList(source, key);
  if (!values.every((value) => allowed.includes(value as T))) {
    throw new TypeError(`字段 ${key} 包含未知值`);
  }
  return values as readonly T[];
}

function optionalNullableString(
  source: Record<string, unknown>,
  key: string,
): string | null | undefined {
  const value = source[key];
  if (value === undefined || value === null || typeof value === "string") return value;
  throw new TypeError(`字段 ${key} 不是字符串或 null`);
}

function absoluteWorldUrl(value: string, worldUrl: string, field: string): string {
  try {
    const url = new URL(value, `${worldUrl}/`);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new TypeError("unsupported protocol");
    return url.href;
  } catch {
    throw new TypeError(`字段 ${field} 不是有效的 http/https URL`);
  }
}

function searchMedia(value: unknown, worldUrl: string, field: string): WorldSearchMedia | null {
  if (value === null) return null;
  const data = object(value);
  if (data === undefined) throw new TypeError(`字段 ${field} 不是媒体对象或 null`);
  const mimeType = optionalNullableString(data, "mimeType");
  return Object.freeze({
    url: absoluteWorldUrl(requiredString(data, "url"), worldUrl, `${field}.url`),
    alt: requiredString(data, "alt"),
    ...(mimeType === undefined ? {} : { mimeType }),
  });
}

function searchAuthor(value: unknown, worldUrl: string): WorldSearchAuthor | null {
  if (value === null) return null;
  const data = object(value);
  if (data === undefined) throw new TypeError("字段 author 不是作者对象或 null");
  if (
    (typeof data.id !== "string" && typeof data.id !== "number") ||
    (typeof data.id === "string" && data.id.length === 0) ||
    (typeof data.id === "number" && !Number.isFinite(data.id))
  ) {
    throw new TypeError("字段 author.id 不是字符串或数字");
  }
  const bio = optionalNullableString(data, "bio");
  const avatarUrl = optionalNullableString(data, "avatarUrl");
  if (data.verified !== undefined && data.verified !== null && typeof data.verified !== "boolean") {
    throw new TypeError("字段 author.verified 不是布尔值或 null");
  }
  return Object.freeze({
    id: data.id,
    name: requiredString(data, "name"),
    namespace: requiredString(data, "namespace"),
    ...(bio === undefined ? {} : { bio }),
    ...(data.verified === undefined ? {} : { verified: data.verified as boolean | null }),
    ...(avatarUrl === undefined
      ? {}
      : { avatarUrl: avatarUrl === null ? null : absoluteWorldUrl(avatarUrl, worldUrl, "author.avatarUrl") }),
  });
}

function searchMetrics(value: unknown): WorldSearchMetrics {
  const data = object(value);
  if (data === undefined) throw new TypeError("字段 metrics 不是对象");
  const qualityScore = finiteNumber(data, "qualityScore");
  if (qualityScore < 0 || qualityScore > 1) throw new TypeError("字段 metrics.qualityScore 必须位于 0—1");
  return Object.freeze({
    viewCount: nonNegativeInteger(data, "viewCount"),
    clickCount: nonNegativeInteger(data, "clickCount"),
    favoriteCount: nonNegativeInteger(data, "favoriteCount"),
    adoptionCount: nonNegativeInteger(data, "adoptionCount"),
    qualityScore,
  });
}

function searchMatch(value: unknown): WorldSearchMatch {
  const data = object(value);
  if (data === undefined) throw new TypeError("字段 match 不是对象");
  const score = finiteNumber(data, "score");
  if (score < 0 || score > 1) throw new TypeError("字段 match.score 必须位于 0—1");
  const semanticScore = finiteNumber(data, "semanticScore");
  if (semanticScore < 0 || semanticScore > 1) {
    throw new TypeError("字段 match.semanticScore 必须位于 0—1");
  }
  return Object.freeze({
    score,
    reasons: stringList(data, "reasons"),
    keywordScore: finiteNumber(data, "keywordScore"),
    semanticScore,
  });
}

function searchResult(value: unknown, worldUrl: string): WorldSearchResult {
  const data = object(value);
  if (data === undefined) throw new TypeError("检索结果不是对象");
  if (
    (typeof data.id !== "string" && typeof data.id !== "number") ||
    (typeof data.id === "string" && data.id.length === 0) ||
    (typeof data.id === "number" && !Number.isFinite(data.id))
  ) {
    throw new TypeError("字段 id 不是字符串或数字");
  }
  if (data.downloadable !== true && data.downloadable !== false) {
    throw new TypeError("字段 downloadable 不是布尔值");
  }
  if (!WORLD_COMPONENT_TYPES.includes(data.type as WorldComponentType)) {
    throw new TypeError("字段 type 不是已知的 Fourier World 组件类型");
  }
  if (data.license !== "MIT") throw new TypeError("字段 license 不是 MIT");
  const subtype = optionalNullableString(data, "subtype");
  const styles = worldEnumList(data, "style", WORLD_STYLES);
  const name = requiredString(data, "name");
  const namespace = requiredString(data, "namespace");
  const packageName = requiredString(data, "packageName");
  let parsedPackage: ReturnType<typeof parseWorldPackageName>;
  try {
    parsedPackage = parseWorldPackageName(packageName);
  } catch {
    throw new TypeError("字段 packageName 不是有效的 Fourier World 包名");
  }
  if (parsedPackage.namespace !== namespace || parsedPackage.componentName !== name) {
    throw new TypeError("字段 packageName 与 namespace/name 不一致");
  }
  return Object.freeze({
    id: data.id,
    name,
    namespace,
    packageName,
    downloadable: data.downloadable,
    version: requiredString(data, "version"),
    type: data.type as WorldComponentType,
    ...(subtype === undefined ? {} : { subtype }),
    summary: requiredString(data, "summary"),
    description: requiredString(data, "description"),
    instruction: requiredString(data, "instruction"),
    styles,
    useCases: stringList(data, "useCases"),
    negativeUseCases: stringList(data, "negativeUseCases"),
    aliases: stringList(data, "aliases"),
    tags: stringList(data, "tags"),
    contentDomains: stringList(data, "contentDomains"),
    moods: worldEnumList(data, "mood", WORLD_MOODS),
    languages: worldEnumList(data, "languages", WORLD_LANGUAGES),
    license: "MIT",
    author: searchAuthor(data.author, worldUrl),
    cover: searchMedia(data.cover, worldUrl, "cover"),
    preview: searchMedia(data.preview, worldUrl, "preview"),
    metrics: searchMetrics(data.metrics),
    createdAt: requiredString(data, "createdAt"),
    updatedAt: requiredString(data, "updatedAt"),
    match: searchMatch(data.match),
  });
}

function searchResponse(value: unknown, worldUrl: string): WorldSearchResponse {
  const data = object(value);
  if (data === undefined || !Array.isArray(data.docs)) {
    throw new TypeError("检索响应缺少 docs 数组");
  }
  if (data.mode !== "hybrid") throw new TypeError("检索响应 mode 不是 hybrid");
  if (data.queryId !== undefined && typeof data.queryId !== "string" && typeof data.queryId !== "number") {
    throw new TypeError("检索响应 queryId 不是字符串或数字");
  }
  return Object.freeze({
    results: Object.freeze(data.docs.map((item) => searchResult(item, worldUrl))),
    total: nonNegativeInteger(data, "total"),
    page: positiveIntegerField(data, "page"),
    limit: positiveIntegerField(data, "limit"),
    ...(data.queryId === undefined ? {} : { queryId: data.queryId }),
    latencyMs: nonNegativeInteger(data, "latencyMs"),
    mode: "hybrid",
  });
}

function positiveInteger(value: number | undefined, fallback: number, label: string, maximum?: number): number {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved < 1 || (maximum !== undefined && resolved > maximum)) {
    throw new TypeError(`${label} 必须是 1—${maximum ?? "∞"} 的整数`);
  }
  return resolved;
}

function trimmedList(values: readonly string[] | undefined, label: string): readonly string[] {
  if (values === undefined) return [];
  const result = values.map((value) => value.trim());
  if (result.some((value) => value.length === 0)) throw new TypeError(`${label} 不能包含空字符串`);
  return [...new Set(result)];
}

function enumList<T extends string>(
  values: readonly T[] | undefined,
  allowed: readonly T[],
  label: string,
): readonly T[] {
  if (values === undefined) return [];
  if (values.some((value) => !allowed.includes(value))) throw new TypeError(`${label} 包含不支持的值`);
  return [...new Set(values)];
}

export class FourierWorldClient {
  readonly worldUrl: string;
  readonly token: string | undefined;
  private readonly fetcher: typeof globalThis.fetch;

  constructor(options: { worldUrl?: string; token?: string; fetch?: typeof globalThis.fetch } = {}) {
    this.worldUrl = normalizeWorldUrl(options.worldUrl ?? DEFAULT_FOURIER_WORLD_URL);
    const token = options.token === undefined ? undefined : normalizeToken(options.token);
    this.token = token && token.length > 0 ? token : undefined;
    this.fetcher = options.fetch ?? globalThis.fetch;
  }

  private async fetchResponse(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    if (this.token !== undefined) headers.set("authorization", `JWT ${this.token}`);
    return this.fetcher(new URL(path, `${this.worldUrl}/`), {
      ...init,
      headers,
      redirect: "error",
    });
  }

  private async request(path: string, init: RequestInit = {}): Promise<unknown> {
    const response = await this.fetchResponse(path, init);
    const body = await responseBody(response);
    if (!response.ok) {
      throw new FourierWorldApiError(response.status, errorMessage(response.status, body), body);
    }
    return body;
  }

  async login(email: string, password: string): Promise<WorldLoginResult> {
    const body = await this.request("api/users/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    return loginResult(body);
  }

  async currentUser(): Promise<WorldUser> {
    if (this.token === undefined) throw new TypeError("Fourier World token 缺失");
    const body = object(await this.request("api/users/me"));
    const user = object(body?.user);
    if (
      (typeof user?.id !== "string" && typeof user?.id !== "number") ||
      typeof user.email !== "string" ||
      typeof user.name !== "string" ||
      (user.role !== "admin" && user.role !== "reviewer")
    ) {
      throw new FourierWorldApiError(502, "Fourier World 当前用户响应格式无效", body);
    }
    return Object.freeze({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });
  }

  /**
   * Search published Fourier World capabilities by natural-language intent.
   * Fourier World performs hybrid keyword/vector retrieval and returns its
   * explainable scores; the SDK validates and freezes the public response.
   */
  async search(query: string, options: WorldSearchOptions = {}): Promise<WorldSearchResponse> {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length === 0 || normalizedQuery.length > 500) {
      throw new TypeError("Search query 必须是 1—500 个字符");
    }
    if (options.type !== undefined && !WORLD_COMPONENT_TYPES.includes(options.type)) {
      throw new TypeError("type 不是已知的 Fourier World 组件类型");
    }
    if (options.license !== undefined && options.license !== "MIT") {
      throw new TypeError("license 只支持 MIT");
    }
    const author = options.author?.trim();
    if (options.author !== undefined && author?.length === 0) throw new TypeError("author 不能为空");
    const sessionId = options.sessionId?.trim();
    if (options.sessionId !== undefined && (sessionId === undefined || sessionId.length === 0 || sessionId.length > 100)) {
      throw new TypeError("sessionId 必须是 1—100 个字符");
    }
    const queryParams = new URLSearchParams({
      q: normalizedQuery,
      page: String(positiveInteger(options.page, 1, "page")),
      limit: String(positiveInteger(options.limit, 12, "limit", 48)),
    });
    if (options.type !== undefined) queryParams.set("type", options.type);
    for (const style of enumList(options.styles, WORLD_STYLES, "styles")) queryParams.append("style", style);
    for (const domain of trimmedList(options.contentDomains, "contentDomains")) {
      queryParams.append("domain", domain);
    }
    for (const mood of enumList(options.moods, WORLD_MOODS, "moods")) queryParams.append("mood", mood);
    for (const language of enumList(options.languages, WORLD_LANGUAGES, "languages")) {
      queryParams.append("language", language);
    }
    if (options.license !== undefined) queryParams.set("license", options.license);
    if (author !== undefined) queryParams.set("author", author);
    if (sessionId !== undefined) queryParams.set("sessionId", sessionId);
    const body = await this.request(
      `api/search?${queryParams}`,
      options.signal === undefined ? {} : { signal: options.signal },
    );
    try {
      return searchResponse(body, this.worldUrl);
    } catch (error) {
      throw new FourierWorldApiError(
        502,
        `Fourier World 检索响应格式无效: ${error instanceof Error ? error.message : String(error)}`,
        body,
      );
    }
  }

  async publish(
    componentPackage: LoadedWorldPackage,
    archive: WorldPackageArchive,
    preview: WorldPreviewVideo,
  ): Promise<WorldPublishResult> {
    if (this.token === undefined) throw new TypeError("Fourier World token 缺失");
    if (preview.bytes.byteLength === 0 || preview.bytes.byteLength > MAX_WORLD_PREVIEW_BYTES) {
      throw new TypeError(`Fourier World 预览 MP4 必须为 1—${MAX_WORLD_PREVIEW_BYTES} bytes`);
    }
    const previewSha256 = createHash("sha256").update(preview.bytes).digest("hex");
    if (previewSha256 !== preview.sha256) {
      throw new TypeError("Fourier World 预览 MP4 的 SHA-256 与内容不一致");
    }
    const authorQuery = new URLSearchParams({ limit: "1", depth: "0" });
    authorQuery.set("where[namespace][equals]", componentPackage.namespace);
    const authorBody = object(await this.request(`api/authors?${authorQuery}`));
    const author = Array.isArray(authorBody?.docs) ? object(authorBody.docs[0]) : undefined;
    if (typeof author?.id !== "string" && typeof author?.id !== "number") {
      throw new FourierWorldApiError(
        404,
        `Fourier World 中不存在发布者 ${componentPackage.namespace}；请先让管理员创建该 namespace`,
        authorBody,
      );
    }

    const packageQuery = new URLSearchParams({ limit: "1", depth: "0" });
    packageQuery.set("where[and][0][packageName][equals]", componentPackage.manifest.name);
    packageQuery.set("where[and][1][version][equals]", componentPackage.manifest.version);
    const packageBody = object(await this.request(`api/component-packages?${packageQuery}`));
    const existingPackage = Array.isArray(packageBody?.docs) ? object(packageBody.docs[0]) : undefined;
    let packageArchiveId: string | number;
    let uploadedPackageId: string | number | undefined;
    let uploadedPreviewId: string | number | undefined;
    const cleanupUploads = async (): Promise<void> => {
      await Promise.all([
        ...(uploadedPreviewId === undefined
          ? []
          : [this.request(`api/media/${encodeURIComponent(uploadedPreviewId)}`, { method: "DELETE" })
              .catch(() => undefined)]),
        ...(uploadedPackageId === undefined
          ? []
          : [this.request(`api/component-packages/${encodeURIComponent(uploadedPackageId)}`, { method: "DELETE" })
              .catch(() => undefined)]),
      ]);
    };
    if (existingPackage !== undefined) {
      if (existingPackage.sha256 !== archive.sha256) {
        throw new FourierWorldApiError(
          409,
          `${componentPackage.manifest.name}@${componentPackage.manifest.version} 已存在且内容不同；请提升 version`,
          existingPackage,
        );
      }
      if (typeof existingPackage.id !== "string" && typeof existingPackage.id !== "number") {
        throw new FourierWorldApiError(502, "Fourier World 组件包响应格式无效", existingPackage);
      }
      packageArchiveId = existingPackage.id;
    } else {
      const form = new FormData();
      form.append("_payload", JSON.stringify({
        packageName: componentPackage.manifest.name,
        version: componentPackage.manifest.version,
        sha256: archive.sha256,
        fileCount: archive.fileCount,
        unpackedSize: archive.unpackedSize,
      }));
      const filename = `${componentPackage.namespace.slice(1)}-${componentPackage.componentName}-${componentPackage.manifest.version}.tar.gz`;
      const archiveBuffer = Uint8Array.from(archive.bytes).buffer;
      form.append("file", new File([archiveBuffer], filename, { type: "application/gzip" }));
      const uploaded = object(await this.request("api/component-packages", { method: "POST", body: form }));
      const uploadedDoc = object(uploaded?.doc) ?? uploaded;
      if (typeof uploadedDoc?.id !== "string" && typeof uploadedDoc?.id !== "number") {
        throw new FourierWorldApiError(502, "Fourier World 组件包上传响应格式无效", uploaded);
      }
      packageArchiveId = uploadedDoc.id;
      uploadedPackageId = uploadedDoc.id;
    }

    let previewMediaId: string | number;
    try {
      const form = new FormData();
      form.append("_payload", JSON.stringify({
        alt: `${componentPackage.componentName} · Fourier Render Engine preview`,
      }));
      const filename = `${componentPackage.namespace.slice(1)}-${componentPackage.componentName}-${componentPackage.manifest.version}-preview.mp4`;
      const previewBuffer = Uint8Array.from(preview.bytes).buffer;
      form.append("file", new File([previewBuffer], filename, { type: preview.mimeType }));
      const uploaded = object(await this.request("api/media", { method: "POST", body: form }));
      const uploadedDoc = object(uploaded?.doc) ?? uploaded;
      if (typeof uploadedDoc?.id !== "string" && typeof uploadedDoc?.id !== "number") {
        throw new FourierWorldApiError(502, "Fourier World 预览视频上传响应格式无效", uploaded);
      }
      previewMediaId = uploadedDoc.id;
      uploadedPreviewId = uploadedDoc.id;
    } catch (error) {
      await cleanupUploads();
      throw error;
    }

    const componentQuery = new URLSearchParams({ limit: "1", depth: "0" });
    componentQuery.set("where[and][0][namespace][equals]", componentPackage.namespace);
    componentQuery.set("where[and][1][name][equals]", componentPackage.componentName);
    let existingBody: Record<string, unknown> | undefined;
    try {
      existingBody = object(await this.request(`api/components?${componentQuery}`));
    } catch (error) {
      await cleanupUploads();
      throw error;
    }
    const existing = Array.isArray(existingBody?.docs) ? object(existingBody.docs[0]) : undefined;
    const metadata = componentPackage.manifest.fourier;
    const data = {
      namespace: componentPackage.namespace,
      name: componentPackage.componentName,
      version: componentPackage.manifest.version,
      type: metadata.type,
      ...(metadata.subtype === undefined ? {} : { subtype: metadata.subtype }),
      license: componentPackage.manifest.license,
      author: author.id,
      status: "review",
      summary: metadata.summary,
      description: componentPackage.manifest.description,
      instruction: metadata.instruction,
      useCases: metadata.useCases,
      ...(metadata.negativeUseCases === undefined ? {} : { negativeUseCases: metadata.negativeUseCases }),
      ...(metadata.aliases === undefined ? {} : { aliases: metadata.aliases }),
      tags: metadata.tags,
      style: metadata.style,
      ...(metadata.contentDomains === undefined ? {} : { contentDomains: metadata.contentDomains }),
      ...(metadata.mood === undefined ? {} : { mood: metadata.mood }),
      ...(metadata.languages === undefined ? {} : { languages: metadata.languages }),
      packageArchive: packageArchiveId,
      preview: previewMediaId,
    };
    const existingId = existing?.id;
    const created = typeof existingId !== "string" && typeof existingId !== "number";
    let body: unknown;
    try {
      body = await this.request(
        created ? "api/components" : `api/components/${encodeURIComponent(existingId)}`,
        {
          method: created ? "POST" : "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(data),
        },
      );
    } catch (error) {
      await cleanupUploads();
      throw error;
    }
    return Object.freeze({ created, component: componentRecord(body) });
  }

  async download(packageName: string): Promise<DownloadedWorldPackage> {
    const { namespace, componentName } = parseWorldPackageName(packageName);
    const response = await this.fetchResponse(
      `api/packages/${encodeURIComponent(namespace)}/${encodeURIComponent(componentName)}`,
    );
    if (!response.ok) {
      const body = await responseBody(response);
      throw new FourierWorldApiError(response.status, errorMessage(response.status, body), body);
    }
    const length = Number(response.headers.get("content-length"));
    if (Number.isFinite(length) && length > 10 * 1024 * 1024) {
      throw new FourierWorldApiError(413, "Fourier World 组件包超过 10 MiB 下载限制");
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > 10 * 1024 * 1024) {
      throw new FourierWorldApiError(413, "Fourier World 组件包超过 10 MiB 下载限制");
    }
    const version = response.headers.get("x-fourier-package-version");
    const expectedSha256 = response.headers.get("x-fourier-package-sha256");
    const responsePackageName = response.headers.get("x-fourier-package-name");
    if (!version || !expectedSha256 || responsePackageName !== packageName || !/^[0-9a-f]{64}$/.test(expectedSha256)) {
      throw new FourierWorldApiError(502, "Fourier World 下载响应缺少有效的包元数据");
    }
    const actualSha256 = createHash("sha256").update(bytes).digest("hex");
    if (actualSha256 !== expectedSha256) {
      throw new FourierWorldApiError(502, "Fourier World 组件包 SHA-256 校验失败");
    }
    const componentId = response.headers.get("x-fourier-component-id");
    return Object.freeze({
      packageName,
      version,
      sha256: actualSha256,
      ...(componentId === null ? {} : { componentId }),
      bytes,
    });
  }
}
