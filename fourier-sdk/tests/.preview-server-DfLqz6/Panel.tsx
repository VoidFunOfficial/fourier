import { React, defineReact, useFourierTimeline, useLayoutEffect, useRef } from "@fourier-video/sdk";

const artifact = defineReact({
  name: "ServerPanel",
  schema: {},
  component() {
    const root = useRef(null);
    const timeline = useFourierTimeline();
    useLayoutEffect(() => {
      timeline.animate(root.current, [
        { background: "#ff0000" },
        { background: "#00ff00" },
      ]);
    }, [timeline]);
    return React.createElement("div", {
      ref: root,
      style: { width: 24, height: 16, display: "flex" },
    });
  },
  designPreview() {
    return {
      props: {},
      composition: { width: 24, height: 16, durationSeconds: 1 },
    };
  },
});

export default artifact;