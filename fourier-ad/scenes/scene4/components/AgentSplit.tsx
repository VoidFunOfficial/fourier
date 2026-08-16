import {
  FourierMotion,
  defineReact,
  motion,
  useFourierContext,
  type FourierMotionTarget,
} from "@fourier-video/sdk";
import { Universe, World, defineCamera } from "@fourier-video/sdk/universe";
import arrowCursorUrl from "../assets/default.svg";
import reviewCursorUrl from "../assets/cursor-review.svg";
import scriptCursorUrl from "../assets/cursor-script.svg";
import searchCursorUrl from "../assets/cursor-search.svg";
import videoCursorUrl from "../assets/cursor-video.svg";

const PREVIEW_DURATION_SECONDS = 4;
const FONT = "Inter, Arial, sans-serif";
const WORLD_WIDTH = 1920;
const WORLD_HEIGHT = 1080;
const PANEL_WIDTH = 1420;
const PANEL_HEIGHT = 256;
const PANEL_LEFT = (WORLD_WIDTH - PANEL_WIDTH) / 2;
const PANEL_TOP = (WORLD_HEIGHT - PANEL_HEIGHT) / 2;
const CIRCLE_SIZE = 176;

const camera = defineCamera({
  width: WORLD_WIDTH,
  height: WORLD_HEIGHT,
  initial: { x: 960, y: 540, zoom: 1.08, rotation: 0 },
  moves: [],
});

const agents = [
  {
    label: "Search",
    accent: "#78c8c1",
    cursor: searchCursorUrl,
    x: -455,
    y: -185,
  },
  {
    label: "Video",
    accent: "#9c90d4",
    cursor: videoCursorUrl,
    x: 455,
    y: -185,
  },
  {
    label: "Review",
    accent: "#e2bd76",
    cursor: reviewCursorUrl,
    x: -455,
    y: 205,
  },
  {
    label: "Script",
    accent: "#d98da3",
    cursor: scriptCursorUrl,
    x: 455,
    y: 205,
  },
] as const;

function panelFrames(): readonly FourierMotionTarget[] {
  return [
    {
      x: 0,
      y: 0,
      width: `${PANEL_WIDTH}px`,
      height: `${PANEL_HEIGHT}px`,
      borderRadius: "32px",
      scale: 1,
      opacity: 1,
      filter: "blur(0px)",
      offset: 0,
    },
    {
      x: 0,
      y: 0,
      width: `${PANEL_WIDTH}px`,
      height: `${PANEL_HEIGHT}px`,
      borderRadius: "32px",
      scale: 1,
      opacity: 1,
      filter: "blur(0px)",
      offset: 0.075,
    },
    {
      x: 430,
      y: 63,
      width: "560px",
      height: "130px",
      borderRadius: "65px",
      scale: 0.96,
      opacity: 1,
      filter: "blur(0px)",
      offset: 0.165,
    },
    {
      x: 450,
      y: 65,
      width: "520px",
      height: "126px",
      borderRadius: "63px",
      scale: 1.04,
      opacity: 1,
      filter: "blur(0px)",
      offset: 0.19,
    },
    {
      x: 622,
      y: 40,
      width: `${CIRCLE_SIZE}px`,
      height: `${CIRCLE_SIZE}px`,
      borderRadius: "88px",
      scale: 0.82,
      opacity: 1,
      filter: "blur(0px)",
      offset: 0.255,
    },
    {
      x: 622,
      y: 40,
      width: `${CIRCLE_SIZE}px`,
      height: `${CIRCLE_SIZE}px`,
      borderRadius: "88px",
      scale: 1.17,
      opacity: 1,
      filter: "blur(0px)",
      offset: 0.29,
    },
    {
      x: 622,
      y: 40,
      width: `${CIRCLE_SIZE}px`,
      height: `${CIRCLE_SIZE}px`,
      borderRadius: "88px",
      scale: 0.96,
      opacity: 1,
      filter: "blur(0px)",
      offset: 0.315,
    },
    {
      x: 622,
      y: 40,
      width: `${CIRCLE_SIZE}px`,
      height: `${CIRCLE_SIZE}px`,
      borderRadius: "88px",
      scale: 1,
      opacity: 1,
      filter: "blur(0px)",
      offset: 0.345,
    },
    {
      x: 622,
      y: 40,
      width: `${CIRCLE_SIZE}px`,
      height: `${CIRCLE_SIZE}px`,
      borderRadius: "88px",
      scale: 0.72,
      opacity: 0,
      filter: "blur(8px)",
      offset: 0.47,
    },
    {
      x: 622,
      y: 40,
      width: `${CIRCLE_SIZE}px`,
      height: `${CIRCLE_SIZE}px`,
      borderRadius: "88px",
      scale: 0.72,
      opacity: 0,
      filter: "blur(8px)",
      offset: 1,
    },
  ];
}

