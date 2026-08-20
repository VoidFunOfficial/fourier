import { watch, type FSWatcher } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { basename, dirname, relative, resolve, sep } from "node:path";
import type { CompiledVisualArtifact } from "@fourier-video/core/artifact";
import { sdkArtifactHost } from "./artifact-host.ts";
import { resolveDesignPreview } from "./preview-config.ts";
import { PLAYER_CSS, PLAYER_HTML } from "./player.ts";
import {
  DESIGN_PREVIEW_FPS,
  type AnyArtifact,
  type PreviewConfig,
} from "./types.ts";

export { definePreview } from "./preview-config.ts";
export type { PreviewConfig } from "./types.ts";

const { compileVisualArtifact } = sdkArtifactHost;

export interface PreviewDiagnostic {
  code: string;
  message: string;
  details?: Readonly<Record<string, unknown>>;
}

export interface StartPreviewServerOptions {
  /** Artifact module or a directory containing `.tsx`/`.jsx` artifacts. */
  entryPath?: string;
  /** @deprecated Use `entryPath`. */
  configPath?: string;
  hostname?: string;
  port?: number;
  /** Also expose the preview on `0.0.0.0` with permissive CORS headers. */
  publicPort?: number;
  watch?: boolean;
}

export interface PreviewServerHandle {
  readonly url: string;
  readonly hostname: string;
  readonly port: number;
  readonly publicUrl?: string;
  readonly publicPort?: number;
  reload(): Promise<void>;
  stop(): Promise<void>;
}

interface CompiledSession {
  mode: "browser-dom";
  artifact: CompiledVisualArtifact;
  config: PreviewConfig<AnyArtifact>;
  dependencies: readonly string[];
}

interface PreviewEntry {
  id: string;
  path: string;
  sourcePath: string;
}

interface PreviewRecord {
  entry: PreviewEntry;
  current?: CompiledSession;
  diagnostic?: PreviewDiagnostic;
}

interface EventClient {
  controller: ReadableStreamDefaultController<Uint8Array>;
}

const encoder = new TextEncoder();
/** Bun browser builds share resolver state; serialize artifact compiles. */
let previewBuildSerial: Promise<void> = Promise.resolve();
let previewAppBundle: Promise<string> | undefined;

export function defaultPreviewSourcePath(): string {
  return resolve(import.meta.dir, "../example");
}

function diagnostic(error: unknown): PreviewDiagnostic {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
  ) {
    const source = error as {
      code: string;
      message?: unknown;
      details?: Readonly<Record<string, unknown>>;
    };
    return {
      code: source.code,
      message: typeof source.message === "string" ? source.message : String(error),
      ...(source.details === undefined ? {} : { details: source.details }),
    };
  }
  return {
    code: "PREVIEW_BUILD_FAILED",
    message: error instanceof Error ? error.message : String(error),
  };
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function corsResponse(request: Request, response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-methods", "GET, OPTIONS");
  headers.set(
    "access-control-allow-headers",
    request.headers.get("access-control-request-headers") ?? "*",
  );
  headers.set("access-control-max-age", "86400");
  headers.append("vary", "access-control-request-headers");
  if (request.headers.get("access-control-request-private-network") === "true") {
    headers.set("access-control-allow-private-network", "true");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function domRuntimeCss(artifact: CompiledVisualArtifact): string {
  const fonts = artifact.fonts
    .filter((font) => font.dataUrl !== undefined)
    .map((font) =>
      `@font-face{font-family:${JSON.stringify(font.family)};src:url(${JSON.stringify(font.dataUrl)})}`)
    .join("\n");
  return `${fonts}\n${artifact.bundleSnapshot?.css ?? ""}`;
}

function domRuntimeJavascript(artifact: CompiledVisualArtifact): string {
  const bundleSnapshot = artifact.bundleSnapshot;
  if (bundleSnapshot === undefined) return "";
  let javascript = bundleSnapshot.javascript;
  for (const asset of bundleSnapshot.imageAssets ?? []) {
    javascript = javascript.replaceAll(
      asset.url,
      `data:${asset.mimeType};base64,${asset.base64}`,
    );
  }
  return javascript;
}

async function compileSessionNow(configPath: string): Promise<CompiledSession> {
  const artifact = await compileVisualArtifact({ entryPath: configPath });
  if (typeof artifact.sourceArtifact !== "function") {
    throw Object.assign(
      new Error("preview entry 的 default export 必须由 defineReact/defineMotion 创建"),
      { code: "ARTIFACT_EXPORT_INVALID" },
    );
  }
  const config = resolveDesignPreview(artifact.sourceArtifact as AnyArtifact);
  const dependencies = artifact.dependencies;
  return { mode: "browser-dom", artifact, config, dependencies };
}

function compileSession(configPath: string): Promise<CompiledSession> {
  const next = previewBuildSerial.then(
    () => compileSessionNow(configPath),
    () => compileSessionNow(configPath),
  );
  previewBuildSerial = next.then(() => undefined, () => undefined);
  return next;
}

function sessionSnapshotId(session: CompiledSession): string {
  return session.artifact.snapshotId;
}

function sessionName(session: CompiledSession): string {
  return session.artifact.name;
}

function sessionKind(session: CompiledSession): "react" | "motion" {
  return session.artifact.kind;
}

async function closeSession(_session: CompiledSession | undefined): Promise<void> {}

async function collectComponentFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  const visit = async (current: string): Promise<void> => {
    const entries = await readdir(current, { withFileTypes: true });
    await Promise.all(entries.map(async (entry) => {
      if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "dist") return;
      const path = resolve(current, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
      } else if (
        entry.isFile() &&
        /\.(?:tsx|jsx)$/.test(entry.name) &&
        !/\.(?:test|spec)\.(?:tsx|jsx)$/.test(entry.name)
      ) {
        files.push(path);
      }
    }));
  };
  await visit(directory);
  return files.sort((left, right) => left.localeCompare(right, "en"));
}

