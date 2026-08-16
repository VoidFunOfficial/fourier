import {
  FourierMotion,
  defineReact,
  loadFont,
  motion,
  type FourierMotionTarget,
} from "@fourier-video/sdk";
import { Universe, World, defineCamera } from "@fourier-video/sdk/universe";
import reviewCursorUrl from "../assets/cursor-review.svg";
import scriptCursorUrl from "../assets/cursor-script.svg";
import searchCursorUrl from "../assets/cursor-search.svg";
import textCursorUrl from "../assets/textcursor.svg";
import videoCursorUrl from "../assets/cursor-video.svg";
import montserratMediumUrl from "../assets/Montserrat-Medium.ttf";
import {
  MAC_WINDOW_BORDER,
  MAC_WINDOW_RADIUS,
  MAC_WINDOW_SHADOW,
  MacDocumentTitlebar,
} from "./MacWindowChrome";

const PREVIEW_DURATION_SECONDS = 10;
const SCENE_DURATION_SECONDS = 13;
const WORLD_LEFT = -2600;
const WORLD_TOP = -200;
const WORLD_WIDTH = 6200;
const WORLD_HEIGHT = 3000;
const FONT = loadFont(montserratMediumUrl, { weight: 500 });
const PAPER = "#f2eadb";
const PAPER_LIGHT = "#fffaf0";
const INK = "#28241f";
const MUTED_INK = "#746b61";
const SCRIPT_ACCENT = "#d96843";
const DOCUMENT_CENTER = { x: -1080, y: 1480 } as const;
const DOCUMENT_WIDTH = 1460;
const DOCUMENT_HEIGHT = 900;

const localX = (worldX: number) => worldX - WORLD_LEFT;
const localY = (worldY: number) => worldY - WORLD_TOP;

const agents = [
  { label: "搜索", cursor: searchCursorUrl, accent: "#78c8c1", x: 375, y: 237 },
  { label: "视频", cursor: videoCursorUrl, accent: "#9c90d4", x: 1285, y: 237 },
  { label: "审核", cursor: reviewCursorUrl, accent: "#e2bd76", x: 375, y: 627 },
] as const;

const camera = defineCamera({
  width: 1920,
  height: 1080,
  initial: { x: 960, y: 540, zoom: 1.08, rotation: 0 },
  moves: [
    {
      at: "0f",
      duration: "40f",
      to: { kind: "pose", x: -1150, y: 1530, zoom: 1.1, rotation: -0.25 },
      path: {
        kind: "curve",
        points: [
          { x: 760, y: 650 },
          { x: 220, y: 900 },
          { x: -520, y: 1280 },
        ],
      },
      ease: [0.36, 0.02, 0.16, 1],
    },
    {
      at: "40f",
      duration: "4f",
      to: { kind: "pose", x: -1048, y: 1458, zoom: 1.035, rotation: 0.08 },
      ease: "ease-out",
    },
    {
      at: "44f",
      duration: "4f",
      to: { kind: "pose", x: DOCUMENT_CENTER.x, y: DOCUMENT_CENTER.y, zoom: 1.055, rotation: 0 },
      ease: "ease-out",
    },
  ],
});

function leftBehindFrames(index: number): readonly FourierMotionTarget[] {
  const x = index === 1 ? 42 : -34;
  const y = index === 2 ? -28 : 22;
  return [
    { opacity: 1, x: 0, y: 0, scale: 1, filter: "blur(0px)", offset: 0 },
    { opacity: 1, x: 0, y: 0, scale: 1, filter: "blur(0px)", offset: 0.035 },
    { opacity: 0.7, x, y, scale: 0.96, filter: "blur(3px)", offset: 0.075 },
    { opacity: 0, x: x * 2.2, y: y * 2.2, scale: 0.86, filter: "blur(8px)", offset: 0.13 },
    { opacity: 0, x: x * 2.2, y: y * 2.2, scale: 0.86, filter: "blur(8px)", offset: 1 },
  ];
}