function heroCursorFrames(): readonly FourierMotionTarget[] {
  return [
    { opacity: 0, scale: 0.35, rotate: 0, x: 0, y: 0, filter: "blur(10px)", offset: 0 },
    { opacity: 0, scale: 0.35, rotate: 0, x: 0, y: 0, filter: "blur(10px)", offset: 0.37 },
    { opacity: 1, scale: 1.2, rotate: -4, x: -8, y: -8, filter: "blur(0px)", offset: 0.455 },
    { opacity: 1, scale: 0.96, rotate: 2, x: 2, y: 2, filter: "blur(0px)", offset: 0.49 },
    { opacity: 1, scale: 1.03, rotate: 0, x: 0, y: 0, filter: "blur(0px)", offset: 0.515 },
    { opacity: 1, scale: 1.08, rotate: -13, x: -34, y: 4, filter: "blur(0px)", offset: 0.59 },
    { opacity: 1, scale: 1.08, rotate: 14, x: 36, y: -3, filter: "blur(0px)", offset: 0.66 },
    { opacity: 1, scale: 1.1, rotate: -9, x: -25, y: 2, filter: "blur(0px)", offset: 0.72 },
    { opacity: 1, scale: 1.16, rotate: 7, x: 18, y: -2, filter: "blur(0px)", offset: 0.775 },
    { opacity: 1, scale: 0.78, rotate: 0, x: 0, y: 0, filter: "blur(0px)", offset: 0.82 },
    { opacity: 0, scale: 1.35, rotate: 0, x: 0, y: 0, filter: "blur(8px)", offset: 0.865 },
    { opacity: 0, scale: 1.35, rotate: 0, x: 0, y: 0, filter: "blur(8px)", offset: 1 },
  ];
}

function splitFrames(index: number, x: number, y: number): readonly FourierMotionTarget[] {
  const angle = index % 2 === 0 ? -5 : 5;
  return [
    { opacity: 0, x: 0, y: 0, scale: 0.7, rotate: 0, filter: "blur(8px)", offset: 0 },
    { opacity: 0, x: 0, y: 0, scale: 0.7, rotate: 0, filter: "blur(8px)", offset: 0.58 },
    { opacity: 1, x: 0, y: 0, scale: 0.82, rotate: 0, filter: "blur(0px)", offset: 0.64 },
    { opacity: 1, x: x * 1.12, y: y * 1.12, scale: 1.08, rotate: angle, filter: "blur(0px)", offset: 0.8 },
    { opacity: 1, x: x * 0.96, y: y * 0.96, scale: 0.97, rotate: -angle * 0.35, filter: "blur(0px)", offset: 0.895 },
    { opacity: 1, x, y, scale: 1.02, rotate: 0, filter: "blur(0px)", offset: 0.96 },
    { opacity: 1, x, y, scale: 1, rotate: 0, filter: "blur(0px)", offset: 1 },
  ];
}

