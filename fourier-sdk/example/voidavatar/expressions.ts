import type { AvatarExpression } from "@fourier-video/sdk/avatar";

export const voidavatarExpressionNames = ["neutral", "happy", "confident", "thinking", "surprised", "wink", "shy", "sleepy", "angry", "sad", "mischievous", "curious", "determined"] as const;
export type VoidavatarExpressionName = typeof voidavatarExpressionNames[number];
export const voidavatarExpressions: Readonly<Record<VoidavatarExpressionName, AvatarExpression>> = {
  neutral: { parameters: {"EyeArt": 0, "BrowArt": 0, "EyeOpenL": 1, "EyeOpenR": 1} },
  happy: { parameters: {"EyeArt": 1, "BrowArt": 1, "EyeOpenL": 1, "EyeOpenR": 1, "HeadPitch": 0.06, "BrowL": 0.12, "BrowR": 0.12} },
  confident: { parameters: {"EyeArt": 2, "BrowArt": 2, "EyeOpenL": 1, "EyeOpenR": 1, "HeadPitch": 0.06} },
  thinking: { parameters: {"EyeArt": 3, "BrowArt": 3, "EyeOpenL": 1, "EyeOpenR": 1, "ExprGazeX": -0.25, "HeadRoll": 0.1} },
  surprised: { parameters: {"EyeArt": 4, "BrowArt": 4, "EyeOpenL": 1, "EyeOpenR": 1, "BrowL": 0.22, "BrowR": 0.22, "HeadPitch": 0.1} },
  wink: { parameters: {"EyeArt": 5, "BrowArt": 5, "EyeOpenL": 1, "EyeOpenR": 1, "HeadRoll": -0.16} },
  shy: { parameters: {"EyeArt": 6, "BrowArt": 6, "EyeOpenL": 1, "EyeOpenR": 1, "HeadYaw": -0.1, "HeadPitch": -0.12, "ExprGazeY": 0.2} },
  sleepy: { parameters: {"EyeArt": 7, "BrowArt": 7, "EyeOpenL": 1, "EyeOpenR": 1, "HeadPitch": -0.1, "BrowL": -0.08, "BrowR": -0.08} },
  angry: { parameters: {"EyeArt": 8, "BrowArt": 8, "EyeOpenL": 1, "EyeOpenR": 1, "HeadPitch": -0.03} },
  sad: { parameters: {"EyeArt": 9, "BrowArt": 9, "EyeOpenL": 1, "EyeOpenR": 1, "HeadPitch": -0.1, "HeadRoll": -0.05} },
  mischievous: { parameters: {"EyeArt": 10, "BrowArt": 10, "EyeOpenL": 1, "EyeOpenR": 1, "HeadRoll": -0.14, "HeadYaw": 0.08} },
  curious: { parameters: {"EyeArt": 11, "BrowArt": 11, "EyeOpenL": 1, "EyeOpenR": 1, "HeadRoll": 0.17, "HeadPitch": 0.06} },
  determined: { parameters: {"EyeArt": 12, "BrowArt": 12, "EyeOpenL": 1, "EyeOpenR": 1, "HeadPitch": 0.03} },
};

export const voidavatarExpressionLabels: Readonly<Record<VoidavatarExpressionName, string>> = {
  neutral: "乖乖", happy: "开心", confident: "自信", thinking: "思考", surprised: "惊讶",
  wink: "俏皮眨眼", shy: "害羞", sleepy: "困困", angry: "气鼓鼓", sad: "委屈",
  mischievous: "坏笑", curious: "好奇", determined: "认真",
};
