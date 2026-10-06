/** Stable selections shared by the character controls and prop showcase. */
export const voidavatarHandPropNames = [
  "none", "magicWand", "conductorBaton", "microphone", "bouquet", "heartSign",
  "lollipop", "coffeeCup", "book", "paintbrush", "foldingFan",
] as const;
export type VoidavatarHandPropName = typeof voidavatarHandPropNames[number];
export const voidavatarHandPropLabels: Readonly<Record<VoidavatarHandPropName, string>> = Object.freeze({
  none: "空手", magicWand: "魔法棒", conductorBaton: "指挥棒", microphone: "麦克风",
  bouquet: "小花束", heartSign: "爱心手牌", lollipop: "棒棒糖", coffeeCup: "咖啡杯",
  book: "小书本", paintbrush: "画笔", foldingFan: "折扇",
});