function scriptCursorFrames(): readonly FourierMotionTarget[] {
  const targetX = DOCUMENT_CENTER.x - 570;
  const targetY = DOCUMENT_CENTER.y + 160;
  const deltaX = targetX - 1285;
  const deltaY = targetY - 627;
  return [
    { x: 0, y: 0, opacity: 1, scale: 1, rotate: 0, filter: "blur(0px)", offset: 0, easing: "cubic-bezier(.36,.02,.16,1)" },
    { x: -310, y: 112, opacity: 0.9, scale: 1.04, rotate: -6, filter: "blur(8px)", offset: 0.03 },
    { x: -980, y: 410, opacity: 0.78, scale: 1.08, rotate: 4, filter: "blur(15px)", offset: 0.065 },
    { x: -2100, y: 810, opacity: 0.85, scale: 1.08, rotate: -3, filter: "blur(10px)", offset: 0.105 },
    { x: deltaX - 72, y: deltaY + 48, opacity: 1, scale: 1.12, rotate: 2, filter: "blur(0px)", offset: 0.133, easing: "ease-out" },
    { x: deltaX + 24, y: deltaY - 16, opacity: 1, scale: 0.95, rotate: -1, filter: "blur(0px)", offset: 0.147, easing: "ease-out" },
    { x: deltaX, y: deltaY, opacity: 1, scale: 1, rotate: 0, filter: "blur(0px)", offset: 0.16 },
    { x: deltaX, y: deltaY, opacity: 1, scale: 1, rotate: 0, filter: "blur(0px)", offset: 0.181 },
    { x: deltaX, y: deltaY, opacity: 1, scale: 0.7, rotate: 0, filter: "blur(0px)", offset: 0.192 },
    { x: deltaX, y: deltaY, opacity: 0, scale: 0.92, rotate: 0, filter: "blur(2px)", offset: 0.205 },
    { x: deltaX, y: deltaY, opacity: 0, scale: 0.92, rotate: 0, filter: "blur(2px)", offset: 1 },
  ];
}

function documentRiseFrames(): readonly FourierMotionTarget[] {
  return [
    { opacity: 0, x: 0, y: 760, scale: 0.96, rotate: 0.6, filter: "blur(7px)", offset: 0 },
    { opacity: 0, x: 0, y: 760, scale: 0.96, rotate: 0.6, filter: "blur(7px)", offset: 0.145 },
    { opacity: 1, x: 0, y: 682, scale: 0.985, rotate: -0.18, filter: "blur(0px)", offset: 0.19 },
    { opacity: 1, x: 0, y: 620, scale: 0.99, rotate: 0, filter: "blur(0px)", offset: 0.2 },
    { opacity: 1, x: 0, y: 14, scale: 1, rotate: 0, filter: "blur(0px)", offset: 0.802 },
    { opacity: 1, x: 0, y: -6, scale: 1.002, rotate: 0, filter: "blur(0px)", offset: 0.84 },
    { opacity: 1, x: 0, y: 0, scale: 1, rotate: 0, filter: "blur(0px)", offset: 0.88 },
    { opacity: 1, x: 0, y: 0, scale: 1, rotate: 0, filter: "blur(0px)", offset: 1 },
  ];
}

function documentCollapseFrames(): readonly FourierMotionTarget[] {
  return [
    { opacity: 1, x: 0, y: 0, scaleX: 1, scaleY: 1, rotate: 0, filter: "blur(0px)", offset: 0 },
    { opacity: 1, x: 0, y: 0, scaleX: 1, scaleY: 1, rotate: 0, filter: "blur(0px)", offset: 10 / SCENE_DURATION_SECONDS },
    { opacity: 1, x: 0, y: -8, scaleX: 1.025, scaleY: 0.96, rotate: 0, filter: "blur(0px)", offset: 10.2 / SCENE_DURATION_SECONDS },
    { opacity: 0.92, x: 0, y: 0, scaleX: 0.42, scaleY: 0.18, rotate: 0, filter: "blur(1px)", offset: 10.68 / SCENE_DURATION_SECONDS },
    { opacity: 0.18, x: 0, y: 0, scaleX: 0.14, scaleY: 0.075, rotate: 0, filter: "blur(4px)", offset: 10.92 / SCENE_DURATION_SECONDS },
    { opacity: 0, x: 0, y: 0, scaleX: 0.08, scaleY: 0.05, rotate: 0, filter: "blur(7px)", offset: 11 / SCENE_DURATION_SECONDS },
    { opacity: 0, x: 0, y: 0, scaleX: 0.08, scaleY: 0.05, rotate: 0, filter: "blur(7px)", offset: 1 },
  ];
}

