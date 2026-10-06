import { defineReact, defineSchema, type AvatarParameters } from "@fourier-video/sdk/avatar";
import { VoidAvatar } from "./voidavatar/index.ts";

const poses: readonly { title: string; detail: string; parameters: AvatarParameters }[] = [
  { title: "左摆", detail: "发梢顺势延迟", parameters: { HairSway: -.82, HairSide: -.35, HairBack: -.24, HairFront: -.18 } },
  { title: "右摆", detail: "前后层错开", parameters: { HairSway: .82, HairSide: .35, HairBack: .24, HairFront: .18 } },
  { title: "蓬松散开", detail: "轻弹时向外展开", parameters: { HairFan: .8, HairCurl: -.45 } },
  { title: "内收", detail: "回落时柔和收拢", parameters: { HairCurl: .8, HairFan: .08 } },
  { title: "回弹", detail: "发梢反向轻翘", parameters: { HairSway: .25, HairFan: .36, HairCurl: -.82, HairFront: .35 } },
];

export default defineReact({
  name: "VoidAvatarHair",
  schema: defineSchema({}),
  component() {
    return <div style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden", background: "#f5f2ed", color: "#433b3a", fontFamily: 'Arial, "PingFang SC", sans-serif' }}>
      <div style={{ position: "absolute", top: 53, left: 68, fontSize: 18, letterSpacing: 4, color: "#91827d" }}>VOIDAVATAR / HAIR MOTION</div>
      <div style={{ position: "absolute", top: 88, left: 65, fontSize: 44, letterSpacing: 1 }}>五种摆动姿态，柔软衔接</div>
      {poses.map((pose, index) => <div key={pose.title}>
        <VoidAvatar
          position={[250 + index * 355, 429]} scale={.29}
          style={{ position: "absolute", inset: 0 }}
          timeline={{ duration: 4, sample(time) {
            const settle = .92 + .08 * Math.cos(time * Math.PI / 2);
            return { EyeOpenL: 1, EyeOpenR: 1, ...Object.fromEntries(Object.entries(pose.parameters).map(([key, value]) => [key, value * settle])) };
          } }} />
        <div style={{ position: "absolute", left: 50 + index * 355, width: 355, textAlign: "center", top: 685 }}>
          <div style={{ fontSize: 27 }}>{pose.title}</div>
          <div style={{ marginTop: 13, fontSize: 19, color: "#91827d" }}>{pose.detail}</div>
        </div>
      </div>)}
    </div>;
  },
  designPreview() {
    return { props: {}, composition: { width: 1920, height: 800, durationSeconds: 4 }, seed: 7, player: { background: "#f5f2ed", loop: true } };
  },
});
