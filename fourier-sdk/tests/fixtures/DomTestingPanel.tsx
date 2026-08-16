import {
  defineReact,
  field,
  useState,
  useFourierContext,
  useFourierLifecycle,
} from "@fourier-video/sdk";

export default defineReact({
  name: "DomTestingPanel",
  schema: { label: field.string({ default: "preview-default" }) },
  component({ props }) {
    const context = useFourierContext();
    const [ended, setEnded] = useState(false);
    useFourierLifecycle({
      fourierStart() { setEnded(false); },
      fourierEnd() { setEnded(true); },
    });
    return <div data-label={props.label} style={{
      width: context.width,
      height: context.height,
      background: ended ? "#22c55e" : "#ef4444",
      opacity: ended ? 1 : 0,
      transition: "opacity 1000ms linear",
    }} />;
  },
  designPreview() {
    return { props: {}, composition: { width: 32, height: 24, durationSeconds: 1 } };
  },
});
