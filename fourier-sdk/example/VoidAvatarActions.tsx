import { defineReact, defineSchema, field } from "@fourier-video/sdk/avatar";
import { FourierMotion, motion } from "@fourier-video/sdk/motion";
import { VoidAvatar } from "./voidavatar/index.ts";
import { voidavatarActionDemoActions as actions, voidavatarActionDemoChapters as chapters, voidavatarActionDemoDuration as duration } from "./voidavatar/gestures.ts";

export default defineReact({
  name: "VoidAvatarActions",
  schema: defineSchema({
    title: field.string({ default: "voidavatar", label: "角色名称" }),
    accent: field.color({ default: "#a68c9f", label: "强调色" }),
    idleAmount: field.number({ default: 1, min: 0, max: 1.5, label: "待机幅度" }),
    catAmount: field.number({ default: 1, min: 0, max: 1.5, label: "猫咪活泼程度" }),
  }),
  component({ props }) {
    return <FourierMotion>
      <div style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden", background: "#f5f2ed", color: "#433b3a", fontFamily: 'Arial, "PingFang SC", sans-serif' }}>
        <div style={{ position: "absolute", left: 112, top: 92, fontSize: 19, letterSpacing: 5, color: "#91827d" }}>FOURIER / AVATAR</div>
        <div style={{ position: "absolute", right: 110, top: 91, fontSize: 17, letterSpacing: 3, color: "#91827d" }}>MOTION STUDY 01</div>
        <div style={{ position: "absolute", left: 112, top: 276, fontSize: 102, letterSpacing: -5 }}>{props.title}</div>
        <div style={{ position: "absolute", left: 117, top: 412, height: 4, width: 70, background: props.accent }} />
        {chapters.map((chapter, index) => <motion.div key={chapter.start}
          animate={[
            { opacity: 0, y: 12, offset: 0 }, { opacity: 1, y: 0, offset: .1 },
            { opacity: 1, y: 0, offset: .9 }, { opacity: 0, y: -8, offset: 1 },
          ]} transition={{ delay: chapter.start, duration: chapter.duration, ease: "linear", fill: "both" }}
          style={{ position: "absolute", left: 116, top: 469 }}>
          <div style={{ fontSize: 17, letterSpacing: 3, color: props.accent }}>0{index + 1} / 0{chapters.length}</div>
          <div style={{ fontSize: 43, fontWeight: 500, marginTop: 22, letterSpacing: 2 }}>{chapter.title}</div>
          <div style={{ fontSize: 27, color: "#847873", marginTop: 18 }}>{chapter.english}</div>
          <div style={{ fontSize: 20, color: "#9d918a", marginTop: 30, letterSpacing: 1 }}>{chapter.detail}</div>
        </motion.div>)}
        <div style={{ position: "absolute", left: 112, bottom: 103, color: "#9d918a", fontSize: 16, letterSpacing: 2 }}>VOIDAVATAR · 动作示例</div>
        <div style={{ position: "absolute", left: 112, right: 112, bottom: 73, height: 2, background: "#e4ddd7" }}>
          <motion.div animate={[{ scaleX: 0 }, { scaleX: 1 }]} transition={{ ease: "linear" }}
            style={{ width: "100%", height: "100%", transformOrigin: "0 50%", background: props.accent }} />
        </div>
        <div style={{ position: "absolute", left: 1065, top: 958, width: 460, height: 22, borderRadius: "50%", background: "#d8cec6", opacity: .32, filter: "blur(11px)" }} />
        <VoidAvatar position={[1310, 547]} scale={.61}
          animation={{ duration, expression: "neutral", targets: { marker: [.7, -.12] }, actions,
            motion: { amount: props.idleAmount, catAmount: props.catAmount } }} />
        <motion.div animate={[{ opacity: 0, scale: .6, offset: 0 }, { opacity: 1, scale: 1, offset: .18 }, { opacity: 1, scale: 1, offset: .83 }, { opacity: 0, scale: .8, offset: 1 }]}
          transition={{ delay: 10.8, duration: 2.8, ease: "ease-in-out", fill: "both" }}
          style={{ position: "absolute", left: 1640, top: 487, width: 48, height: 48, borderRadius: "50%", border: `2px solid ${props.accent}`, display: "grid", placeItems: "center" }}>
          <div style={{ width: 9, height: 9, background: props.accent, borderRadius: "50%" }} />
        </motion.div>
      </div>
    </FourierMotion>;
  },
  designPreview() {
    return { props: {}, composition: { width: 1920, height: 1080, durationSeconds: duration }, seed: 7, player: { background: "#f5f2ed", loop: true } };
  },
});
