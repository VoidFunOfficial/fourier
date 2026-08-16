import {
  createFourierPrng,
  defineMotion,
  defineSchema,
  field,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useFourierContext,
  useFourierLifecycle,
  useFourierTimeline,
  type InferFields,
  type ReactNode,
} from "@fourier-video/sdk/motion";
import placeholderImageUrl from "../placeholder/pic/2.png";

export const glitchMotionSchema = defineSchema({
  intensity: field.number({ label: "故障强度", min: 0, max: 1, default: 0.95 }),
  shake: field.number({ label: "抖动像素", min: 0, max: 80, default: 12 }),
  chromaticOffset: field.number({ label: "色差距离", min: 0, max: 100, default: 18 }),
  sliceCount: field.number({ label: "错位切片", min: 2, max: 14, integer: true, default: 9 }),
  burstRate: field.number({ label: "爆发频率", min: 0, max: 1, default: 0.72 }),
});

export type GlitchMotionProps = InferFields<typeof glitchMotionSchema>;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function subjectLayer(subject: ReactNode, color: string, opacity: number): ReactNode {
  return (
    <div style={{
      position: "absolute",
      inset: 0,
      display: "flex",
      color,
      opacity,
      mixBlendMode: "screen",
    }}>
      {subject}
    </div>
  );
}

export const GlitchMotion = defineMotion({
  name: "TikTokGlitchShake",
  schema: glitchMotionSchema,
  supportsTextMotion: false,
  component({ subject, props }) {
    const context = useFourierContext();
    const timeline = useFourierTimeline();
    const root = useRef<HTMLDivElement>(null);
    const cyan = useRef<HTMLDivElement>(null);
    const magenta = useRef<HTMLDivElement>(null);
    const [ended, setEnded] = useState(false);
    useFourierLifecycle({
      fourierStart() { setEnded(false); },
      fourierEnd() { setEnded(true); },
    });

    const keyframes = useMemo(() => {
      const random = createFourierPrng(
        `${context.seed}:${props.intensity}:${props.shake}:${props.burstRate}`,
      );
      const intensity = clamp(props.intensity, 0, 1);
      return Array.from({ length: 18 }, (_, index): Keyframe => {
        const burst = random() < clamp(props.burstRate, 0, 1);
        const amount = burst ? intensity : intensity * 0.18;
        const x = (random() * 2 - 1) * props.shake * amount;
        const y = (random() * 2 - 1) * props.shake * amount * 0.58;
        const rotation = (random() * 2 - 1) * amount * 0.6;
        return {
          offset: index / 17,
          transform: `translate(${x.toFixed(2)}px,${y.toFixed(2)}px) rotate(${rotation.toFixed(2)}deg)`,
          filter: `contrast(${(1 + amount * 0.45).toFixed(3)}) saturate(${(1 + amount).toFixed(3)})`,
          easing: "steps(1,end)",
        };
      });
    }, [context.seed, props.burstRate, props.intensity, props.shake]);

    useLayoutEffect(() => {
      if (root.current === null || cyan.current === null || magenta.current === null) {
        throw new Error("GlitchMotion targets are missing");
      }
      timeline.animate(root.current, keyframes, { iterations: 1, fill: "both" });
      timeline.animate(cyan.current, [
        { transform: `translateX(${-props.chromaticOffset}px)` },
        { transform: `translateX(${props.chromaticOffset * 0.35}px)` },
        { transform: `translateX(${-props.chromaticOffset * 0.55}px)` },
      ], { iterations: 1, fill: "both", easing: "steps(2,end)" });
      timeline.animate(magenta.current, [
        { transform: `translateX(${props.chromaticOffset}px)` },
        { transform: `translateX(${-props.chromaticOffset * 0.35}px)` },
        { transform: `translateX(${props.chromaticOffset * 0.55}px)` },
      ], { iterations: 1, fill: "both", easing: "steps(2,end)" });
    }, [keyframes, props.chromaticOffset, timeline]);

    const sliceCount = Math.round(clamp(props.sliceCount, 2, 14));
    return (
      <div
        ref={root}
        style={{
          position: "relative",
          width: context.width,
          height: context.height,
          overflow: "hidden",
          opacity: ended ? 1 : 0.8,
          transition: "opacity 1ms linear",
        }}
      >
        <div ref={cyan}>{subjectLayer(subject, "#20eee7", 0.32)}</div>
        <div style={{ position: "absolute", inset: 0, display: "flex" }}>{subject}</div>
        <div ref={magenta}>{subjectLayer(subject, "#ff276f", 0.28)}</div>
        {Array.from({ length: sliceCount }, (_, index) => (
          <div key={index} style={{
            position: "absolute",
            left: 0,
            top: `${index / sliceCount * 100}%`,
            width: "100%",
            height: `${100 / sliceCount}%`,
            borderTop: index % 3 === 0 ? "2px solid rgba(41,245,237,.45)" : undefined,
            transform: `translateX(${index % 2 === 0 ? 1 : -1}px)`,
          }} />
        ))}
      </div>
    );
  },
  preview({ props, context }) {
    const amount = Math.max(props.shake, props.chromaticOffset);
    return {
      representativeProgress: 0.42,
      priority: "primary",
      annotations: [
        { kind: "ghost", progress: 0.42, opacity: 0.38 },
        {
          kind: "arrow",
          from: { x: context.canvas.width / 2 - amount, y: context.canvas.height / 2 },
          to: { x: context.canvas.width / 2 + amount, y: context.canvas.height / 2 },
          color: "#29f5ed",
        },
      ],
    };
  },
  designPreview() {
    return {
      props: {},
      subject: (
        <div style={{ width: 960, height: 540, display: "flex", overflow: "hidden", background: "#060914" }}>
          <img
            src={placeholderImageUrl}
            width={960}
            height={540}
            style={{ width: 960, height: 540, objectFit: "cover" }}
          />
        </div>
      ),
      composition: { width: 960, height: 540, durationSeconds: 3 },
      player: { background: "#050713", loop: true },
      seed: 20260807,
    };
  },
});

export default GlitchMotion;