function cursorInertiaFrames(index: number): readonly FourierMotionTarget[] {
  const horizontal = index % 2 === 0 ? -1 : 1;
  const vertical = index < 2 ? -1 : 1;
  return [
    { x: 0, y: 0, rotate: 0, scale: 1, offset: 0 },
    { x: 0, y: 0, rotate: 0, scale: 1, offset: 0.64 },
    { x: -horizontal * 34, y: -vertical * 18, rotate: -horizontal * 8, scale: 1.03, offset: 0.8 },
    { x: horizontal * 13, y: vertical * 7, rotate: horizontal * 3.5, scale: 0.98, offset: 0.895 },
    { x: -horizontal * 6, y: -vertical * 3, rotate: -horizontal * 1.5, scale: 1.01, offset: 0.96 },
    { x: 0, y: 0, rotate: 0, scale: 1, offset: 1 },
  ];
}

function labelInertiaFrames(index: number): readonly FourierMotionTarget[] {
  const horizontal = index % 2 === 0 ? -1 : 1;
  const vertical = index < 2 ? -1 : 1;
  return [
    { opacity: 0, x: 0, y: 12, scale: 0.9, offset: 0 },
    { opacity: 0, x: 0, y: 12, scale: 0.9, offset: 0.76 },
    { opacity: 0.5, x: -horizontal * 82, y: -vertical * 42 + 12, scale: 0.94, offset: 0.8 },
    { opacity: 1, x: -horizontal * 34, y: -vertical * 18, scale: 1.02, offset: 0.895 },
    { opacity: 1, x: horizontal * 17, y: vertical * 8, scale: 1.04, offset: 0.94 },
    { opacity: 1, x: -horizontal * 6, y: -vertical * 3, scale: 0.99, offset: 0.975 },
    { opacity: 1, x: 0, y: 0, scale: 1, offset: 1 },
  ];
}

function bluePurpleBackgroundFrames(): readonly FourierMotionTarget[] {
  return [
    { opacity: 0, scale: 0.18, offset: 0 },
    { opacity: 0, scale: 0.18, offset: 0.245 },
    { opacity: 1, scale: 0.72, offset: 0.275 },
    { opacity: 1, scale: 12.6, offset: 0.405 },
    { opacity: 1, scale: 12.6, offset: 1 },
  ];
}

function staticInterfaceFrames(): readonly FourierMotionTarget[] {
  return [
    { opacity: 0, offset: 0 },
    { opacity: 0, offset: 0.39 },
    { opacity: 0.22, offset: 0.45 },
    { opacity: 0.22, offset: 1 },
  ];
}

function PromptDetails() {
  return (
    <motion.div
      animate={[
        { opacity: 1, scale: 1, filter: "blur(0px)", offset: 0 },
        { opacity: 1, scale: 1, filter: "blur(0px)", offset: 0.025 },
        { opacity: 0, scale: 0.96, filter: "blur(6px)", offset: 0.07 },
        { opacity: 0, scale: 0.94, filter: "blur(8px)", offset: 1 },
      ]}
      transition={{ duration: PREVIEW_DURATION_SECONDS, ease: [0.4, 0, 0.2, 1] }}
      style={{ position: "absolute", inset: 0, overflow: "hidden" }}
    >
      <div
        style={{
          position: "absolute",
          left: 42,
          top: 36,
          color: "#f4f3f7",
          fontSize: 35,
          letterSpacing: "-.018em",
        }}
      >
        Creating your Fourier film...
      </div>
      <div
        style={{
          position: "absolute",
          left: 34,
          bottom: 27,
          display: "flex",
          alignItems: "center",
          gap: 22,
          color: "#f4f3f7",
          fontSize: 29,
        }}
      >
        <span style={{ fontSize: 42, fontWeight: 200 }}>+</span>
        <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
          <path d="m10 17 8-8a5 5 0 0 1 7 7L14 27A7 7 0 0 1 4 17L15 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
          <path d="m16 5 11 6-11 6-11-6 11-6ZM6 17l10 5 10-5M6 22l10 5 10-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
        <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
          <circle cx="14" cy="14" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="M5 14h18M14 5c3 3 4 6 4 9s-1 6-4 9c-3-3-4-6-4-9s1-6 4-9ZM22 22l6 6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <span style={{ marginLeft: 5 }}>Fourier 1.0</span>
      </div>
      <div
        style={{
          position: "absolute",
          right: 32,
          bottom: 20,
          width: 64,
          height: 64,
          display: "grid",
          placeItems: "center",
          borderRadius: "50%",
          color: "#3e3d46",
          background: "#f6f5f8",
          boxShadow: "0 5px 14px rgba(8,7,14,.3)",
        }}
      >
        <svg viewBox="0 0 32 32" width="35" height="35" aria-hidden="true">
          <path d="M16 25V8M9 15l7-7 7 7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </motion.div>
  );
}