function caretFrames(): readonly FourierMotionTarget[] {
  return [
    { opacity: 0, x: 0, y: 0, offset: 0 },
    { opacity: 0, x: 0, y: 0, offset: 0.198 },
    { opacity: 1, x: 0, y: 0, offset: 0.205 },
    { opacity: 1, x: 1080, y: 0, offset: 0.31 },
    { opacity: 0.35, x: 1080, y: 0, offset: 0.315 },
    { opacity: 1, x: 1020, y: 126, offset: 0.42 },
    { opacity: 0.35, x: 1020, y: 126, offset: 0.425 },
    { opacity: 1, x: 1120, y: 252, offset: 0.54 },
    { opacity: 0.35, x: 1120, y: 252, offset: 0.545 },
    { opacity: 1, x: 960, y: 378, offset: 0.66 },
    { opacity: 0.35, x: 960, y: 378, offset: 0.665 },
    { opacity: 1, x: 1090, y: 504, offset: 0.79 },
    { opacity: 0, x: 1090, y: 504, offset: 0.84 },
    { opacity: 0, x: 1090, y: 504, offset: 1 },
  ];
}

function AgentLabel({ label }: { label: string }) {
  return (
    <div
      style={{
        position: "absolute",
        left: 26,
        top: 177,
        minWidth: 112,
        padding: "9px 18px 10px",
        borderRadius: 999,
        color: "#fffaf0",
        background: "rgba(44,39,34,.84)",
        border: "1px solid rgba(255,250,240,.2)",
        fontFamily: FONT,
        fontSize: 21,
        lineHeight: 1,
        fontWeight: 650,
        letterSpacing: ".01em",
        textAlign: "center",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </div>
  );
}

function GridField() {
  const verticalLines = Array.from({ length: 66 }, (_, index) => index * 96);
  const horizontalLines = Array.from({ length: 34 }, (_, index) => index * 96);
  return (
    <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: "#302c28" }}>
      {verticalLines.map((left) => (
        <span key={`v-${left}`} style={{ position: "absolute", left, top: 0, width: 1, height: WORLD_HEIGHT, background: "#454039", opacity: 0.58 }} />
      ))}
      {horizontalLines.map((top) => (
        <span key={`h-${top}`} style={{ position: "absolute", left: 0, top, width: WORLD_WIDTH, height: 1, background: "#454039", opacity: 0.58 }} />
      ))}
    </div>
  );
}

function MacDocument() {
  return (
    <motion.div
      animate={documentCollapseFrames()}
      transition={{ duration: SCENE_DURATION_SECONDS, ease: "linear" }}
      style={{
        position: "absolute",
        left: localX(DOCUMENT_CENTER.x) - DOCUMENT_WIDTH / 2,
        top: localY(DOCUMENT_CENTER.y) - DOCUMENT_HEIGHT / 2,
        width: DOCUMENT_WIDTH,
        height: DOCUMENT_HEIGHT,
        transformOrigin: "50% 50%",
        willChange: "transform, opacity, filter",
        zIndex: 20,
      }}
    >
      <motion.div
        animate={documentRiseFrames()}
        transition={{ duration: PREVIEW_DURATION_SECONDS, ease: "linear" }}
        style={{
          position: "absolute",
          inset: 0,
          overflow: "hidden",
          color: INK,
          background: PAPER,
          border: MAC_WINDOW_BORDER,
          borderRadius: MAC_WINDOW_RADIUS,
          boxShadow: MAC_WINDOW_SHADOW,
          transformOrigin: "50% 0%",
          willChange: "transform, opacity, filter",
        }}
      >
        <MacDocumentTitlebar title="Fourier 项目概览.txt" fontFamily={FONT} />

        <div style={{ position: "absolute", left: 0, right: 0, top: 86, bottom: 0, background: PAPER_LIGHT }}>
          <div style={{ position: "absolute", left: 48, top: 34, color: MUTED_INK, fontFamily: FONT, fontSize: 13, fontWeight: 800, letterSpacing: ".16em", textTransform: "uppercase" }}>
            脚本智能体 / 初稿 01
          </div>
          <div style={{ position: "absolute", left: 48, right: 48, top: 66, height: 1, background: "#cfc3b1" }} />
          <motion.img
            src={textCursorUrl}
            alt=""
            animate={caretFrames()}
            transition={{ duration: PREVIEW_DURATION_SECONDS, ease: "linear" }}
            style={{
              position: "absolute",
              left: 74,
              top: 132,
              width: 22,
              height: 44,
              objectFit: "contain",
              filter: "sepia(1) saturate(5) hue-rotate(330deg) brightness(.72)",
              willChange: "transform, opacity",
              zIndex: 5,
            }}
          />
        </div>
      </motion.div>
    </motion.div>
  );
}

