import {
  defineMotion,
  useLayoutEffect,
  useRef,
  useFourierLifecycle,
  useFourierTimeline,
  type RefObject,
} from "@fourier-video/sdk";

function useOpacityMotion(target: RefObject<HTMLDivElement | null>): void {
  const timeline = useFourierTimeline();
  useFourierLifecycle({ fourierStart() {}, fourierEnd() {} });
  useLayoutEffect(() => {
    if (target.current === null) throw new Error("missing text motion target");
    timeline.animate(target.current, [{ opacity: 0.25 }, { opacity: 1 }]);
  }, [target, timeline]);
}

export default defineMotion({
  name: "DomTextMotion",
  schema: {},
  supportsTextMotion: true,
  component({ subject }) {
    const target = useRef<HTMLDivElement>(null);
    useOpacityMotion(target);
    return <div ref={target} style={{ width: 80, height: 24 }}>{subject}</div>;
  },
  textComponent({ text }) {
    const target = useRef<HTMLDivElement>(null);
    useOpacityMotion(target);
    return (
      <div
        ref={target}
        data-text-motion={text}
        style={{ width: 80, height: 24, color: "white", background: "#15803d" }}
      >
        {text}
      </div>
    );
  },
  designPreview() {
    return {
      props: {},
      subject: "Fourier text",
      composition: { width: 80, height: 24, durationSeconds: 1 },
    };
  },
});
