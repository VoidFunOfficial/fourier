import { Avatar, defineReact, defineSchema, field } from "@fourier-video/sdk/avatar";
import { voidavatarHybridSource } from "./voidavatar/cubism-source.ts";
import { createPresentationBackend } from "./voidavatar/presentation-backend.ts";
import { createPropsTimeline, propsShowcaseDuration, voidavatarPropShowcaseOrder } from "./voidavatar/props-timeline.ts";

export default defineReact({
  name: "VoidAvatarProps",
  schema: defineSchema({
    prop: field.enum(["all", ...voidavatarPropShowcaseOrder] as const, { default: "all", label: "手持道具" }),
    transparent: field.boolean({ default: false, label: "透明背景" }),
  }),
  component({ props }) {
    return <div style={{ width: "100%", height: "100%", overflow: "hidden", position: "relative", background: props.transparent ? "transparent" : "#f5f2ed" }}>
      <Avatar model={voidavatarHybridSource} createBackend={createPresentationBackend} timeline={createPropsTimeline(props.prop)}
        position={[960, 540]} scale={1} style={{ position: "absolute", inset: 0 }} />
    </div>;
  },
  designPreview() {
    return { props: {}, composition: { width: 1920, height: 1080, durationSeconds: propsShowcaseDuration }, seed: 7, player: { background: "#f5f2ed", loop: true } };
  },
});
