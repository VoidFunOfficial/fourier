import {
  StrictMode,
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { createRoot } from "react-dom/client";

interface PreviewDiagnostic {
  code: string;
  message: string;
}

interface Composition {
  width: number;
  height: number;
  durationSeconds: number;
  durationInFrames: number;
  fps: number;
  static: boolean;
}

interface ArtifactSummary {
  id: string;
  path: string;
  status: "ready" | "error";
  name?: string;
  kind?: "react" | "motion";
  renderMode?: "browser-dom";
  snapshotId?: string;
  composition?: Composition;
  diagnostic?: PreviewDiagnostic;
}

interface RuntimeDescriptor {
  scriptUrl: string;
  styleUrl: string;
  seed: string;
  durationMilliseconds: number;
  durationInFrames: number;
  motion?: {
    startFrame: number;
    durationInFrames: number;
    fill: "none" | "forwards" | "backwards" | "both";
  };
  textSubject?: string;
}

interface PreviewSession {
  status: "ready";
  id: string;
  path: string;
  name: string;
  kind: "react" | "motion";
  renderMode: "browser-dom";
  snapshotId: string;
  composition: Composition;
  player: { background: string; loop: boolean };
  runtime: RuntimeDescriptor;
  diagnostic?: PreviewDiagnostic;
}

interface FourierDomRuntime {
  initialize(input: Readonly<Record<string, unknown>>): Promise<void>;
  setTime(milliseconds: number): Promise<void>;
  setMotionActive(active: boolean): Promise<void>;
}

declare global {
  interface Window {
    __fourierDomTimeline?: FourierDomRuntime;
  }
}

const PREVIEW_FPS = 60;
const PREVIEW_FRAME_MILLISECONDS = 1_000 / PREVIEW_FPS;

function artifactQuery(id: string): string {
  return `artifact=${encodeURIComponent(id)}`;
}

async function requestJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    ...(signal === undefined ? {} : { signal }),
  });
  const value = await response.json() as T & {
    diagnostic?: PreviewDiagnostic;
    error?: PreviewDiagnostic;
  };
  if (!response.ok) {
    throw new Error(value.diagnostic?.message ?? value.error?.message ?? "预览服务暂不可用");
  }
  return value;
}

function useArtifacts(): {
  artifacts: readonly ArtifactSummary[];
  loading: boolean;
  error: string | undefined;
} {
  const [artifacts, setArtifacts] = useState<readonly ArtifactSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    let refreshTimer = 0;
    const controller = new AbortController();
    const refresh = async (): Promise<void> => {
      try {
        const value = await requestJson<{ artifacts: readonly ArtifactSummary[] }>(
          "/api/artifacts",
          controller.signal,
        );
        if (!active) return;
        setArtifacts(value.artifacts);
        setError(undefined);
      } catch (cause) {
        if (!active || controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        if (active) setLoading(false);
      }
    };
    const queueRefresh = (): void => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => void refresh(), 80);
    };
    void refresh();
    const events = new EventSource("/api/events");
    events.addEventListener("snapshot", queueRefresh);
    events.addEventListener("diagnostic", queueRefresh);
    return () => {
      active = false;
      controller.abort();
      events.close();
      window.clearTimeout(refreshTimer);
    };
  }, []);

  return { artifacts, loading, error };
}

