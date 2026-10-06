import { defineReact, defineSchema, field, type AvatarAction } from "@fourier-video/sdk/avatar";
import { VoidAvatar, voidavatarExpressionNames, voidavatarHandPropNames } from "./voidavatar/index.ts";

const actions: readonly AvatarAction[] = [
  { at: .4, action: "wave", duration: 2 },
  { at: 2.6, action: "point", target: "equation", duration: 2.2 },
  { at: 5.1, action: "nod", duration: 1.4 },
  { at: 7, action: "explain", duration: 2.6 },
  { at: 10, action: "lookAt", target: "camera", duration: 1.8 },
];

export default defineReact({
  name: "VoidAvatar",
  schema: defineSchema({
    expression: field.enum(voidavatarExpressionNames, { default: "confident", label: "表情" }),
    scale: field.number({ default: 0.32, min: 0.1, max: 1, label: "角色缩放" }),
    transparent: field.boolean({ default: false, label: "透明背景" }),
    idleAmount: field.number({ default: 1, min: 0, max: 1.5, label: "摆动与回弹幅度" }),
    catAmount: field.number({ default: 1, min: 0, max: 1.5, label: "猫咪活泼程度" }),
    showActions: field.boolean({ default: false, label: "动作演示" }),
    leftProp: field.enum(voidavatarHandPropNames, { default: "none", label: "左手道具", description: "空手或十种手持道具。" }),
    rightProp: field.enum(voidavatarHandPropNames, { default: "magicWand", label: "右手道具", description: "魔法棒、指挥棒、麦克风、花束、爱心手牌、棒棒糖、咖啡杯、书本、画笔、折扇。" }),
  }),
  component({ props }) {
    return <div style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden", background: props.transparent ? "transparent" : "#f5f2ed", color: "#433b3a", fontFamily: "Arial, sans-serif" }}>
      {!props.transparent && <div style={{ position: "absolute", left: 68, top: 175 }}>
        <div style={{ fontSize: 13, letterSpacing: 3, color: "#91827d" }}>FOURIER AVATAR</div>
        <div style={{ fontSize: 55, letterSpacing: -2, marginTop: 16 }}>voidavatar</div>
        <div style={{ fontSize: 16, marginTop: 18, color: "#91827d" }}>Look. Explain. Move.</div>
        <div style={{ width: 48, height: 3, marginTop: 30, background: "#bda6b8" }} />
      </div>}
      <VoidAvatar position={[props.transparent ? 480 : 666, 285]} scale={props.scale}
        animation={{ expression: props.expression, motion: { amount: props.idleAmount, catAmount: props.catAmount },
          hands: { left: props.leftProp, right: props.rightProp },
          targets: { equation: [-.75, -.1] }, actions: props.showActions ? actions : [] }} />
    </div>;
  },
  designPreview() {
    return { props: {}, composition: { width: 960, height: 540, durationSeconds: 12 }, seed: 7, player: { background: "#f5f2ed", loop: true } };
  },
});