function EnergyRing({ delay, size }: { delay: number; size: number }) {
  return (
    <motion.div
      aria-hidden="true"
      animate={[
        { opacity: 0, scale: 0.55, offset: 0 },
        { opacity: 0, scale: 0.55, offset: 0.28 + delay },
        { opacity: 0.78, scale: 0.72, offset: 0.34 + delay },
        { opacity: 0, scale: 1.62, offset: 0.47 + delay },
        { opacity: 0, scale: 1.62, offset: 1 },
      ]}
      transition={{ duration: PREVIEW_DURATION_SECONDS, ease: [0.18, 0.85, 0.22, 1] }}
      style={{
        position: "absolute",
        left: WORLD_WIDTH / 2 - size / 2,
        top: WORLD_HEIGHT / 2 - size / 2,
        width: size,
        height: size,
        borderRadius: "50%",
        zIndex: 16,
        border: "3px solid rgba(177,169,244,.88)",
        boxShadow: "0 0 26px rgba(130,116,255,.48), inset 0 0 18px rgba(130,116,255,.24)",
      }}
    />
  );
}

function AgentSplitLayer() {
  const { width, height } = useFourierContext();
  const centerX = width / 2;
  const centerY = height / 2;

  return (
    <FourierMotion>
      <Universe camera={camera} overscan={0.55}>
        <World
          id="agent-orchestration"
          x={WORLD_WIDTH / 2}
          y={WORLD_HEIGHT / 2}
          width={WORLD_WIDTH}
          height={WORLD_HEIGHT}
          zIndex={1}
          cull="never"
        >
          <div
            aria-label="A prompt dialog collapses into a large cursor and splits into four specialist agents"
            style={{
              position: "absolute",
              inset: 0,
              width,
              height,
              overflow: "visible",
              fontFamily: FONT,
              color: "#f6f5f8",
              pointerEvents: "none",
            }}
          >
            <motion.div
              aria-hidden="true"
              animate={bluePurpleBackgroundFrames()}
              transition={{ duration: PREVIEW_DURATION_SECONDS, ease: [0.2, 0.82, 0.18, 1] }}
              style={{
                position: "absolute",
                left: centerX - 100,
                top: centerY - 100,
                width: 200,
                height: 200,
                zIndex: 0,
                borderRadius: "50%",
                background: "#565473",
                boxShadow: "0 0 0 8px rgba(167,157,230,.45), 0 0 70px rgba(124,111,207,.48)",
                transformOrigin: "50% 50%",
                willChange: "transform, opacity",
              }}
            />

            <motion.div
              aria-hidden="true"
              animate={staticInterfaceFrames()}
              transition={{ duration: PREVIEW_DURATION_SECONDS, ease: "ease-out" }}
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 1,
                backgroundImage: [
                  "linear-gradient(rgba(224,220,255,.14) 1px, transparent 1px)",
                  "linear-gradient(90deg, rgba(224,220,255,.14) 1px, transparent 1px)",
                ].join(","),
                backgroundSize: "96px 96px",
                boxShadow: "inset 0 0 220px rgba(28,25,48,.28)",
              }}
            />

            <motion.div
              animate={panelFrames()}
              transition={{ duration: PREVIEW_DURATION_SECONDS, ease: [0.19, 0.91, 0.23, 1] }}
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
                zIndex: 10,
                transformOrigin: "50% 50%",
                willChange: "transform, width, height, border-radius, opacity, filter",
              }}
            >
              <PromptDetails />
              <motion.div
                aria-hidden="true"
                animate={[
                  { opacity: 0, scale: 0.25, offset: 0 },
                  { opacity: 0, scale: 0.25, offset: 0.23 },
                  { opacity: 1, scale: 0.82, offset: 0.285 },
                  { opacity: 0.35, scale: 1.35, offset: 0.39 },
                  { opacity: 0, scale: 1.7, offset: 0.47 },
                  { opacity: 0, scale: 1.7, offset: 1 },
                ]}
                transition={{ duration: PREVIEW_DURATION_SECONDS, ease: [0.22, 0.84, 0.2, 1] }}
                style={{
                  position: "absolute",
                  inset: 14,
                  borderRadius: "50%",
                  border: "4px solid #9184ff",
                  boxShadow: "0 0 32px rgba(130,116,255,.8)",
                }}
              />
            </motion.div>

            <EnergyRing delay={0} size={208} />
            <EnergyRing delay={0.035} size={248} />
            <EnergyRing delay={0.07} size={292} />

            <motion.img
              src={arrowCursorUrl}
              alt=""
              animate={heroCursorFrames()}
              transition={{ duration: PREVIEW_DURATION_SECONDS, ease: "linear" }}
              style={{
                position: "absolute",
                left: centerX - 102,
                top: centerY - 102,
                width: 204,
                height: 204,
                zIndex: 30,
                transformOrigin: "34px 29px",
                filter: "drop-shadow(0 16px 20px rgba(5,4,12,.52))",
                willChange: "transform, opacity, filter",
              }}
            />

            {agents.map((agent, index) => (
              <motion.div
                key={agent.label}
                animate={splitFrames(index, agent.x, agent.y)}
                transition={{ duration: PREVIEW_DURATION_SECONDS, ease: "linear" }}
                style={{
                  position: "absolute",
                  left: centerX - 130,
                  top: centerY - 118,
                  width: 260,
                  height: 236,
                  zIndex: 24,
                  transformOrigin: "50% 50%",
                  willChange: "transform, opacity, filter",
                }}
              >
                <motion.img
                  aria-hidden="true"
                  src={agent.cursor}
                  alt=""
                  animate={cursorInertiaFrames(index)}
                  transition={{ duration: PREVIEW_DURATION_SECONDS, ease: "linear" }}
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    width: 220,
                    height: 174,
                    filter: `drop-shadow(9px 13px 3px rgba(28,25,48,.34)) drop-shadow(0 0 14px ${agent.accent}55)`,
                    transformOrigin: "30px 22px",
                    willChange: "transform",
                  }}
                />
                <motion.div
                  animate={labelInertiaFrames(index)}
                  transition={{ duration: PREVIEW_DURATION_SECONDS, ease: "linear" }}
                  style={{
                    position: "absolute",
                    left: 26,
                    top: 177,
                    minWidth: 112,
                    padding: "9px 18px 10px",
                    borderRadius: 999,
                    color: "#fff7f1",
                    background: "rgba(42,39,67,.76)",
                    border: "1px solid rgba(235,232,255,.2)",
                    boxShadow: "0 8px 18px rgba(27,24,46,.24)",
                    fontSize: 21,
                    lineHeight: 1,
                    fontWeight: 650,
                    letterSpacing: ".01em",
                    textAlign: "center",
                    whiteSpace: "nowrap",
                    willChange: "transform, opacity",
                  }}
                >
                  {agent.label}
                </motion.div>
              </motion.div>
            ))}
          </div>
        </World>
      </Universe>
    </FourierMotion>
  );
}

export default defineReact({
  name: "SceneFourAgentSplit",
  schema: {},
  component() {
    return <AgentSplitLayer />;
  },
  designPreview() {
    return {
      props: {},
      composition: { width: 1920, height: 1080, durationSeconds: PREVIEW_DURATION_SECONDS },
      player: { background: "#23212d", loop: true },
    };
  },
});
