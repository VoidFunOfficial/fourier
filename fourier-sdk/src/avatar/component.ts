import { createElement, useMemo, useRef, type CSSProperties, type ReactElement } from "react";
import { useFourierContext, useFourierRenderDriver, type FourierRenderDriver } from "../runtime.ts";
import { avatarFail, defineAvatar } from "./model.ts";
import { createCubismAvatar, decodeAvatarMoc, type CubismAvatarSource } from "./cubism.ts";
import { createAvatarMeshRig, createLayerAvatar } from "./rig.ts";
import { compileAvatarTimeline } from "./timeline.ts";
import { AvatarWebGLRenderer, type AvatarPlacement } from "./webgl.ts";
import type { AvatarAction, AvatarBackend, AvatarGesture, AvatarModel, AvatarTimeline, AvatarTimelineOptions } from "./types.ts";

export interface AvatarProps extends Omit<AvatarTimelineOptions, "duration">, AvatarPlacement {
  /** A validated native rig, or a local .moc3/.model3.json import. */
  readonly model: AvatarModel | CubismAvatarSource;
  /** Optional Fourier transforms over the backend's existing mesh IDs; never edits the MOC. */
  readonly rig?: AvatarModel;
  readonly duration?: number;
  readonly gesture?: AvatarGesture | readonly AvatarAction[];
  readonly timeline?: AvatarTimeline;
  /** Optional Cubism or other renderer backend. Called only in the preparation phase. */
  readonly createBackend?: () => AvatarBackend | Promise<AvatarBackend>;
  readonly className?: string;
  readonly style?: CSSProperties;
}
/** Declarative Avatar renderer sampled by the existing Fourier host, never a ticker. */
export function Avatar(props: AvatarProps): ReactElement {
  const context = useFourierContext(); const canvasRef = useRef<HTMLCanvasElement>(null);
  const initial = useRef(props); const placement = useRef<AvatarPlacement>(props); placement.current = props;
  const driver = useMemo<FourierRenderDriver>(() => {
    let backend: AvatarBackend | undefined, renderer: AvatarWebGLRenderer | undefined, timeline: AvatarTimeline | undefined;
    let promise: Promise<void> | undefined; let disposed = false;
    const dispose = () => { if (disposed) return; disposed = true; renderer?.dispose(); backend?.dispose(); };
    return {
      ready() {
        return promise ??= (async () => {
          const p = initial.current; const duration = p.duration ?? context.durationMilliseconds / 1000;
          const actions = [...(p.actions ?? []), ...(typeof p.gesture === "string" ? [{ at: 0, action: p.gesture, duration }] : p.gesture ?? [])];
          try {
            const cubism = "kind" in p.model && p.model.kind === "cubism" ? p.model : undefined;
            backend = p.createBackend ? await p.createBackend() : cubism
              ? createCubismAvatar({ core: await cubism.createCore(), moc: decodeAvatarMoc(cubism.mocBase64), textures: cubism.textures,
                ...(cubism.parameterMap ? { parameterMap: cubism.parameterMap } : {}) })
              : createLayerAvatar(p.model as AvatarModel);
            if (disposed) { backend.dispose(); return; }
            if (p.rig) backend = createAvatarMeshRig(backend, p.rig);
            const timelineModel = p.rig ?? (cubism ? defineAvatar({ version: 1, name: cubism.name, canvas: backend.canvas, layers: [] }) : p.model as AvatarModel);
            const { idle, expression, lookAt, targets, speak, parameters } = p;
            timeline = p.timeline ?? compileAvatarTimeline(timelineModel, { duration, seed: p.seed ?? context.seed, actions,
              ...(idle !== undefined ? { idle } : {}), ...(expression !== undefined ? { expression } : {}),
              ...(lookAt !== undefined ? { lookAt } : {}), ...(targets !== undefined ? { targets } : {}),
              ...(speak !== undefined ? { speak } : {}), ...(parameters !== undefined ? { parameters } : {}) });
            if (!canvasRef.current) avatarFail("Avatar canvas 尚未挂载");
            renderer = new AvatarWebGLRenderer(canvasRef.current, backend); await renderer.ready();
          } catch (error) { dispose(); throw error; }
        })();
      },
      render(frame) {
        if (!renderer || !timeline || disposed) avatarFail("Avatar 尚未准备就绪");
        renderer.render(timeline.sample(frame.timeSeconds), placement.current);
      }, dispose,
    };
  }, [context]);
  useFourierRenderDriver(driver);
  return createElement("canvas", { ref: canvasRef, width: context.width, height: context.height,
    className: props.className, "aria-label": props.model.name,
    style: { display: "block", width: context.width, height: context.height, ...props.style } });
}
