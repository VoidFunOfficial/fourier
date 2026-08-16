import {
  FourierMotion,
  defineReact,
  motion,
  useFourierContext,
  type CSSProperties,
  type FourierMotionTarget,
  type ReactNode,
} from "@fourier-video/sdk";
import { Universe, World, defineCamera } from "@fourier-video/sdk/universe";
import arrowCursorUrl from "../../../pic/svg/default.svg";
import textCursorUrl from "../../../pic/svg/textcursor.svg";

const DURATION_SECONDS = 7;
const PROMPT = "为 Fourier 项目制作一支宣传片。";
const FONT = "Inter, Arial, sans-serif";
const WORLD_WIDTH = 1920;
const WORLD_HEIGHT = 1080;
const PANEL_WIDTH = 1420;
const PANEL_HEIGHT = 256;
const PANEL_LEFT = (WORLD_WIDTH - PANEL_WIDTH) / 2;
const PANEL_TOP = (WORLD_HEIGHT - PANEL_HEIGHT) / 2;
const INPUT_CURSOR_START_X = PANEL_LEFT + 38;
const INPUT_CURSOR_END_X = PANEL_LEFT + 970;
const INPUT_CURSOR_Y = PANEL_TOP + 43;
const SEND_CURSOR_X = PANEL_LEFT + PANEL_WIDTH - 65;
const SEND_CURSOR_Y = PANEL_TOP + PANEL_HEIGHT - 61;

const camera = defineCamera({
  width: WORLD_WIDTH,
  height: WORLD_HEIGHT,
  initial: { x: 960, y: 540, zoom: 1.08, rotation: 0 },
  moves: [
    {
      at: "2s",
      duration: "300ms",
      to: { kind: "pose", x: 830, y: 515, zoom: 1.12, rotation: -0.14 },
      path: {
        kind: "bezier",
        control1: { x: 920, y: 548 },
        control2: { x: 850, y: 505 },
      },
      ease: [0.18, 0.86, 0.22, 1],
    },
    {
      at: "2.3s",
      duration: "700ms",
      to: { kind: "pose", x: 875, y: 515, zoom: 1.13, rotation: 0.16 },
      path: { kind: "curve", points: [{ x: 840, y: 505 }] },
      ease: "ease-in-out",
    },
    {
      at: "3s",
      duration: "1s",
      to: { kind: "pose", x: 1_000, y: 512, zoom: 1.13, rotation: -0.12 },
      path: { kind: "curve", points: [{ x: 935, y: 524 }] },
      ease: "ease-in-out",
    },
    {
      at: "4s",
      duration: "300ms",
      to: { kind: "pose", x: 1_060, y: 520, zoom: 1.12, rotation: 0 },
      path: { kind: "linear" },
      ease: "ease-out",
    },
    {
      at: "4.3s",
      duration: "400ms",
      to: { kind: "pose", x: 960, y: 540, zoom: 1.08, rotation: 0 },
      path: {
        kind: "bezier",
        control1: { x: 1_035, y: 515 },
        control2: { x: 980, y: 548 },
      },
      ease: [0.18, 0.88, 0.22, 1],
    },
  ],
});

const fullFrame: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
};

function panelFrames(): readonly FourierMotionTarget[] {
  return [
    { opacity: 0, scale: 0.68, y: 92, filter: "blur(18px)", offset: 0 },
    { opacity: 0, scale: 0.68, y: 92, filter: "blur(18px)", offset: 0.015 },
    { opacity: 1, scale: 1.055, y: -12, filter: "blur(0px)", offset: 0.115 },
    { opacity: 1, scale: 0.984, y: 4, filter: "blur(0px)", offset: 0.15 },
    { opacity: 1, scale: 1.008, y: -2, filter: "blur(0px)", offset: 0.175 },
    { opacity: 1, scale: 1, y: 0, filter: "blur(0px)", offset: 0.195 },
    { opacity: 1, scale: 1, y: 0, filter: "blur(0px)", offset: 1 },
  ];
}

function characterFrames(index: number): readonly FourierMotionTarget[] {
  const start = 0.3 + index / Math.max(1, PROMPT.length - 1) * 0.31;
  return [
    { opacity: 0, y: 3, offset: 0 },
    { opacity: 0, y: 3, offset: start },
    { opacity: 1, y: -1, offset: Math.min(0.69, start + 0.007) },
    { opacity: 1, y: 0, offset: Math.min(0.7, start + 0.014) },
    { opacity: 1, y: 0, offset: 0.79 },
    { opacity: 0, y: -12, offset: 0.825 },
    { opacity: 0, y: -12, offset: 1 },
  ];
}

