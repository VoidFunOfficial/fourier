import { defineReact, defineSchema } from "@fourier-video/sdk/avatar";
import { VoidAvatar, voidavatarExpressionNames, voidavatarExpressionLabels } from "./voidavatar/index.ts";

export default defineReact({
  name: "VoidAvatarExpressions",
  schema: defineSchema({}),
  component() {
    return <div style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden", background: "#f5f2ed", color: "#433b3a", fontFamily: 'Arial, "PingFang SC", sans-serif' }}>
      <div style={{ position: "absolute", left: 64, top: 37, fontSize: 16, letterSpacing: 4, color: "#91827d" }}>VOIDAVATAR / SOFT LITTLE EXPRESSIONS</div>
      <div style={{ position: "absolute", left: 61, top: 76, fontSize: 42 }}>软软的眼睛，小小的情绪</div>
      <div style={{ position: "absolute", right: 65, top: 93, fontSize: 18, color: "#91827d" }}>13 种新画稿 · 眉毛独立控制</div>
      {voidavatarExpressionNames.map((expression, index) => <div key={expression} style={{ position: "absolute", left: 64 + index % 5 * 362, top: 154 + Math.floor(index / 5) * 374, width: 344, height: 350, overflow: "hidden", borderRadius: 20, background: "#faf7f3", border: "1px solid #e7dfd8" }}>
        <div style={{ position: "absolute", inset: "0 0 66px", overflow: "hidden" }}>
          <VoidAvatar animation={{ expression, motion: { amount: .08, catAmount: 0 } }}
            position={[196, 238]} scale={.30} style={{ position: "absolute", left: 0, top: 0 }} />
        </div>
        <div style={{ position: "absolute", left: 24, bottom: 20, fontSize: 25 }}>{voidavatarExpressionLabels[expression]}</div>
        <div style={{ position: "absolute", right: 24, bottom: 25, fontSize: 14, color: "#a3958f" }}>{String(index + 1).padStart(2, "0")}</div>
      </div>)}
      <div style={{ position: "absolute", left: 1150, top: 902, width: 706, height: 350, borderRadius: 20, background: "#eee5e4", padding: "46px 42px", boxSizing: "border-box" }}>
        <div style={{ fontSize: 29 }}>眉毛，也有自己的小动作</div>
        <div style={{ fontSize: 21, lineHeight: 1.9, marginTop: 29, color: "#887675" }}>左右分别抬起、下压、倾斜<br />眼睛与眉毛表情可以自由搭配<br />眨眼时，眉毛保持自己的姿态</div>
      </div>
      <div style={{ position: "absolute", left: 65, bottom: 26, fontSize: 15, letterSpacing: 1, color: "#a39791" }}>柔和可可色 / 原图 Q 版画风 / 眼睛与眉毛分别绘制</div>
    </div>;
  },
  designPreview() { return { props: {}, composition: { width: 1920, height: 1320, durationSeconds: 12 }, seed: 7, player: { background: "#f5f2ed", loop: true } }; },
});
