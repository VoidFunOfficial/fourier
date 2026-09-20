import { loadFont } from "@fourier-video/sdk";
import sf from "../assets/fonts/SF-Pro.woff";
export const FONT = loadFont(sf);
export const C = { paper: "#e1dfe2", dark: "#252326", ink: "#2b2b2b", white: "#e5e3e6", blue: "#516fe0", navy: "#3d5681", teal: "#54ae9f", pink: "#f15f7b", coral: "#ff8c83" };
export const EASE = "cubic-bezier(.22,.75,.2,1)";
export const FULL = { position: "absolute", inset: 0 } as const;