function firstArrowFrames(width: number, height: number): readonly FourierMotionTarget[] {
  const targetX = INPUT_CURSOR_START_X;
  const targetY = INPUT_CURSOR_Y;
  return [
    { x: width - 180, y: height - 130, opacity: 0, rotate: 4, scale: 0.92, offset: 0 },
    { x: width - 180, y: height - 130, opacity: 0, rotate: 4, scale: 0.92, offset: 0.125 },
    { x: width - 180, y: height - 130, opacity: 1, rotate: 4, scale: 1, offset: 0.145 },
    { x: width * 0.69, y: height * 0.67, opacity: 1, rotate: -7, scale: 1, offset: 0.2 },
    { x: targetX - 19, y: targetY + 11, opacity: 1, rotate: -2, scale: 1.06, offset: 0.245 },
    { x: targetX + 6, y: targetY - 3, opacity: 1, rotate: 1, scale: 0.95, offset: 0.265 },
    { x: targetX, y: targetY, opacity: 1, rotate: 0, scale: 1, offset: 0.282 },
    { x: targetX, y: targetY, opacity: 0, rotate: 0, scale: 0.94, offset: 0.3 },
    { x: targetX, y: targetY, opacity: 0, rotate: 0, scale: 0.94, offset: 1 },
  ];
}

function textCursorFrames(width: number, height: number): readonly FourierMotionTarget[] {
  const startX = INPUT_CURSOR_START_X - 4;
  const endX = INPUT_CURSOR_END_X;
  const y = INPUT_CURSOR_Y - 10;
  return [
    { x: startX, y, opacity: 0, offset: 0 },
    { x: startX, y, opacity: 0, offset: 0.28 },
    { x: startX, y, opacity: 1, offset: 0.3 },
    { x: endX, y, opacity: 1, offset: 0.62 },
    { x: endX, y, opacity: 0, offset: 0.64 },
    { x: endX, y, opacity: 0, offset: 1 },
  ];
}

function sendArrowFrames(width: number, height: number): readonly FourierMotionTarget[] {
  const startX = INPUT_CURSOR_END_X + 12;
  const startY = INPUT_CURSOR_Y;
  const targetX = SEND_CURSOR_X;
  const targetY = SEND_CURSOR_Y;
  return [
    { x: startX, y: startY, opacity: 0, rotate: 0, scale: 0.94, offset: 0 },
    { x: startX, y: startY, opacity: 0, rotate: 0, scale: 0.94, easing: "ease-out", offset: 0.615 },
    { x: startX, y: startY, opacity: 1, rotate: 0, scale: 1, easing: "cubic-bezier(.18,.86,.22,1)", offset: 0.635 },
    { x: targetX + 22, y: targetY - 10, opacity: 1, rotate: -5, scale: 1.08, easing: "cubic-bezier(.2,.8,.2,1)", offset: 0.69 },
    { x: targetX - 7, y: targetY + 4, opacity: 1, rotate: 1, scale: 0.94, easing: "ease-out", offset: 0.71 },
    { x: targetX, y: targetY, opacity: 1, rotate: 0, scale: 1, easing: "ease-in", offset: 0.728 },
    { x: targetX, y: targetY, opacity: 1, rotate: 0, scale: 0.76, easing: "ease-out", offset: 0.75 },
    { x: targetX, y: targetY, opacity: 1, rotate: 0, scale: 1.08, easing: "ease-out", offset: 0.77 },
    { x: targetX, y: targetY, opacity: 1, rotate: 0, scale: 1, offset: 1 },
  ];
}

function Icon({ children, size = 34 }: { children: ReactNode; size?: number }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        display: "grid",
        placeItems: "center",
        color: "#f4f3f7",
      }}
    >
      {children}
    </span>
  );
}

function PlusIcon() {
  return (
    <Icon size={40}>
      <svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">
        <path d="M20 6v28M6 20h28" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      </svg>
    </Icon>
  );
}

function PaperclipIcon() {
  return (
    <Icon size={40}>
      <svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">
        <path d="m14 21 9-9a6 6 0 0 1 8.5 8.5L19 33a8.5 8.5 0 0 1-12-12l13-13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Icon>
  );
}

function LayersIcon() {
  return (
    <Icon size={40}>
      <svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">
        <path d="m20 7 13 7-13 7L7 14l13-7Z" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round" />
        <path d="m8 21 12 6 12-6M8 27l12 6 12-6" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Icon>
  );
}