function SceneSevenLayer() {
  return (
    <FourierMotion>
      <Universe camera={camera} overscan={0.85}>
        <World
          id="script-agent-space"
          x={WORLD_LEFT}
          y={WORLD_TOP}
          width={WORLD_WIDTH}
          height={WORLD_HEIGHT}
          anchor={{ x: 0, y: 0 }}
          zIndex={1}
          cull="never"
        >
          <div
            aria-label="Script Agent moves down and left, opens a Mac-style document, and writes an overview of Fourier"
            style={{ position: "absolute", inset: 0, width: WORLD_WIDTH, height: WORLD_HEIGHT, overflow: "visible", pointerEvents: "none" }}
          >
            <GridField />

            {agents.map((agent, index) => (
              <motion.div
                key={agent.label}
                animate={leftBehindFrames(index)}
                transition={{ duration: PREVIEW_DURATION_SECONDS, ease: "linear" }}
                style={{
                  position: "absolute",
                  left: localX(agent.x),
                  top: localY(agent.y),
                  width: 260,
                  height: 236,
                  zIndex: 12,
                  willChange: "transform, opacity, filter",
                }}
              >
                <img
                  src={agent.cursor}
                  alt=""
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    width: 220,
                    height: 174,
                    filter: `drop-shadow(9px 13px 3px rgba(19,16,13,.32)) drop-shadow(0 0 12px ${agent.accent}44)`,
                  }}
                />
                <AgentLabel label={agent.label} />
              </motion.div>
            ))}

            <MacDocument />

            <motion.div
              animate={scriptCursorFrames()}
              transition={{ duration: PREVIEW_DURATION_SECONDS, ease: "linear" }}
              style={{
                position: "absolute",
                left: localX(1285),
                top: localY(627),
                width: 260,
                height: 236,
                zIndex: 40,
                transformOrigin: "30px 22px",
                willChange: "transform, opacity, filter",
              }}
            >
              <img
                src={scriptCursorUrl}
                alt=""
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  width: 220,
                  height: 174,
                  filter: "drop-shadow(9px 13px 3px rgba(19,16,13,.34)) drop-shadow(0 0 14px rgba(217,104,67,.36))",
                }}
              />
              <AgentLabel label="脚本" />
            </motion.div>

            <motion.div
              aria-hidden="true"
              animate={[
                { opacity: 0, scale: 0.3, offset: 0 },
                { opacity: 0, scale: 0.3, offset: 0.187 },
                { opacity: 0.9, scale: 0.48, offset: 0.193 },
                { opacity: 0, scale: 1.72, offset: 0.225 },
                { opacity: 0, scale: 1.72, offset: 1 },
              ]}
              transition={{ duration: PREVIEW_DURATION_SECONDS, ease: "linear" }}
              style={{
                position: "absolute",
                left: localX(DOCUMENT_CENTER.x) - 610,
                top: localY(DOCUMENT_CENTER.y) + 120,
                width: 86,
                height: 86,
                borderRadius: "50%",
                border: `4px solid ${SCRIPT_ACCENT}`,
                boxShadow: "0 0 22px rgba(217,104,67,.5)",
                zIndex: 39,
              }}
            />
          </div>
        </World>
      </Universe>
    </FourierMotion>
  );
}

export default defineReact({
  name: "SceneSevenScriptDocument",
  schema: {},
  component() {
    return <SceneSevenLayer />;
  },
  designPreview() {
    return {
      props: {},
      composition: { width: 1920, height: 1080, durationSeconds: SCENE_DURATION_SECONDS },
      player: { background: "#302c28", loop: true },
    };
  },
});
