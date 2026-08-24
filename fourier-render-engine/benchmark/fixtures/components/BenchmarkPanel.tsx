import {
  defineReact,
  field,
  useFourierContext,
  useFourierLifecycle,
  useFourierTimeline,
  useLayoutEffect,
  useRef,
} from "@fourier-video/sdk";

export default defineReact({
  name: "BenchmarkPanel",
  schema: {
    title: field.string(),
    value: field.number({ min: 0, max: 1 }),
    showGrid: field.boolean({ default: true }),
    accent: field.color(),
    delay: field.time({ default: "1f" }),
  },
  component({ props }) {
    const context = useFourierContext();
    const timeline = useFourierTimeline();
    const panel = useRef<HTMLDivElement>(null);
    const bar = useRef<HTMLDivElement>(null);
    useFourierLifecycle({ fourierStart() {}, fourierEnd() {} });
    useLayoutEffect(() => {
      if (panel.current === null || bar.current === null) throw new Error("benchmark targets missing");
      timeline.animate(panel.current, [
        { background: "#111827D8" },
        { background: "#0F172AEF" },
      ], { delay: props.delay.seconds * 1_000, fill: "both" });
      timeline.animate(bar.current, [
        { width: "8%" },
        { width: "100%" },
      ], { duration: 800, fill: "both" });
    }, [timeline, props.delay.seconds]);
    return (
      <div ref={panel} style={{
        width: "100%", height: "100%", display: "flex", flexDirection: "column",
        justifyContent: "space-between", padding: "7%", borderRadius: "8%",
        color: "#FFFFFF", fontFamily: "RenderEngineFallback", border: `3px solid ${props.accent}`,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: Math.max(16, Math.round(context.height * 0.09)) }}>
          <span>{props.title}</span><span>{Math.round(props.value * 100)}%</span>
        </div>
        {props.showGrid && <div style={{ display: "flex", flexDirection: "column", gap: Math.max(4, Math.round(context.height * 0.025)), opacity: 0.8 }}>
          {[0.34, 0.57, 0.76].map((width, index) => <div key={index} style={{ display: "flex", width: `${width * 100}%`, height: Math.max(4, Math.round(context.height * 0.018)), background: props.accent }} />)}
        </div>}
        <div style={{ display: "flex", width: "100%", height: Math.max(10, Math.round(context.height * 0.05)), background: "#334155", borderRadius: 999, overflow: "hidden" }}>
          <div ref={bar} style={{ display: "flex", height: "100%", background: props.accent }} />
        </div>
        <div style={{ display: "flex", fontSize: Math.max(10, Math.round(context.height * 0.045)), opacity: 0.7 }}>
          seed {context.seed % 10000}
        </div>
      </div>
    );
  },
  designPreview() {
    return {
      props: { title: "BENCHMARK LOAD", value: 0.72, showGrid: true, accent: "#22c55e", delay: "1f" },
      composition: { width: 360, height: 240, durationSeconds: 2 },
    };
  },
});
