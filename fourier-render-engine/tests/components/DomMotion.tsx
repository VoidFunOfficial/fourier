import {
  defineMotion,
  useLayoutEffect,
  useRef,
  useFourierContext,
  useFourierLifecycle,
  useFourierTimeline,
} from "@fourier-video/sdk";

export default defineMotion({
  name: "DomMotion",
  schema: {},
  supportsTextMotion: false,
  component({ subject }) {
    const context = useFourierContext();
    const timeline = useFourierTimeline();
    const target = useRef<HTMLDivElement>(null);
    useFourierLifecycle({ fourierStart() {}, fourierEnd() {} });
    useLayoutEffect(() => {
      if (target.current === null) throw new Error("missing motion target");
      timeline.animate(target.current, [
        { opacity: 0.2, transform: "translateX(6px)" },
        { opacity: 1, transform: "translateX(0px)" },
      ]);
    }, [timeline]);
    return <div ref={target} style={{ width: context.width, height: context.height }}>{subject}</div>;
  },
  designPreview() {
    return {
      props: {},
      subject: <div style={{ width: 16, height: 12, background: "#ef4444" }} />,
      composition: { width: 16, height: 12, durationSeconds: 1 },
    };
  },
});
