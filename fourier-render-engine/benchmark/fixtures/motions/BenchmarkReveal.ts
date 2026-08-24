import {
  defineMotion,
  field,
  createElement,
  useFourierContext,
  useFourierLifecycle,
  useFourierTimeline,
  useLayoutEffect,
  useRef,
} from "@fourier-video/sdk";

export default defineMotion({
  name: "BenchmarkReveal",
  schema: {
    direction: field.enum(["left", "right"] as const, { default: "left" }),
    distance: field.number({ default: 24, min: 0 }),
  },
  supportsTextMotion: false,
  component({ subject, props }) {
    const context = useFourierContext();
    const timeline = useFourierTimeline();
    const target = useRef<HTMLDivElement>(null);
    useFourierLifecycle({ fourierStart() {}, fourierEnd() {} });
    useLayoutEffect(() => {
      if (target.current === null) throw new Error("benchmark motion target missing");
      const direction = props.direction === "right" ? -1 : 1;
      timeline.animate(target.current, [
        { opacity: 0.35, transform: `translateX(${props.distance * direction}px)` },
        { opacity: 1, transform: "translateX(0px)" },
      ], { fill: "both" });
    }, [timeline, props.direction, props.distance]);
    return createElement("div", {
      ref: target,
      style: { width: context.width, height: context.height, display: "flex", overflow: "hidden" },
    }, subject);
  },
  designPreview() {
    return {
      props: {},
      subject: createElement("div", { style: { width: 240, height: 160, background: "#334155" } }),
      composition: { width: 240, height: 160, durationSeconds: 1 },
    };
  },
});