async function discoverEntries(sourcePath: string): Promise<readonly PreviewEntry[]> {
  const information = await stat(sourcePath);
  if (information.isFile()) {
    return [{ id: basename(sourcePath), path: basename(sourcePath), sourcePath }];
  }
  if (!information.isDirectory()) {
    throw new TypeError("preview 入口必须是 artifact 文件或目录");
  }
  const files = await collectComponentFiles(sourcePath);
  return files.map((path) => {
    const displayPath = relative(sourcePath, path).split(sep).join("/");
    return { id: displayPath, path: displayPath, sourcePath: path };
  });
}

async function buildPreviewApp(): Promise<string> {
  const candidates = [
    resolve(import.meta.dir, "preview-app.tsx"),
    resolve(import.meta.dir, "../src/preview-app.tsx"),
  ];
  let entryPath: string | undefined;
  for (const candidate of candidates) {
    if (await Bun.file(candidate).exists()) {
      entryPath = candidate;
      break;
    }
  }
  if (entryPath === undefined) throw new Error("preview React app source is missing");
  const result = await Bun.build({
    entrypoints: [entryPath],
    target: "browser",
    format: "esm",
    splitting: false,
    minify: true,
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
  });
  if (!result.success || result.outputs.length === 0) {
    throw new Error(result.logs.map((log) => log.message).join("\n") || "preview React app build failed");
  }
  return result.outputs[0]!.text();
}

function getPreviewApp(): Promise<string> {
  previewAppBundle ??= buildPreviewApp().catch((error: unknown) => {
    previewAppBundle = undefined;
    throw error;
  });
  return previewAppBundle;
}

function artifactParameter(id: string): string {
  return `artifact=${encodeURIComponent(id)}`;
}

function recordSummary(record: PreviewRecord): Readonly<Record<string, unknown>> {
  const current = record.current;
  if (current === undefined) {
    return {
      id: record.entry.id,
      path: record.entry.path,
      status: "error",
      diagnostic: record.diagnostic ?? {
        code: "PREVIEW_NOT_READY",
        message: "组件尚未编译完成",
      },
    };
  }
  return {
    id: record.entry.id,
    path: record.entry.path,
    status: "ready",
    name: sessionName(current),
    kind: sessionKind(current),
    renderMode: current.mode,
    snapshotId: sessionSnapshotId(current),
    composition: current.config.composition,
    ...(record.diagnostic === undefined ? {} : { diagnostic: record.diagnostic }),
  };
}

