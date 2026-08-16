import {
  defineReact,
  field,
  useLayoutEffect,
  useRef,
  useState,
  useFourierContext,
  useFourierLifecycle,
  useFourierTimeline,
} from "@fourier-video/sdk";

export default defineReact({
  name: "DomTimelinePanel",
  schema: { accent: field.color({ default: "#22c55e" }) },
  component({ props }) {
    const context = useFourierContext();
    const timeline = useFourierTimeline();
    const target = useRef<HTMLDivElement>(null);
    const [ended, setEnded] = useState(false);
    useFourierLifecycle({
      fourierStart() { setEnded(false); },
      fourierEnd() { setEnded(true); },
    });
    useLayoutEffect(() => {
      if (target.current === null) throw new Error("missing target");
      timeline.animate(target.current, [
        { borderRadius: "0px" },
        { borderRadius: "24px" },
      ]);
    }, [timeline]);
    return (
      <div
        ref={target}
        style={{
          width: context.width,
          height: context.height,
          background: props.accent,
          opacity: ended ? 1 : 0.2,
          transform: ended ? "translateX(0px)" : "translateX(16px)",
          transition: "opacity 1000ms linear, transform 1000ms linear",
        }}
      />
    );
  },
  designPreview() {
    return {
      props: {},
      composition: { width: 64, height: 64, durationSeconds: 1 },
      seed: 7,
    };
  },
});
