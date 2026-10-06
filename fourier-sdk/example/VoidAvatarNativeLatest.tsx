import { defineReact, defineSchema, useState, type AvatarTimeline } from "@fourier-video/sdk/avatar";
import { VoidAvatar, createVoidTimeline } from "./voidavatar/index.ts";

/** Latest saved Cubism model: a clean 30-second, thirteen-expression performance. */
function createPerformance(): AvatarTimeline {
  const base = createVoidTimeline({ duration: 30, expression: "neutral", seed: 7,
    motion: { amount: 1.25 }, actions: [
      { at: 2, action: "nod", duration: 1.6 },
      { at: 12.3, action: "shakeHead", duration: 1.8 },
      { at: 27, action: "nod", duration: 1.8 },
    ] });
  return Object.freeze({ duration: 30, sample(time: number) {
    const pose = base.sample(time);
    const expression = Math.max(0, Math.min(12, Math.floor((time - 4) / 2)));
    return { ...pose, EyeArt: expression, BrowArt: expression,
      BrowL: Math.max(-1, Math.min(1, (pose.BrowL ?? 0) + .16 * Math.sin(time * 1.7))),
      BrowR: Math.max(-1, Math.min(1, (pose.BrowR ?? 0) + .12 * Math.sin(time * 1.7 - .55))),
    };
  } });
}

export default defineReact({
  name: "VoidAvatarNativeLatest",
  schema: defineSchema({}),
  component() {
    const [timeline] = useState(createPerformance);
    return <div style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden", background: "#f5f2ed" }}>
      <VoidAvatar mode="source" timeline={timeline} position={[960, 550]} scale={.62} />
    </div>;
  },
  designPreview() {
    return { props: {}, composition: { width: 1920, height: 1080, durationSeconds: 30 }, seed: 7,
      player: { background: "#f5f2ed", loop: true } };
  },
});
