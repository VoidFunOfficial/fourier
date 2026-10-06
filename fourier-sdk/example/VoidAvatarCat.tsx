import { Avatar, defineReact, defineSchema, field, type AvatarBackend } from "@fourier-video/sdk/avatar";
import { createVoidBackend, voidavatarHybridSource } from "./voidavatar/cubism-source.ts";
import { createVoidavatarTimeline } from "./voidavatar/natural-timeline.ts";

// The same cat meshes and full rig as the main example, framed for close inspection.
async function createCatCloseup(): Promise<AvatarBackend> {
  const backend = await createVoidBackend();
  return { canvas: backend.canvas, textures: backend.textures,
    sample: parameters => backend.sample(parameters).filter(drawable => drawable.id.startsWith("Cat")),
    dispose: () => backend.dispose() };
}

export default defineReact({
  name: "VoidAvatarCat",
  schema: defineSchema({ catAmount: field.number({ default: 1, min: 0, max: 1.5, label: "猫咪活泼程度" }) }),
  component({ props }) {
    const timeline = createVoidavatarTimeline({ duration: 12, seed: 7 }, 1, props.catAmount);
    return <div style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden", background: "#f5f2ed", color: "#433b3a", fontFamily: 'Arial, "PingFang SC", sans-serif' }}>
      <div style={{ position: "absolute", left: 64, top: 84, fontSize: 13, letterSpacing: 3, color: "#91827d" }}>VOIDAVATAR / LITTLE CAT</div>
      <div style={{ position: "absolute", left: 61, top: 175, fontSize: 43, lineHeight: 1.45 }}>小猫也有<br />自己的节奏</div>
      <div style={{ position: "absolute", left: 65, top: 331, fontSize: 16, color: "#91827d" }}>慢眨 · 歪头 · 动耳 · 甩尾</div>
      <div style={{ position: "absolute", left: 550, top: 428, width: 213, height: 14, borderRadius: "50%", background: "#d8cec6", opacity: .35, filter: "blur(9px)" }} />
      <Avatar model={voidavatarHybridSource} createBackend={createCatCloseup} timeline={timeline}
        position={[343, -450]} scale={1.25} style={{ position: "absolute", inset: 0 }} />
    </div>;
  },
  designPreview() {
    return { props: {}, composition: { width: 960, height: 540, durationSeconds: 12 }, seed: 7, player: { background: "#f5f2ed", loop: true } };
  },
});
