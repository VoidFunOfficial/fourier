import { Avatar, defineReact, defineSchema } from "@fourier-video/sdk/avatar";
import { voidavatarHybridSource } from "./voidavatar/cubism-source.ts";
import { createPresentationBackend } from "./voidavatar/presentation-backend.ts";
import { createShowcaseTimeline } from "./voidavatar/showcase-timeline.ts";

export default defineReact({
  name: "VoidAvatarShowcase",
  schema: defineSchema({}),
  component() {
    return <div style={{ width: "100%", height: "100%", overflow: "hidden", position: "relative", background: "#f5f2ed" }}>
      <Avatar model={voidavatarHybridSource} createBackend={createPresentationBackend} timeline={createShowcaseTimeline()}
        position={[960, 540]} scale={1} style={{ position: "absolute", inset: 0 }} />
    </div>;
  },
  designPreview() { return { props: {}, composition: { width: 1920, height: 1080, durationSeconds: 30 }, seed: 7, player: { background: "#f5f2ed", loop: true } }; },
});