function sessionPayload(record: PreviewRecord, current: CompiledSession): Readonly<Record<string, unknown>> {
  const query = artifactParameter(record.entry.id);
  return {
    status: "ready",
    id: record.entry.id,
    path: record.entry.path,
    renderMode: current.mode,
    snapshotId: sessionSnapshotId(current),
    kind: sessionKind(current),
    name: sessionName(current),
    composition: current.config.composition,
    player: {
      background: current.config.player?.background ?? "checkerboard",
      loop: current.config.player?.loop ?? true,
    },
    runtime: {
            scriptUrl: `/api/runtime.js?${query}&snapshot=${encodeURIComponent(current.artifact.snapshotId)}`,
            styleUrl: `/api/runtime.css?${query}&snapshot=${encodeURIComponent(current.artifact.snapshotId)}`,
            seed: current.artifact.seed,
            durationMilliseconds:
              current.artifact.kind === "motion" && current.artifact.motion !== undefined
                ? current.artifact.motion.durationInFrames / DESIGN_PREVIEW_FPS * 1_000
                : current.config.composition.durationSeconds * 1_000,
            durationInFrames:
              current.artifact.kind === "motion" && current.artifact.motion !== undefined
                ? current.artifact.motion.durationInFrames
                : current.config.composition.durationInFrames,
            ...(current.artifact.motion === undefined ? {} : { motion: current.artifact.motion }),
            ...(current.artifact.textSubject === undefined
              ? {}
              : { textSubject: current.artifact.textSubject }),
    },
    ...(record.diagnostic === undefined ? {} : { diagnostic: record.diagnostic }),
  };
}

