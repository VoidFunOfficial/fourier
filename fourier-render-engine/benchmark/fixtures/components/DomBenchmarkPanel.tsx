import React, { useRef } from "react";
import {
  defineReact,
  useFourierLifecycle,
  useFourierTimeline,
} from "@fourier-video/sdk";

const pixel = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Crect width='32' height='32' rx='8' fill='%2322c55e'/%3E%3C/svg%3E";

export default defineReact({
  name: "DomBenchmarkPanel",
  schema: {},
  component() {
    const target = useRef<HTMLDivElement>(null);
    const timeline = useFourierTimeline();
    useFourierLifecycle({
      fourierStart() {
        if (target.current === null) throw new Error("missing benchmark target");
        timeline.animate(target.current, [
          { opacity: 0.2, transform: "translateX(0px) scale(0.9)" },
          { opacity: 1, transform: "translateX(96px) scale(1)" },
        ], { easing: "linear", fill: "both" });
      },
      fourierEnd() {},
    });
    return (
      <main style={{ width: 256, height: 144, background: "#0f172a", overflow: "hidden" }}>
        <div ref={target} style={{ width: 64, height: 64, padding: 16 }}>
          <img src={pixel} alt="" width={32} height={32} />
        </div>
      </main>
    );
  },
  designPreview() {
    return { props: {}, composition: { width: 256, height: 144, durationSeconds: 2 } };
  },
});