function usePreviewSession(
  id: string,
  liveUpdates: boolean,
  refreshKey: string | undefined,
): {
  session: PreviewSession | undefined;
  error: string | undefined;
} {
  const [session, setSession] = useState<PreviewSession>();
  const [error, setError] = useState<string>();
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void requestJson<PreviewSession>(`/api/session?${artifactQuery(id)}`, controller.signal)
      .then((value) => {
        if (!active) return;
        setSession(value);
        setError(undefined);
      })
      .catch((cause: unknown) => {
        if (!active || controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [id, refreshKey, revision]);

  useEffect(() => {
    if (!liveUpdates) return;
    const events = new EventSource("/api/events");
    const refreshIfMatching = (event: Event): void => {
      if (!(event instanceof MessageEvent)) return;
      try {
        const value = JSON.parse(String(event.data)) as { id?: string };
        if (value.id === id) setRevision((current) => current + 1);
      } catch {
        // Ignore malformed development events; the stream will keep running.
      }
    };
    events.addEventListener("snapshot", refreshIfMatching);
    events.addEventListener("diagnostic", refreshIfMatching);
    return () => events.close();
  }, [id, liveUpdates]);

  return { session, error };
}

function loadStyle(url: string): { element: HTMLLinkElement; loaded: Promise<void> } {
  const element = document.createElement("link");
  element.rel = "stylesheet";
  element.href = url;
  const loaded = new Promise<void>((resolve, reject) => {
    element.addEventListener("load", () => resolve(), { once: true });
    element.addEventListener("error", () => reject(new Error("无法加载组件样式")), { once: true });
  });
  document.head.appendChild(element);
  return { element, loaded };
}

function loadScript(url: string): { element: HTMLScriptElement; loaded: Promise<void> } {
  const element = document.createElement("script");
  element.src = url;
  element.async = true;
  const loaded = new Promise<void>((resolve, reject) => {
    element.addEventListener("load", () => resolve(), { once: true });
    element.addEventListener("error", () => reject(new Error("无法加载组件 runtime")), { once: true });
  });
  document.head.appendChild(element);
  return { element, loaded };
}

function motionSample(session: PreviewSession, target: number): {
  active: boolean;
  milliseconds: number;
} {
  const timing = session.runtime?.motion;
  if (timing === undefined) {
    return { active: true, milliseconds: target * PREVIEW_FRAME_MILLISECONDS };
  }
  const end = timing.startFrame + timing.durationInFrames;
  if (target < timing.startFrame) {
    return {
      active: timing.fill === "backwards" || timing.fill === "both",
      milliseconds: 0,
    };
  }
  if (target >= end) {
    return {
      active: timing.fill === "forwards" || timing.fill === "both",
      milliseconds: timing.durationInFrames * PREVIEW_FRAME_MILLISECONDS,
    };
  }
  return {
    active: true,
    milliseconds: (target - timing.startFrame) * PREVIEW_FRAME_MILLISECONDS,
  };
}

interface PreviewLayout {
  readonly centerX: number;
  readonly centerY: number;
  readonly scale: number;
}

function usePreviewLayout(
  container: React.RefObject<HTMLDivElement | null>,
  composition: Composition | undefined,
): PreviewLayout {
  const [layout, setLayout] = useState<PreviewLayout>({
    centerX: 0,
    centerY: 0,
    scale: 1,
  });
  useLayoutEffect(() => {
    const element = container.current;
    if (element === null || composition === undefined) return;
    const update = (): void => {
      const width = element.clientWidth;
      const height = element.clientHeight;
      if (width <= 0 || height <= 0) return;
      const padding = width < 600 ? 0 : 24;
      const widthScale = Math.max(1, width - padding * 2) / composition.width;
      const heightScale = Math.max(1, height - padding * 2) / composition.height;
      const next = {
        centerX: width / 2,
        centerY: height / 2,
        scale: Math.max(0.01, Math.min(widthScale, heightScale, 4)),
      };
      setLayout((current) =>
        current.centerX === next.centerX &&
          current.centerY === next.centerY &&
          current.scale === next.scale
          ? current
          : next
      );
    };
    update();
    window.addEventListener("resize", update, { passive: true });
    const observer = typeof ResizeObserver === "undefined"
      ? undefined
      : new ResizeObserver(update);
    observer?.observe(element);
    return () => {
      window.removeEventListener("resize", update);
      observer?.disconnect();
    };
  }, [composition, container]);
  return layout;
}

function useViewportPresence(element: RefObject<HTMLElement | null>): boolean {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const target = element.current;
    if (target === null || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry?.isIntersecting ?? false),
      { rootMargin: "80px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [element]);
  return visible;
}

function useDocumentVisibility(): boolean {
  const [visible, setVisible] = useState(() => document.visibilityState !== "hidden");
  useEffect(() => {
    const update = (): void => setVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return visible;
}

function PreviewPlayer({
  artifactId,
  compact = false,
  autoPlay = false,
  liveUpdates = true,
  refreshKey,
}: {
  artifactId: string;
  compact?: boolean;
  autoPlay?: boolean;
  liveUpdates?: boolean;
  refreshKey?: string;
}): ReactNode {
  const { session, error } = usePreviewSession(artifactId, liveUpdates, refreshKey);
  const [ready, setReady] = useState(false);
  const [runtimeError, setRuntimeError] = useState<string>();
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(true);
  const mount = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const runtime = useRef<FourierDomRuntime | undefined>(undefined);
  const frameRef = useRef(0);
  const runtimeGeneration = useRef(0);
  const sampleRequest = useRef(0);
  const sampleSerial = useRef<Promise<void>>(Promise.resolve());
  const motionActive = useRef<boolean | undefined>(undefined);
  const previewLayout = usePreviewLayout(viewport, session?.composition);
  const inViewport = useViewportPresence(stage);
  const documentVisible = useDocumentVisibility();

  const stop = useCallback((): void => setPlaying(false), []);

  useEffect(() => {
    setReady(false);
    setRuntimeError(undefined);
    setPlaying(false);
    setFrame(0);
    frameRef.current = 0;
    const generation = runtimeGeneration.current + 1;
    runtimeGeneration.current = generation;
    sampleRequest.current += 1;
    sampleSerial.current = Promise.resolve();
    motionActive.current = undefined;
    const target = mount.current;
    if (target === null || session === undefined) return;
    let active = true;
    let styleElement: HTMLLinkElement | undefined;
    let scriptElement: HTMLScriptElement | undefined;
    target.replaceChildren();
    setLoop(session.player.loop !== false);

    const initialize = async (): Promise<void> => {
      const root = document.createElement("div");
      root.id = "fourier-root";
      root.style.width = `${session.composition.width}px`;
      root.style.height = `${session.composition.height}px`;
      target.appendChild(root);
      const style = loadStyle(session.runtime.styleUrl);
      const script = loadScript(session.runtime.scriptUrl);
      styleElement = style.element;
      scriptElement = script.element;
      await Promise.all([style.loaded, script.loaded]);
      if (!active) return;
      const loadedRuntime = window.__fourierDomTimeline;
      if (loadedRuntime === undefined) throw new Error("组件 runtime 未注册");
      runtime.current = loadedRuntime;
      const initialization: Record<string, unknown> = {
        width: session.composition.width,
        height: session.composition.height,
        fps: PREVIEW_FPS,
        seed: session.runtime.seed,
        durationMilliseconds: session.runtime.durationMilliseconds,
        durationInFrames: session.runtime.durationInFrames,
        useDesignPreview: true,
        directPreview: true,
      };
      if (session.runtime.textSubject !== undefined) {
        initialization.textSubject = session.runtime.textSubject;
      }
      await loadedRuntime.initialize(initialization);
      if (active && runtimeGeneration.current === generation) setReady(true);
    };
    void initialize().catch((cause: unknown) => {
      if (active) setRuntimeError(cause instanceof Error ? cause.message : String(cause));
    });

    return () => {
      active = false;
      if (runtimeGeneration.current === generation) runtimeGeneration.current += 1;
      sampleRequest.current += 1;
      sampleSerial.current = Promise.resolve();
      motionActive.current = undefined;
      styleElement?.remove();
      scriptElement?.remove();
      target.replaceChildren();
      runtime.current = undefined;
      delete window.__fourierDomTimeline;
    };
  }, [session]);

  const showFrame = useCallback(async (requestedFrame: number): Promise<void> => {
    if (!ready || session === undefined) return;
    const target = Math.max(
      0,
      Math.min(session.composition.durationInFrames - 1, Math.round(requestedFrame)),
    );
    const generation = runtimeGeneration.current;
    const request = sampleRequest.current + 1;
    sampleRequest.current = request;
    const render = async (): Promise<void> => {
      if (
        generation !== runtimeGeneration.current ||
        request !== sampleRequest.current
      ) return;
      try {
        const activeRuntime = runtime.current;
        if (activeRuntime === undefined) throw new Error("组件 runtime 尚未就绪");
        const sample = motionSample(session, target);
        if (motionActive.current !== sample.active) {
          await activeRuntime.setMotionActive(sample.active);
          if (
            generation !== runtimeGeneration.current ||
            request !== sampleRequest.current
          ) return;
          motionActive.current = sample.active;
        }
        if (sample.active) await activeRuntime.setTime(sample.milliseconds);
        if (
          generation !== runtimeGeneration.current ||
          request !== sampleRequest.current
        ) return;
        frameRef.current = target;
        if (!compact) setFrame(target);
        setRuntimeError(undefined);
      } catch (cause) {
        if (generation !== runtimeGeneration.current) return;
        setRuntimeError(cause instanceof Error ? cause.message : String(cause));
        setPlaying(false);
      }
    };
    const queued = sampleSerial.current.then(render, render);
    sampleSerial.current = queued.then(() => undefined, () => undefined);
    await queued;
  }, [compact, ready, session]);

  useEffect(() => {
    if (!ready) return;
    let active = true;
    void showFrame(0).then(() => {
      if (active && autoPlay && session?.composition.static === false) setPlaying(true);
    });
    return () => {
      active = false;
    };
  }, [autoPlay, ready, session, showFrame]);

  useEffect(() => {
    if (
      !playing ||
      !inViewport ||
      !documentVisible ||
      session === undefined ||
      session.composition.static
    ) return;
    let active = true;
    let animationFrame = 0;
    let startedAt: number | undefined;
    const startedFrame = frameRef.current;
    const schedule = (): void => {
      animationFrame = window.requestAnimationFrame((timestamp) => void tick(timestamp));
    };
    const tick = async (timestamp: number): Promise<void> => {
      startedAt ??= timestamp;
      const elapsedFrames = Math.floor(
        (timestamp - startedAt) / PREVIEW_FRAME_MILLISECONDS + 1e-6,
      );
      const absoluteFrame = startedFrame + elapsedFrames;
      let target = absoluteFrame;
      if (absoluteFrame >= session.composition.durationInFrames) {
        if (!(compact || loop)) {
          await showFrame(session.composition.durationInFrames - 1);
          if (!active) return;
          setPlaying(false);
          return;
        }
        target %= session.composition.durationInFrames;
      }
      if (target !== frameRef.current) await showFrame(target);
      if (!active) return;
      schedule();
    };
    schedule();
    return () => {
      active = false;
      window.cancelAnimationFrame(animationFrame);
    };
  }, [compact, documentVisible, inViewport, loop, playing, session, showFrame]);

  useEffect(() => {
    if (compact || session === undefined) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target;
      if (target instanceof HTMLInputElement) return;
      if (event.code === "Space" && !session.composition.static) {
        event.preventDefault();
        setPlaying((current) => !current);
      } else if (event.code === "ArrowLeft") {
        event.preventDefault();
        stop();
        void showFrame(frameRef.current - 1);
      } else if (event.code === "ArrowRight") {
        event.preventDefault();
        stop();
        void showFrame(frameRef.current + 1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [compact, session, showFrame, stop]);

  const stageClass = session?.player.background === "checkerboard" || session?.player.background === undefined
    ? "preview-stage checkerboard"
    : "preview-stage";
  const stageStyle = session !== undefined && session.player.background !== "checkerboard"
    ? { background: session.player.background }
    : undefined;
  const staticPreview = session?.composition.static ?? true;
  const visibleError = error ?? runtimeError;

  return (
    <div className={`preview-player${compact ? " compact" : ""}`}>
      <div ref={stage} className={stageClass} style={stageStyle}>
        <div ref={viewport} className="preview-viewport">
          <div
            ref={mount}
            className="preview-mount"
            style={session === undefined ? undefined : {
              width: session.composition.width,
              height: session.composition.height,
              left: previewLayout.centerX - session.composition.width / 2,
              top: previewLayout.centerY - session.composition.height / 2,
              transform: `scale(${previewLayout.scale})`,
            }}
          />
        </div>
        {visibleError !== undefined ? <div className="preview-error">{visibleError}</div> : null}
        {visibleError === undefined && !ready ? <div className="preview-loading" aria-label="正在加载组件" /> : null}
        {compact && ready ? (
          <div className="compact-badge"><span className="live-dot" /> Live preview</div>
        ) : null}
      </div>
      {!compact && session !== undefined ? (
        <>
          <div className="player-controls">
            <button
              className="control-button"
              type="button"
              aria-label="上一帧"
              disabled={staticPreview}
              onClick={() => { stop(); void showFrame(frameRef.current - 1); }}
            >−</button>
            <button
              className="control-button primary"
              type="button"
              aria-label={playing ? "暂停" : "播放"}
              disabled={staticPreview}
              onClick={() => setPlaying((current) => !current)}
            >{playing ? "Ⅱ" : "▶"}</button>
            <button
              className="control-button"
              type="button"
              aria-label="下一帧"
              disabled={staticPreview}
              onClick={() => { stop(); void showFrame(frameRef.current + 1); }}
            >＋</button>
            <input
              className="timeline"
              id="timeline"
              type="range"
              min="0"
              max={Math.max(0, session.composition.durationInFrames - 1)}
              step="1"
              value={frame}
              disabled={staticPreview}
              aria-label="预览时间轴"
              onChange={(event) => {
                stop();
                void showFrame(Number(event.currentTarget.value));
              }}
            />
            <span className="position" id="position">
              {staticPreview ? "STATIC · 0f" : `${frame}f · ${(frame / PREVIEW_FPS).toFixed(2)}s`}
            </span>
            <label className="loop-control">
              <input
                type="checkbox"
                checked={loop}
                disabled={staticPreview}
                onChange={(event) => setLoop(event.currentTarget.checked)}
              />
              循环
            </label>
          </div>
          <div className="player-status" id="status">
            <span className={runtimeError === undefined ? "" : "error"}>
              {runtimeError ?? "浏览器 DOM 实时渲染 · 60fps"}
            </span>
            <span className="snapshot">snapshot {session.snapshotId.slice(0, 12)}</span>
          </div>
        </>
      ) : null}
    </div>
  );
}

function Brand(): ReactNode {
  return (
    <span className="brand">
      <span className="brand-mark" aria-hidden="true" />
      Fourier Studio
    </span>
  );
}

function useNearViewport(): {
  ref: RefObject<HTMLElement | null>;
  nearViewport: boolean;
} {
  const ref = useRef<HTMLElement>(null);
  const [nearViewport, setNearViewport] = useState(false);
  useEffect(() => {
    const target = ref.current;
    if (target === null || typeof IntersectionObserver === "undefined") {
      setNearViewport(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setNearViewport(entry?.isIntersecting ?? false),
      { rootMargin: "320px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, []);
  return { ref, nearViewport };
}

function PreviewCard({
  artifact,
  index,
}: {
  artifact: ArtifactSummary;
  index: number;
}): ReactNode {
  const { ref, nearViewport } = useNearViewport();
  const snapshot = artifact.snapshotId ?? "pending";
  return (
    <article
      ref={ref}
      className={`component-card ${artifact.kind ?? "error"}`}
      style={{ "--index": index } as CSSProperties}
    >
      <div className="card-preview">
        {artifact.status === "ready" && nearViewport ? (
          <iframe
            key={snapshot}
            src={`/?embed=${encodeURIComponent(artifact.id)}&snapshot=${encodeURIComponent(snapshot)}`}
            title={`${artifact.name ?? artifact.path} 自动播放预览`}
            loading="lazy"
          />
        ) : artifact.status === "ready" ? (
          <div className="card-preview-idle" aria-label="预览将在接近视口时加载" />
        ) : (
          <div className="card-no-preview">{artifact.diagnostic?.message ?? "组件编译失败"}</div>
        )}
      </div>
      <div className="card-body">
        <div>
          <div className="card-kicker">{artifact.kind ?? "Build error"}</div>
          <h2 className="card-title">{artifact.name ?? artifact.path}</h2>
          <p className="card-path">{artifact.path}</p>
        </div>
        <span className="card-open" aria-hidden="true">↗</span>
      </div>
      {artifact.status === "ready" ? (
        <a
          className="card-link"
          href={`/?component=${encodeURIComponent(artifact.id)}`}
          aria-label={`查看 ${artifact.name ?? artifact.path} 详情`}
        />
      ) : null}
    </article>
  );
}

function Gallery(): ReactNode {
  const { artifacts, loading, error } = useArtifacts();
  const [filter, setFilter] = useState<"all" | "react" | "motion">("all");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim().toLocaleLowerCase());
  const visible = useMemo(() => artifacts.filter((artifact) => {
    if (filter !== "all" && artifact.kind !== filter) return false;
    if (deferredSearch.length === 0) return true;
    return `${artifact.name ?? ""} ${artifact.path}`.toLocaleLowerCase().includes(deferredSearch);
  }), [artifacts, deferredSearch, filter]);
  const motionCount = artifacts.filter((artifact) => artifact.kind === "motion").length;
  const reactCount = artifacts.filter((artifact) => artifact.kind === "react").length;

  return (
    <main className="shell">
      <header className="topbar">
        <Brand />
        <span className="topbar-note">Local component library · {artifacts.length} pieces</span>
      </header>
      <section className="hero">
        <div>
          <p className="eyebrow">Component preview</p>
          <h1>Watch ideas<br />come <em>alive.</em></h1>
        </div>
        <p className="hero-copy">
          浏览、播放并检查 example 中的每个组件。点击任意作品，进入逐帧预览与完整参数详情。
        </p>
      </section>
      <section aria-label="组件库">
        <div className="library-toolbar">
          <div className="filters" role="group" aria-label="按组件类型筛选">
            {([
              ["all", `全部 ${artifacts.length}`],
              ["motion", `Motion ${motionCount}`],
              ["react", `React ${reactCount}`],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`filter-button${filter === value ? " active" : ""}`}
                onClick={() => setFilter(value)}
              >{label}</button>
            ))}
          </div>
          <label className="search-wrap">
            <span hidden>搜索组件</span>
            <input
              className="search"
              type="search"
              value={search}
              placeholder="搜索名称或路径"
              onChange={(event) => setSearch(event.currentTarget.value)}
            />
          </label>
        </div>
        {loading ? <div className="loading-state"><span /></div> : null}
        {!loading && error !== undefined ? <div className="empty-state">{error}</div> : null}
        {!loading && error === undefined && visible.length === 0 ? (
          <div className="empty-state">没有找到匹配的组件</div>
        ) : null}
        {!loading && error === undefined && visible.length > 0 ? (
          <div className="component-grid">
            {visible.map((artifact, index) => (
              <PreviewCard key={artifact.id} artifact={artifact} index={index} />
            ))}
          </div>
        ) : null}
      </section>
    </main>
  );
}

function formatDuration(composition: Composition | undefined): string {
  if (composition === undefined) return "—";
  if (composition.static) return "静态组件";
  return `${composition.durationSeconds}s · DOM 60fps`;
}

function Detail({ artifactId }: { artifactId: string }): ReactNode {
  const { artifacts, loading } = useArtifacts();
  const artifact = artifacts.find((candidate) => candidate.id === artifactId);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.code === "Escape") window.location.assign("/");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (loading) return <div className="loading-state"><span /></div>;
  if (artifact === undefined || artifact.status !== "ready") {
    return (
      <main className="detail-shell">
        <header className="detail-topbar"><Brand /><a className="back-link" href="/">← 返回组件库</a></header>
        <div className="empty-state">组件不存在或暂未编译成功</div>
      </main>
    );
  }

  return (
    <main className="detail-shell">
      <header className="detail-topbar">
        <Brand />
        <a className="back-link" href="/"><span>←</span> 返回组件库 <span className="key-hint">ESC</span></a>
      </header>
      <section className="detail-heading">
        <div>
          <div className="detail-type">{artifact.kind} component</div>
          <h1>{artifact.name}</h1>
        </div>
        <span className="topbar-note">Space 播放 · ← → 1/60s</span>
      </section>
      <section className="detail-grid">
        <div className="detail-player-card">
          <PreviewPlayer
            artifactId={artifactId}
            autoPlay
            liveUpdates={false}
            {...(artifact.snapshotId === undefined ? {} : { refreshKey: artifact.snapshotId })}
          />
        </div>
        <aside className="detail-aside" aria-label="组件信息">
          <Fact label="类型" value={artifact.kind === "motion" ? "Motion" : "React"} />
          <Fact
            label="画布"
            value={artifact.composition === undefined ? "—" : `${artifact.composition.width} × ${artifact.composition.height}`}
          />
          <Fact label="时长" value={formatDuration(artifact.composition)} />
          <Fact label="渲染" value="Browser DOM · 60fps" />
          <Fact label="源文件" value={artifact.path} mono />
          <Fact label="Snapshot" value={artifact.snapshotId?.slice(0, 16) ?? "—"} mono />
        </aside>
      </section>
    </main>
  );
}

function Fact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }): ReactNode {
  return (
    <div className="fact">
      <div className="fact-label">{label}</div>
      <div className={`fact-value${mono ? " mono" : ""}`}>{value}</div>
    </div>
  );
}

function App(): ReactNode {
  const query = new URLSearchParams(window.location.search);
  const embedded = query.get("embed");
  const selected = query.get("component");
  if (embedded !== null) {
    const snapshot = query.get("snapshot");
    return (
      <PreviewPlayer
        artifactId={embedded}
        compact
        autoPlay
        liveUpdates={false}
        {...(snapshot === null ? {} : { refreshKey: snapshot })}
      />
    );
  }
  if (selected !== null) return <Detail artifactId={selected} />;
  return <Gallery />;
}

const query = new URLSearchParams(window.location.search);
if (query.has("embed")) document.body.classList.add("preview-embed");

const rootElement = document.getElementById("root");
if (rootElement === null) throw new Error("Fourier preview root is missing");
createRoot(rootElement).render(<StrictMode><App /></StrictMode>);