export async function startPreviewServer(
  options: StartPreviewServerOptions = {},
): Promise<PreviewServerHandle> {
  const sourcePath = resolve(options.entryPath ?? options.configPath ?? defaultPreviewSourcePath());
  const sourceInformation = await stat(sourcePath);
  const watchPath = sourceInformation.isDirectory() ? sourcePath : dirname(sourcePath);
  const hostname = options.hostname ?? "127.0.0.1";
  const port = options.port ?? 3211;
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new TypeError("port 必须是 0—65535 的整数");
  }
  const publicPort = options.publicPort;
  if (
    publicPort !== undefined &&
    (!Number.isInteger(publicPort) || publicPort < 0 || publicPort > 65_535)
  ) {
    throw new TypeError("publicPort 必须是 0—65535 的整数");
  }

  const clients = new Set<EventClient>();
  const assetVersion = randomUUID();
  const playerHtml = PLAYER_HTML.replaceAll(
    "__FOURIER_PREVIEW_ASSET_VERSION__",
    encodeURIComponent(assetVersion),
  );
  let records = new Map<string, PreviewRecord>();
  let watcher: FSWatcher | undefined;
  let debounce: ReturnType<typeof setTimeout> | undefined;
  const pendingChanges = new Set<string>();
  let reloadAll = false;
  let revision = 0;
  let stopped = false;

  const emit = (event: "snapshot" | "diagnostic", value: unknown): void => {
    const bytes = encoder.encode(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`);
    for (const client of clients) {
      try {
        client.controller.enqueue(bytes);
      } catch {
        clients.delete(client);
      }
    }
  };

  const reload = async (changedPaths?: ReadonlySet<string>): Promise<void> => {
    const requestedRevision = ++revision;
    let entries: readonly PreviewEntry[];
    try {
      entries = await discoverEntries(sourcePath);
    } catch (error) {
      if (requestedRevision === revision && !stopped) {
        emit("diagnostic", { id: "", ...diagnostic(error) });
      }
      return;
    }

    const entriesToCompile = changedPaths === undefined
      ? entries
      : entries.filter((entry) => {
          const previous = records.get(entry.id);
          if (previous?.current === undefined) return true;
          return changedPaths.has(entry.sourcePath) || previous.current.dependencies.some(
            (dependency) => changedPaths.has(dependency),
          );
        });
    const compiled = await Promise.all(entriesToCompile.map(async (entry) => {
      try {
        return { entry, session: await compileSession(entry.sourcePath) } as const;
      } catch (error) {
        return { entry, error: diagnostic(error) } as const;
      }
    }));

    if (stopped || requestedRevision !== revision) {
      await Promise.all(compiled.map((result) =>
        "session" in result ? closeSession(result.session) : Promise.resolve()));
      return;
    }

    const previousRecords = records;
    const nextRecords = new Map<string, PreviewRecord>();
    const compiledById = new Map(compiled.map((result) => [result.entry.id, result]));
    for (const entry of entries) {
      const result = compiledById.get(entry.id);
      const previous = previousRecords.get(entry.id);
      if (result === undefined) {
        if (previous !== undefined) nextRecords.set(entry.id, { ...previous, entry });
      } else if ("session" in result) {
        nextRecords.set(entry.id, { entry, current: result.session });
      } else {
        nextRecords.set(entry.id, {
          entry,
          ...(previous?.current === undefined ? {} : { current: previous.current }),
          diagnostic: result.error,
        });
      }
    }
    records = nextRecords;

    await Promise.all([...previousRecords.entries()].map(([id, previous]) => {
      const next = nextRecords.get(id);
      if (previous.current === undefined || next?.current === previous.current) return Promise.resolve();
      return closeSession(previous.current);
    }));

    for (const result of compiled) {
      if ("session" in result) {
        emit("snapshot", {
          id: result.entry.id,
          snapshotId: sessionSnapshotId(result.session),
          name: sessionName(result.session),
        });
      } else {
        emit("diagnostic", { id: result.entry.id, ...result.error });
      }
    }
    for (const [id] of previousRecords) {
      if (!nextRecords.has(id)) emit("snapshot", { id, removed: true });
    }
  };

  await reload();

  const findRecord = (url: URL): PreviewRecord | undefined => {
    const requestedId = url.searchParams.get("artifact");
    if (requestedId !== null) return records.get(requestedId);
    return records.values().next().value as PreviewRecord | undefined;
  };

  const handleRequest = async (request: Request): Promise<Response> => {
      const url = new URL(request.url);
      if (request.method === "GET" && url.pathname === "/") {
        return new Response(playerHtml, {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      }
      if (request.method === "GET" && url.pathname === "/preview-app.css") {
        return new Response(PLAYER_CSS, {
          headers: {
            "content-type": "text/css; charset=utf-8",
            "cache-control": "private, max-age=31536000, immutable",
          },
        });
      }
      if (request.method === "GET" && url.pathname === "/preview-app.js") {
        try {
          return new Response(await getPreviewApp(), {
            headers: {
              "content-type": "text/javascript; charset=utf-8",
              "cache-control": "private, max-age=31536000, immutable",
            },
          });
        } catch (error) {
          return new Response(`throw new Error(${JSON.stringify(diagnostic(error).message)});`, {
            status: 500,
            headers: { "content-type": "text/javascript; charset=utf-8" },
          });
        }
      }
      if (request.method === "GET" && url.pathname === "/api/artifacts") {
        return json({ artifacts: [...records.values()].map(recordSummary) });
      }
      if (request.method === "GET" && url.pathname === "/api/session") {
        const record = findRecord(url);
        if (record?.current === undefined) {
          return json(
            {
              status: "error",
              diagnostic: record?.diagnostic ?? {
                code: records.size === 0 ? "PREVIEW_EMPTY" : "PREVIEW_NOT_FOUND",
                message: records.size === 0 ? "目录中没有找到组件" : "没有找到该组件",
              },
            },
            503,
          );
        }
        return json(sessionPayload(record, record.current));
      }
      if (
        request.method === "GET" &&
        (url.pathname === "/api/runtime.js" || url.pathname === "/api/runtime.css")
      ) {
        const record = findRecord(url);
        const current = record?.current;
        if (current === undefined || current.artifact.bundleSnapshot === undefined) {
          return json(
            { error: { code: "DOM_PREVIEW_NOT_READY", message: "DOM preview runtime 尚未就绪" } },
            404,
          );
        }
        const requestedSnapshot = url.searchParams.get("snapshot");
        if (requestedSnapshot !== current.artifact.snapshotId) {
          return json(
            {
              error: { code: "STALE_PREVIEW_SNAPSHOT", message: "preview snapshot 已更新" },
              snapshotId: current.artifact.snapshotId,
            },
            409,
          );
        }
        const javascript = url.pathname.endsWith(".js");
        return new Response(
          javascript ? domRuntimeJavascript(current.artifact) : domRuntimeCss(current.artifact),
          {
            headers: {
              "content-type": javascript
                ? "text/javascript; charset=utf-8"
                : "text/css; charset=utf-8",
              "cache-control": "private, max-age=31536000, immutable",
              etag: `"${current.artifact.snapshotId}-${javascript ? "js" : "css"}"`,
            },
          },
        );
      }
      if (request.method === "GET" && url.pathname === "/api/events") {
        let client: EventClient | undefined;
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            client = { controller };
            clients.add(client);
            controller.enqueue(encoder.encode("retry: 500\n\n"));
          },
          cancel() {
            if (client !== undefined) clients.delete(client);
          },
        });
        request.signal.addEventListener(
          "abort",
          () => {
            if (client !== undefined) clients.delete(client);
            try {
              client?.controller.close();
            } catch {
              // Client already disconnected.
            }
          },
          { once: true },
        );
        return new Response(stream, {
          headers: {
            "content-type": "text/event-stream",
            "cache-control": "no-store",
            connection: "keep-alive",
          },
        });
      }
      const frameMatch = /^\/api\/frames\/(\d+)\.png$/.exec(url.pathname);
      if (request.method === "GET" && frameMatch !== null) {
        const record = findRecord(url);
        if (record === undefined || record.current === undefined) {
          return json(
            { error: record?.diagnostic ?? { code: "PREVIEW_NOT_READY", message: "预览尚未就绪" } },
            503,
          );
        }
        return json(
          {
            error: {
              code: "DOM_PREVIEW_DIRECT",
              message: "ABI v1.1 preview 由浏览器直接渲染，不提供 PNG 帧接口",
            },
          },
          404,
        );
      }
      return json({ error: { code: "NOT_FOUND", message: "route not found" } }, 404);
  };

  const server = Bun.serve({
    hostname,
    port,
    fetch: handleRequest,
  });
  let publicServer: ReturnType<typeof Bun.serve> | undefined;
  try {
    publicServer = publicPort === undefined
      ? undefined
      : Bun.serve({
        hostname: "0.0.0.0",
        port: publicPort,
        async fetch(request) {
          if (request.method === "OPTIONS") {
            return corsResponse(request, new Response(null, { status: 204 }));
          }
          return corsResponse(request, await handleRequest(request));
        },
      });
  } catch (error) {
    server.stop(true);
    const active = [...records.values()].map((record) => record.current);
    records.clear();
    await Promise.all(active.map(closeSession));
    throw error;
  }

  if (options.watch ?? true) {
    const queueReload = (changedPath?: string): void => {
      if (changedPath === undefined) reloadAll = true;
      else pendingChanges.add(changedPath);
      if (debounce !== undefined) clearTimeout(debounce);
      debounce = setTimeout(() => {
        debounce = undefined;
        const changes = reloadAll ? undefined : new Set(pendingChanges);
        reloadAll = false;
        pendingChanges.clear();
        void reload(changes);
      }, 100);
    };
    try {
      watcher = watch(watchPath, { recursive: true }, (_event, path) => {
        const name = (path === null ? "" : String(path)).split("\\").join("/");
        if (
          name.includes("node_modules/") ||
          name.includes("/.git/") ||
          name.startsWith("dist/") ||
          name.startsWith(".git/")
        ) {
          return;
        }
        queueReload(name === "" ? undefined : resolve(watchPath, name));
      });
    } catch {
      watcher = watch(sourcePath, () => queueReload(sourcePath));
    }
  }

  const actualPort = server.port ?? port;
  const actualPublicPort = publicServer?.port ?? publicPort;
  return Object.freeze({
    hostname,
    port: actualPort,
    url: `http://${hostname}:${actualPort}`,
    ...(actualPublicPort === undefined
      ? {}
      : {
          publicPort: actualPublicPort,
          publicUrl: `http://0.0.0.0:${actualPublicPort}`,
        }),
    reload: () => reload(),
    async stop() {
      if (stopped) return;
      stopped = true;
      revision += 1;
      if (debounce !== undefined) clearTimeout(debounce);
      pendingChanges.clear();
      watcher?.close();
      for (const client of clients) {
        try {
          client.controller.close();
        } catch {
          // Client already disconnected.
        }
      }
      clients.clear();
      const active = [...records.values()].map((record) => record.current);
      records.clear();
      await Promise.all(active.map(closeSession));
      server.stop(true);
      publicServer?.stop(true);
    },
  });
}
