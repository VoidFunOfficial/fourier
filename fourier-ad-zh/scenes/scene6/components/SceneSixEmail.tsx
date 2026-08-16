import {
  FourierMotion,
  defineReact,
  motion,
  useFourierContext,
} from "@fourier-video/sdk";

const PREVIEW_DURATION_SECONDS = 11;
const FONT = "Inter, Arial, sans-serif";

function SceneSixEmailLayer() {
  const { width, height } = useFourierContext();
  return (
    <FourierMotion>
      <div
        aria-label="The selected motion effects become a centered email"
        style={{ position: "relative", width, height, overflow: "hidden", pointerEvents: "none" }}
      >
        <motion.div
          aria-hidden="true"
          animate={[
            { opacity: 0, offset: 0 },
            { opacity: 0, offset: 0.55 },
            { opacity: 1, offset: 0.64 },
            { opacity: 1, offset: 1 },
          ]}
          transition={{ ease: [0.2, 0.8, 0.2, 1] }}
          style={{
            position: "absolute",
            inset: 0,
            background: "radial-gradient(circle at 52% 45%,#6d6688 0%,#49465f 55%,#302e45 100%)",
          }}
        />
        <motion.div
          animate={[
            { opacity: 0, x: 160, y: 70, scale: 1.5, scaleX: 1.16, scaleY: 0.82, rotate: -4, filter: "blur(18px)", offset: 0 },
            { opacity: 0, x: 160, y: 70, scale: 1.5, scaleX: 1.16, scaleY: 0.82, rotate: -4, filter: "blur(18px)", offset: 0.555 },
            { opacity: 0.92, x: -48, y: -28, scale: 1.075, scaleX: 0.96, scaleY: 1.04, rotate: 1.8, filter: "blur(0px)", offset: 0.605 },
            { opacity: 1, x: 15, y: 9, scale: 0.985, scaleX: 1.015, scaleY: 0.985, rotate: -0.45, filter: "blur(0px)", offset: 0.63 },
            { opacity: 1, x: -5, y: -3, scale: 1.006, scaleX: 0.996, scaleY: 1.004, rotate: 0.12, filter: "blur(0px)", offset: 0.65 },
            { opacity: 1, x: 0, y: 0, scale: 1, scaleX: 1, scaleY: 1, rotate: 0, filter: "blur(0px)", offset: 0.67 },
            { opacity: 1, x: 0, y: 0, scale: 1, scaleX: 1, scaleY: 1, rotate: 0, filter: "blur(0px)", offset: 1 },
          ]}
          transition={{ ease: [0.16, 1, 0.3, 1] }}
          style={{
            position: "absolute",
            left: width / 2 - 480,
            top: height / 2 - 315,
            width: 960,
            height: 630,
            overflow: "hidden",
            borderRadius: 34,
            background: "rgba(255,255,255,.985)",
            border: "1px solid rgba(89,78,152,.16)",
            boxShadow: "0 46px 110px rgba(27,24,58,.38),0 0 0 10px rgba(255,255,255,.12)",
            fontFamily: FONT,
            transformOrigin: "50% 50%",
            willChange: "transform, opacity, filter",
          }}
        >
          <div
            style={{
              height: 86,
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "0 28px",
              color: "#fff",
              background: "linear-gradient(110deg,#5b4ff2 0%,#8a5cf6 52%,#00a9d2 120%)",
            }}
          >
            <div style={{ fontSize: 31 }}>✉</div>
            <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: ".03em" }}>新邮件</div>
            <div style={{ marginLeft: "auto", padding: "8px 13px", borderRadius: 999, background: "rgba(255,255,255,.18)", fontSize: 13, fontWeight: 800 }}>已附加 3 个动效</div>
          </div>

          <div style={{ padding: "24px 34px 0", color: "#25213f" }}>
            <div style={{ display: "grid", gridTemplateColumns: "82px 1fr", gap: "12px 4px", paddingBottom: 20, borderBottom: "1px solid #e5e1f2", fontSize: 16 }}>
              <div style={{ color: "#8b84a3", fontWeight: 750 }}>发件人</div><div style={{ fontWeight: 760 }}>Fourier 智能体 &lt;agent@fourier.video&gt;</div>
              <div style={{ color: "#8b84a3", fontWeight: 750 }}>收件人</div><div style={{ fontWeight: 760 }}>AI 项目团队</div>
              <div style={{ color: "#8b84a3", fontWeight: 750 }}>主题</div><div style={{ fontWeight: 900 }}>已为你的 AI 项目选好动效</div>
            </div>

            <div style={{ paddingTop: 28 }}>
              <div style={{ color: "#1f1a3d", fontSize: 37, lineHeight: 1.1, fontWeight: 940, letterSpacing: "-.035em" }}>准备让你的 AI 项目动起来。</div>
              <div style={{ marginTop: 13, color: "#79728f", fontSize: 17, lineHeight: 1.55, fontWeight: 600 }}>3 套可投入制作的动效系统，已为下一场景打包完毕。</div>
              <div style={{ display: "flex", gap: 12, marginTop: 26 }}>
                {[
                  ["HandWritingMotion", "#ff7a59"],
                  ["OutlineDraw", "#6d5dfc"],
                  ["Left2RightGlow", "#00a9d2"],
                ].map(([label, color]) => (
                  <div key={label} style={{ padding: "12px 15px", borderRadius: 14, color: "#302a50", background: `${color}15`, border: `1px solid ${color}48`, fontSize: 14, fontWeight: 850 }}>
                    <span style={{ color, marginRight: 8 }}>●</span>{label}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ position: "absolute", left: 34, right: 34, bottom: 25, display: "flex", alignItems: "center" }}>
            <div style={{ color: "#9891ad", fontSize: 14, fontWeight: 700 }}>由 Fourier 自动准备</div>
            <div style={{ marginLeft: "auto", padding: "13px 24px", borderRadius: 14, color: "#fff", background: "#5b4ff2", boxShadow: "0 10px 25px rgba(91,79,242,.25)", fontSize: 15, fontWeight: 900 }}>发送创意 →</div>
          </div>
        </motion.div>
      </div>
    </FourierMotion>
  );
}

export default defineReact({
  name: "SceneSixEmail",
  schema: {},
  component() {
    return <SceneSixEmailLayer />;
  },
  designPreview() {
    return {
      props: {},
      composition: { width: 1920, height: 1080, durationSeconds: PREVIEW_DURATION_SECONDS },
      player: { background: "#4b4965", loop: true },
    };
  },
});
