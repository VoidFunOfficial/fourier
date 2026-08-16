import {
  compileVisualArtifact,
  SampleClock,
  VisualTimelineRuntime,
  type CompiledVisualArtifact,
  type RationalTimeInput,
  type TimelineInstance,
  type TimelineSampleResult,
} from "@fourier-video/render-engine";
import { SdkError } from "./errors.ts";
import {
  SDK_ARTIFACT,
  type AnyArtifact,
  type MotionPreviewContext,
  type MotionPreviewDescriptor,
} from "./types.ts";

export type FrameResult = TimelineSampleResult & { readonly frame: number };
export type TimeResult = TimelineSampleResult;

export interface RenderFrameRequest {
  frame: number;
  signal?: AbortSignal;
}

export interface RenderTimeRequest {
  time: RationalTimeInput;
  signal?: AbortSignal;
}

export type DeterminismRequest =
  | { frames: readonly number[]; times?: never }
  | { frames?: never; times: readonly RationalTimeInput[] };

export interface MotionPreviewInspectionRequest {
  anchorFrame: number;
  range: readonly [number, number];
}

export interface ArtifactFixture {
  readonly kind: "react" | "motion";
  readonly name: string;
  readonly snapshotId: string;
  /** Runtime-verified pixel invariance across sample time. */
  readonly isStatic: boolean;
  renderFrame(request: RenderFrameRequest): Promise<FrameResult>;
  renderTime(request: RenderTimeRequest): Promise<TimeResult>;
  assertDeterministic(request: DeterminismRequest): Promise<void>;
  inspectMotionPreview(
    request: MotionPreviewInspectionRequest,
  ): Promise<MotionPreviewDescriptor | undefined>;
  close(): Promise<void>;
}

function ensureDeterminismRequest(request: DeterminismRequest): void {
  const hasFrames = Array.isArray(request.frames) && request.frames.length > 0;
  const hasTimes = Array.isArray(request.times) && request.times.length > 0;
  if (hasFrames === hasTimes) {
    throw new SdkError(
      "INVALID_DETERMINISM_REQUEST",
      "assertDeterministic 必须且只能提供非空 frames 或 times",
    );
  }
}

function motionPreviewContext(
  artifact: CompiledVisualArtifact,
  request: MotionPreviewInspectionRequest,
): MotionPreviewContext {
  const [rangeStartFrame, rangeEndFrame] = request.range;
  const timing = artifact.motion ?? {
    startFrame: 0,
    durationInFrames: artifact.composition.durationInFrames,
    fill: "both" as const,
  };
  return Object.freeze({
    projectId: `artifact:${artifact.name}`,
    motionId: artifact.name,
    hostId: "artifact-host",
    fps: artifact.composition.fps,
    seed: artifact.seed,
    anchorFrame: request.anchorFrame,
    rangeStartFrame,
    rangeEndFrame,
    canvas: { width: artifact.composition.width, height: artifact.composition.height },
    host: {
      x: artifact.composition.width / 2,
      y: artifact.composition.height / 2,
      width: artifact.composition.width,
      height: artifact.composition.height,
      startFrame: 0,
      endFrame: artifact.composition.durationInFrames,
    },
    motion: {
      startFrame: timing.startFrame,
      endFrame: timing.startFrame + timing.durationInFrames,
      durationFrames: timing.durationInFrames,
    },
  });
}

function timelineFixture(
  artifact: CompiledVisualArtifact,
  runtime: VisualTimelineRuntime,
  instance: TimelineInstance,
): ArtifactFixture {
  const clock = new SampleClock(artifact.composition.fpsSource);
  let closed = false;
  const ensureOpen = (): void => {
    if (closed) throw new SdkError("ARTIFACT_FIXTURE_CLOSED", "Artifact fixture 已关闭");
  };
  const renderTime = async (request: RenderTimeRequest): Promise<TimeResult> => {
    ensureOpen();
    return instance.sample(request);
  };
  return Object.freeze({
    kind: artifact.kind,
    name: artifact.name,
    snapshotId: artifact.snapshotId,
    isStatic: instance.isStatic,
    async renderFrame(request: RenderFrameRequest): Promise<FrameResult> {
      ensureOpen();
      if (!Number.isInteger(request.frame) || request.frame < 0 || request.frame >= artifact.composition.durationInFrames) {
        throw new SdkError("ARTIFACT_FRAME_OUT_OF_RANGE", "frame 超出 composition 范围");
      }
      const result = await renderTime({
        time: clock.frameStart(request.frame),
        ...(request.signal === undefined ? {} : { signal: request.signal }),
      });
      return Object.freeze({ ...result, frame: request.frame });
    },
    renderTime,
    async assertDeterministic(request: DeterminismRequest) {
      ensureOpen();
      ensureDeterminismRequest(request);
      const times = request.frames !== undefined
        ? request.frames.map((frame) => clock.frameStart(frame))
        : request.times!;
      for (const time of times) {
        const first = await renderTime({ time });
        const second = await renderTime({ time });
        if (first.sha256 !== second.sha256) {
          throw new SdkError(
            "NON_DETERMINISTIC_ARTIFACT",
            `${artifact.name} 在 ${time.numerator}/${time.denominator}s 两次输出不一致`,
          );
        }
      }
    },
    async inspectMotionPreview(request: MotionPreviewInspectionRequest) {
      ensureOpen();
      if (artifact.kind !== "motion") {
        throw new SdkError("ARTIFACT_KIND_MISMATCH", "只有 Motion artifact 支持 preview descriptor");
      }
      const metadata = typeof artifact.sourceArtifact === "function"
        ? (artifact.sourceArtifact as AnyArtifact)[SDK_ARTIFACT]
        : undefined;
      if (metadata?.kind !== "motion" || metadata.preview === undefined) return undefined;
      return metadata.preview({
        props: artifact.props,
        context: motionPreviewContext(artifact, request),
      });
    },
    async close() {
      if (closed) return;
      closed = true;
      await instance.close();
      await runtime.close();
    },
  });
}

/** Opens an ABI v1 artifact from its source entry path. */
export async function openArtifact(
  entryPath: string,
  options: { exportName?: "default" } = {},
): Promise<ArtifactFixture> {
  const artifact = await compileVisualArtifact({
    entryPath,
    ...(options.exportName === undefined ? {} : { exportName: options.exportName }),
  });
  const runtime = new VisualTimelineRuntime();
  try {
    const instance = await runtime.open(artifact);
    return timelineFixture(artifact, runtime, instance);
  } catch (error) {
    await runtime.close();
    throw error;
  }
}

export type { RationalTimeInput, TimelineSampleResult };
