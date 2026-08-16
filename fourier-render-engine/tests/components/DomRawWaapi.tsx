import { defineReact, useLayoutEffect, useRef } from "@fourier-video/sdk";

export default defineReact({
  name: "DomRawWaapi",
  schema: {},
  component() {
    const target = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
      target.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 1000 });
    }, []);
    return <div ref={target} />;
  },
  designPreview() {
    return { props: {}, composition: { width: 32, height: 24, durationSeconds: 1 } };
  },
});