function GlobeIcon() {
  return (
    <Icon size={40}>
      <svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">
        <circle cx="18" cy="18" r="12" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M6 18h24M18 6c4 4 6 8 6 12s-2 8-6 12c-4-4-6-8-6-12s2-8 6-12Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="30" cy="30" r="5" fill="#4b4a54" stroke="currentColor" strokeWidth="2" />
        <path d="m34 34 3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </Icon>
  );
}

function CubesIcon() {
  return (
    <Icon size={38}>
      <svg viewBox="0 0 40 40" width="38" height="38" aria-hidden="true">
        <path d="m20 5 7 4v8l-7 4-7-4V9l7-4Zm-8 14 7 4v8l-7 4-7-4v-8l7-4Zm16 0 7 4v8l-7 4-7-4v-8l7-4Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    </Icon>
  );
}

function WaveIcon() {
  return (
    <Icon size={38}>
      <svg viewBox="0 0 40 40" width="38" height="38" aria-hidden="true">
        {[8, 13, 18, 23, 28, 33].map((x, index) => (
          <path
            key={x}
            d={`M${x} ${20 - (index % 3) * 3}v${(index % 3) * 6 + 2}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        ))}
      </svg>
    </Icon>
  );
}

function AIPromptDialogLayer() {
  const { width, height } = useFourierContext();

  return (
    <FourierMotion>
      <Universe camera={camera} overscan={0.48}>
        <World
          id="prompting-interface"
          x={WORLD_WIDTH / 2}
          y={WORLD_HEIGHT / 2}
          width={WORLD_WIDTH}
          height={WORLD_HEIGHT}
          zIndex={1}
          cull="never"
        >
          <div
            aria-label="A compact AI prompt bar sends a Fourier promotional video request"
            style={{
              ...fullFrame,
              overflow: "visible",
              fontFamily: FONT,
              color: "#f6f5f8",
              pointerEvents: "none",
            }}
          >
          <motion.div
          animate={panelFrames()}
          transition={{ ease: [0.19, 0.91, 0.23, 1] }}
          style={{
            position: "absolute",
            left: PANEL_LEFT,
            top: PANEL_TOP,
            width: PANEL_WIDTH,
            height: PANEL_HEIGHT,
            borderRadius: 32,
            background: "#4b4a54",
            border: "1px solid rgba(255,255,255,.07)",
            boxShadow: "0 30px 72px rgba(5,4,12,.42), 0 2px 12px rgba(5,4,12,.3)",
            overflow: "hidden",
            transformOrigin: "50% 50%",
            willChange: "transform, opacity, filter",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 42,
              right: 42,
              top: 22,
              height: 118,
              display: "flex",
              alignItems: "center",
              overflow: "hidden",
            }}
          >
            <motion.div
              animate={[
                { opacity: 0, scaleY: 0.4, offset: 0 },
                { opacity: 0, scaleY: 0.4, offset: 0.155 },
                { opacity: 1, scaleY: 1, offset: 0.195 },
                { opacity: 1, scaleY: 1, offset: 0.79 },
                { opacity: 0, scaleY: 0.5, offset: 0.825 },
                { opacity: 0, scaleY: 0.5, offset: 1 },
              ]}
              transition={{ ease: [0.2, 0.8, 0.2, 1] }}
              style={{
                width: 5,
                height: 58,
                flex: "0 0 auto",
                borderRadius: 3,
                background: "#6f5cff",
                transformOrigin: "50% 50%",
                boxShadow: "0 0 11px rgba(111,92,255,.6)",
              }}
            />

            <motion.div
              animate={[
                { opacity: 0, offset: 0 },
                { opacity: 0, offset: 0.16 },
                { opacity: 0.66, offset: 0.2 },
                { opacity: 0.66, offset: 0.275 },
                { opacity: 0, offset: 0.3 },
                { opacity: 0, offset: 1 },
              ]}
              transition={{ ease: "linear" }}
              style={{
                marginLeft: 17,
                color: "#dedce4",
                fontSize: 43,
                fontWeight: 300,
                letterSpacing: "-.025em",
                whiteSpace: "nowrap",
              }}
            >
              想让我帮你创作什么？
            </motion.div>

            <div
              aria-label={PROMPT}
              style={{
                position: "absolute",
                left: 22,
                right: 0,
                height: "100%",
                display: "flex",
                alignItems: "center",
                color: "#ffffff",
                fontSize: 35,
                fontWeight: 400,
                letterSpacing: "-.018em",
                whiteSpace: "nowrap",
              }}
            >
              {Array.from(PROMPT).map((character, index) => (
                <motion.span
                  key={`${character}-${index}`}
                  animate={characterFrames(index)}
                  transition={{ ease: "linear" }}
                  style={{ display: "inline-block", willChange: "transform, opacity" }}
                >
                  {character === " " ? "\u00a0" : character}
                </motion.span>
              ))}
            </div>

            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={[
                { opacity: 0, y: 8, offset: 0 },
                { opacity: 0, y: 8, offset: 0.825 },
                { opacity: 1, y: -2, offset: 0.865 },
                { opacity: 1, y: 0, offset: 0.895 },
                { opacity: 1, y: 0, offset: 1 },
              ]}
              transition={{ ease: "linear" }}
              style={{
                position: "absolute",
                left: 22,
                color: "#f4f3f7",
                fontSize: 35,
                fontWeight: 400,
                letterSpacing: "-.018em",
                opacity: 0,
              }}
            >
              正在创作你的 Fourier 宣传片…
            </motion.div>
          </div>

          <div
            style={{
              position: "absolute",
              left: 32,
              right: 32,
              bottom: 20,
              height: 78,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 25 }}>
              <PlusIcon />
              <PaperclipIcon />
              <LayersIcon />
              <GlobeIcon />
              <span style={{ marginLeft: 6, color: "#f5f3f7", fontSize: 31, fontWeight: 400 }}>
                Fourier 1.0
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 27 }}>
              <CubesIcon />
              <WaveIcon />
              <motion.div
                animate={[
                  { x: 0, y: 0, scale: 1, backgroundColor: "#f6f5f8", offset: 0 },
                  { x: 0, y: 0, scale: 1, backgroundColor: "#f6f5f8", offset: 0.69 },
                  { x: 7, y: -3, scale: 1.04, backgroundColor: "#ffffff", offset: 0.728 },
                  { x: 0, y: 0, scale: 0.8, backgroundColor: "#e8e6ee", offset: 0.75 },
                  { x: 0, y: 0, scale: 1.11, backgroundColor: "#ffffff", offset: 0.77 },
                  { x: 0, y: 0, scale: 1, backgroundColor: "#f6f5f8", offset: 0.8 },
                  { x: 0, y: 0, scale: 1, backgroundColor: "#f6f5f8", offset: 1 },
                ]}
                transition={{ ease: [0.18, 0.88, 0.22, 1] }}
                style={{
                  width: 64,
                  height: 64,
                  display: "grid",
                  placeItems: "center",
                  borderRadius: "50%",
                  color: "#3e3d46",
                  boxShadow: "0 5px 14px rgba(8,7,14,.3)",
                  transformOrigin: "50% 50%",
                  willChange: "transform, background-color",
                }}
              >
                <svg viewBox="0 0 32 32" width="35" height="35" aria-hidden="true">
                  <path d="M16 25V8M9 15l7-7 7 7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </motion.div>
            </div>
          </div>
          </motion.div>

          <motion.img
          src={arrowCursorUrl}
          alt=""
          animate={firstArrowFrames(width, height)}
          transition={{ ease: [0.18, 0.86, 0.22, 1] }}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: 68,
            height: 68,
            zIndex: 20,
            transformOrigin: "8px 7px",
            filter: "drop-shadow(0 4px 8px rgba(0,0,0,.5))",
            willChange: "transform, opacity",
          }}
        />

          <motion.img
          src={textCursorUrl}
          alt=""
          animate={textCursorFrames(width, height)}
          transition={{ ease: "linear" }}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: 52,
            height: 52,
            zIndex: 20,
            transformOrigin: "50% 50%",
            filter: "drop-shadow(0 2px 5px rgba(0,0,0,.45))",
            willChange: "transform, opacity",
          }}
        />

          <motion.img
          src={arrowCursorUrl}
          alt=""
          animate={sendArrowFrames(width, height)}
          transition={{ ease: "linear" }}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: 68,
            height: 68,
            zIndex: 20,
            transformOrigin: "8px 7px",
            filter: "drop-shadow(0 4px 8px rgba(0,0,0,.5))",
            willChange: "transform, opacity",
          }}
          />
          </div>
        </World>
      </Universe>
    </FourierMotion>
  );
}

export default defineReact({
  name: "SceneThreeAIPromptDialog",
  schema: {},
  component() {
    return <AIPromptDialogLayer />;
  },
  designPreview() {
    return {
      props: {},
      composition: { width: 1920, height: 1080, durationSeconds: DURATION_SECONDS },
      player: { background: "#23212d", loop: true },
    };
  },
});
