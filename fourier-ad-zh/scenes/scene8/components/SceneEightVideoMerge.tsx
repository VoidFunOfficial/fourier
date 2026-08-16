import {
  FourierMotion,
  defineReact,
  motion,
  type FourierMotionTarget,
} from "@fourier-video/sdk";
import { Universe, World, defineCamera } from "@fourier-video/sdk/universe";
import docsUrl from "../assets/docs.svg";
import mailUrl from "../assets/mail-ready.svg";
import reviewCursorUrl from "../assets/cursor-review.svg";
import scriptCursorUrl from "../assets/cursor-script.svg";
import searchCursorUrl from "../assets/cursor-search.svg";
import videoCursorUrl from "../assets/cursor-video.svg";

const DURATION_SECONDS = 5.5;
const WORLD_WIDTH = 5200;
const WORLD_HEIGHT = 1800;
const FONT = "Inter, Arial, sans-serif";
const BACKGROUND = "#17281f";
const GRID = "#314838";
const PAPER = "#f6f0e4";
const INK = "#183c2a";
const GOLD = "#b79a52";
const CORAL = "#d16c4e";
const TEAL = "#4eaaa3";
const MERGE_CENTER = { x: 3300, y: 560 } as const;
const MAIL_CENTER = { x: 2990, y: 535 } as const;
const DOCUMENT_CENTER = { x: 3610, y: 545 } as const;
const POSTER_WIDTH = 1500;
const POSTER_HEIGHT = 844;
const CIRCLE_SIZE = 220;

const agents = [
  { label: "搜索", cursor: searchCursorUrl, accent: TEAL, x: 375, y: 237 },
  { label: "审核", cursor: reviewCursorUrl, accent: GOLD, x: 375, y: 627 },
  { label: "脚本", cursor: scriptCursorUrl, accent: CORAL, x: 1285, y: 627 },
] as const;

const camera = defineCamera({
  width: 1920,
  height: 1080,
  initial: { x: 960, y: 540, zoom: 1.08, rotation: 0 },
  moves: [
    {
      at: "0f",
      duration: "28f",
      to: { kind: "pose", x: 3380, y: 605, zoom: 1.12, rotation: 0.2 },
      path: {
        kind: "curve",
        points: [
          { x: 1420, y: 330 },
          { x: 2230, y: 400 },
          { x: 3040, y: 555 },
        ],
      },
      ease: [0.36, 0.02, 0.16, 1],
    },
    {
      at: "28f",
      duration: "3f",
      to: { kind: "pose", x: 3260, y: 548, zoom: 1.02, rotation: -0.08 },
      ease: "ease-out",
    },
    {
      at: "31f",
      duration: "3f",
      to: { kind: "pose", x: MERGE_CENTER.x, y: MERGE_CENTER.y, zoom: 1.06, rotation: 0 },
      ease: "ease-out",
    },
    {
      at: "90f",
      duration: "20f",
      to: { kind: "pose", x: MERGE_CENTER.x, y: MERGE_CENTER.y, zoom: 0.93, rotation: 0 },
      ease: [0.16, 1, 0.3, 1],
    },
  ],
});

function leftBehindFrames(index: number): readonly FourierMotionTarget[] {
  const driftX = index === 2 ? 54 : -42;
  const driftY = index === 1 ? 38 : -24;
  return [
    { opacity: 1, x: 0, y: 0, scale: 1, filter: "blur(0px)", offset: 0 },
    { opacity: 1, x: 0, y: 0, scale: 1, filter: "blur(0px)", offset: 0.02 },
    { opacity: 0.72, x: driftX, y: driftY, scale: 0.96, filter: "blur(3px)", offset: 0.05 },
    { opacity: 0, x: driftX * 2.4, y: driftY * 2.4, scale: 0.84, filter: "blur(9px)", offset: 0.09 },
    { opacity: 0, x: driftX * 2.4, y: driftY * 2.4, scale: 0.84, filter: "blur(9px)", offset: 1 },
  ];
}

function videoLabelFrames(): readonly FourierMotionTarget[] {
  return [
    { opacity: 1, y: 0, scale: 1, offset: 0 },
    { opacity: 1, y: 0, scale: 1, offset: 0.06 },
    { opacity: 0, y: 14, scale: 0.9, offset: 0.13 },
    { opacity: 0, y: 14, scale: 0.9, offset: 1 },
  ];
}

function videoCursorFrames(): readonly FourierMotionTarget[] {
  return [
    { x: 0, y: 0, rotate: 0, scale: 1, opacity: 1, filter: "blur(0px)", offset: 0 },
    { x: 430, y: 55, rotate: -4, scale: 1.04, opacity: 0.94, filter: "blur(8px)", offset: 0.025 },
    { x: 1120, y: 250, rotate: 5, scale: 1.08, opacity: 0.82, filter: "blur(14px)", offset: 0.055 },
    { x: 1810, y: 478, rotate: 7, scale: 1.1, opacity: 0.9, filter: "blur(8px)", offset: 0.095 },
    { x: 1850, y: 498, rotate: -2, scale: 1.12, opacity: 1, filter: "blur(0px)", offset: 0.112 },
    { x: 1815, y: 480, rotate: 0, scale: 1, opacity: 1, filter: "blur(0px)", offset: 0.13 },
    { x: 1875, y: 356, rotate: -19, scale: 1.12, opacity: 1, filter: "blur(0px)", offset: 0.19 },
    { x: 1948, y: 330, rotate: 13, scale: 1.24, opacity: 1, filter: "blur(1px)", offset: 0.22 },
    { x: 2040, y: 386, rotate: -9, scale: 0.94, opacity: 1, filter: "blur(0px)", offset: 0.24 },
    { x: 1960, y: 360, rotate: -2, scale: 1, opacity: 1, filter: "blur(0px)", offset: 0.27 },
    { x: 2290, y: 486, rotate: -22, scale: 1.14, opacity: 1, filter: "blur(3px)", offset: 0.305 },
    { x: 2352, y: 505, rotate: 14, scale: 1.28, opacity: 1, filter: "blur(1px)", offset: 0.33 },
    { x: 2242, y: 596, rotate: -11, scale: 0.93, opacity: 1, filter: "blur(0px)", offset: 0.35 },
    { x: MERGE_CENTER.x - 1285, y: MERGE_CENTER.y + 350 - 237, rotate: 0, scale: 1.02, opacity: 1, filter: "blur(0px)", offset: 0.375 },
    { x: MERGE_CENTER.x + 240 - 1285, y: MERGE_CENTER.y + 165 - 237, rotate: -24, scale: 1.08, opacity: 1, filter: "blur(1px)", offset: 0.44 },
    { x: MERGE_CENTER.x - 1285, y: MERGE_CENTER.y - 237, rotate: -42, scale: 0.68, opacity: 1, filter: "blur(0px)", offset: 0.5 },
    { x: MERGE_CENTER.x - 1285, y: MERGE_CENTER.y - 237, rotate: -52, scale: 0.25, opacity: 0, filter: "blur(6px)", offset: 0.54 },
    { x: MERGE_CENTER.x - 1285, y: MERGE_CENTER.y - 237, rotate: -52, scale: 0.25, opacity: 0, filter: "blur(6px)", offset: 1 },
  ];
}

function mailFrames(): readonly FourierMotionTarget[] {
  return [
    { x: -1640, y: 0, rotate: -16, scale: 0.78, scaleX: 1, scaleY: 1, opacity: 0, filter: "blur(12px)", borderRadius: "44px", offset: 0 },
    { x: -1640, y: 0, rotate: -16, scale: 0.78, scaleX: 1, scaleY: 1, opacity: 0, filter: "blur(12px)", borderRadius: "44px", offset: 0.09 },
    { x: -1040, y: -34, rotate: -10, scale: 0.9, scaleX: 1, scaleY: 1, opacity: 0.84, filter: "blur(9px)", borderRadius: "44px", offset: 0.125 },
    { x: 86, y: 8, rotate: 5, scale: 1.04, scaleX: 1.12, scaleY: 0.94, opacity: 1, filter: "blur(1px)", borderRadius: "44px", offset: 0.195 },
    { x: 0, y: 0, rotate: 3.5, scale: 1, scaleX: 0.82, scaleY: 1.18, opacity: 1, filter: "blur(0px)", borderRadius: "48px", offset: 0.22 },
    { x: -34, y: -4, rotate: -1.8, scale: 1, scaleX: 1.08, scaleY: 0.95, opacity: 1, filter: "blur(0px)", borderRadius: "44px", offset: 0.238 },
    { x: 12, y: 2, rotate: 0.7, scale: 1, scaleX: 0.98, scaleY: 1.02, opacity: 1, filter: "blur(0px)", borderRadius: "44px", offset: 0.255 },
    { x: 0, y: 0, rotate: 0, scale: 1, scaleX: 1, scaleY: 1, opacity: 1, filter: "blur(0px)", borderRadius: "44px", offset: 0.275 },
    { x: 0, y: 0, rotate: 0, scale: 1, scaleX: 1, scaleY: 1, opacity: 1, filter: "blur(0px)", borderRadius: "44px", offset: 0.39 },
    { x: 110, y: 3, rotate: 4, scale: 1, scaleX: 0.78, scaleY: 0.92, opacity: 1, filter: "blur(0px)", borderRadius: "70px", offset: 0.44 },
    { x: 250, y: 16, rotate: 11, scale: 0.68, scaleX: 0.5, scaleY: 0.72, opacity: 0.96, filter: "blur(1px)", borderRadius: "110px", offset: 0.5 },
    { x: MERGE_CENTER.x - MAIL_CENTER.x, y: MERGE_CENTER.y - MAIL_CENTER.y, rotate: 18, scale: 0.3, scaleX: 0.28, scaleY: 0.58, opacity: 0, filter: "blur(5px)", borderRadius: "110px", offset: 0.56 },
    { x: MERGE_CENTER.x - MAIL_CENTER.x, y: MERGE_CENTER.y - MAIL_CENTER.y, rotate: 18, scale: 0.3, scaleX: 0.28, scaleY: 0.58, opacity: 0, filter: "blur(5px)", borderRadius: "110px", offset: 1 },
  ];
}

function documentFrames(): readonly FourierMotionTarget[] {
  return [
    { x: 0, y: 1350, rotate: 12, scale: 0.76, scaleX: 1, scaleY: 1, opacity: 0, filter: "blur(13px)", borderRadius: "42px", offset: 0 },
    { x: 0, y: 1350, rotate: 12, scale: 0.76, scaleX: 1, scaleY: 1, opacity: 0, filter: "blur(13px)", borderRadius: "42px", offset: 0.21 },
    { x: -20, y: 850, rotate: 8, scale: 0.88, scaleX: 1, scaleY: 1, opacity: 0.86, filter: "blur(9px)", borderRadius: "42px", offset: 0.245 },
    { x: 10, y: -82, rotate: -4.5, scale: 1.05, scaleX: 0.94, scaleY: 1.13, opacity: 1, filter: "blur(1px)", borderRadius: "42px", offset: 0.3 },
    { x: 0, y: 0, rotate: -2.5, scale: 1, scaleX: 1.18, scaleY: 0.78, opacity: 1, filter: "blur(0px)", borderRadius: "48px", offset: 0.33 },
    { x: -4, y: 44, rotate: 1.8, scale: 1, scaleX: 0.94, scaleY: 1.09, opacity: 1, filter: "blur(0px)", borderRadius: "42px", offset: 0.347 },
    { x: 2, y: -12, rotate: -0.6, scale: 1, scaleX: 1.02, scaleY: 0.98, opacity: 1, filter: "blur(0px)", borderRadius: "42px", offset: 0.365 },
    { x: 0, y: 0, rotate: 0, scale: 1, scaleX: 1, scaleY: 1, opacity: 1, filter: "blur(0px)", borderRadius: "42px", offset: 0.39 },
    { x: -110, y: 3, rotate: -4, scale: 1, scaleX: 0.78, scaleY: 0.92, opacity: 1, filter: "blur(0px)", borderRadius: "70px", offset: 0.44 },
    { x: -250, y: 16, rotate: -11, scale: 0.68, scaleX: 0.5, scaleY: 0.72, opacity: 0.96, filter: "blur(1px)", borderRadius: "110px", offset: 0.5 },
    { x: MERGE_CENTER.x - DOCUMENT_CENTER.x, y: MERGE_CENTER.y - DOCUMENT_CENTER.y, rotate: -18, scale: 0.3, scaleX: 0.28, scaleY: 0.58, opacity: 0, filter: "blur(5px)", borderRadius: "110px", offset: 0.56 },
    { x: MERGE_CENTER.x - DOCUMENT_CENTER.x, y: MERGE_CENTER.y - DOCUMENT_CENTER.y, rotate: -18, scale: 0.3, scaleX: 0.28, scaleY: 0.58, opacity: 0, filter: "blur(5px)", borderRadius: "110px", offset: 1 },
  ];
}

function posterContainerFrames(): readonly FourierMotionTarget[] {
  const circleX = (POSTER_WIDTH - CIRCLE_SIZE) / 2;
  const circleY = (POSTER_HEIGHT - CIRCLE_SIZE) / 2;
  return [
    { opacity: 0, x: circleX, y: circleY, width: `${CIRCLE_SIZE}px`, height: `${CIRCLE_SIZE}px`, borderRadius: "50%", scale: 0.4, rotate: -28, filter: "blur(8px)", backgroundColor: GOLD, offset: 0 },
    { opacity: 0, x: circleX, y: circleY, width: `${CIRCLE_SIZE}px`, height: `${CIRCLE_SIZE}px`, borderRadius: "50%", scale: 0.4, rotate: -28, filter: "blur(8px)", backgroundColor: GOLD, offset: 0.515 },
    { opacity: 1, x: circleX, y: circleY, width: `${CIRCLE_SIZE}px`, height: `${CIRCLE_SIZE}px`, borderRadius: "50%", scale: 0.72, rotate: -10, filter: "blur(2px)", backgroundColor: GOLD, offset: 0.54 },
    { opacity: 1, x: circleX, y: circleY, width: `${CIRCLE_SIZE}px`, height: `${CIRCLE_SIZE}px`, borderRadius: "50%", scale: 1.18, rotate: 5, filter: "blur(0px)", backgroundColor: PAPER, offset: 0.565 },
    { opacity: 1, x: circleX, y: circleY, width: `${CIRCLE_SIZE}px`, height: `${CIRCLE_SIZE}px`, borderRadius: "50%", scale: 0.97, rotate: -2, filter: "blur(0px)", backgroundColor: PAPER, offset: 0.585 },
    { opacity: 1, x: circleX, y: circleY, width: `${CIRCLE_SIZE}px`, height: `${CIRCLE_SIZE}px`, borderRadius: "50%", scale: 1, rotate: 0, filter: "blur(0px)", backgroundColor: PAPER, offset: 0.6 },
    { opacity: 1, x: 200, y: 112, width: "1100px", height: "620px", borderRadius: "130px", scale: 0.96, rotate: -1.5, filter: "blur(1px)", backgroundColor: PAPER, offset: 0.66 },
    { opacity: 1, x: -18, y: -10, width: "1536px", height: "864px", borderRadius: "32px", scale: 1.02, rotate: 0.5, filter: "blur(0px)", backgroundColor: PAPER, offset: 0.7 },
    { opacity: 1, x: 8, y: 4, width: "1484px", height: "836px", borderRadius: "26px", scale: 0.995, rotate: -0.12, filter: "blur(0px)", backgroundColor: PAPER, offset: 0.72 },
    { opacity: 1, x: 0, y: 0, width: `${POSTER_WIDTH}px`, height: `${POSTER_HEIGHT}px`, borderRadius: "24px", scale: 1, rotate: 0, filter: "blur(0px)", backgroundColor: PAPER, offset: 0.74 },
    { opacity: 1, x: 0, y: 0, width: `${POSTER_WIDTH}px`, height: `${POSTER_HEIGHT}px`, borderRadius: "24px", scale: 1, rotate: 0, filter: "blur(0px)", backgroundColor: PAPER, offset: 0.82 },
    { opacity: 0, x: 0, y: 0, width: `${POSTER_WIDTH}px`, height: `${POSTER_HEIGHT}px`, borderRadius: "24px", scale: 1, rotate: 0, filter: "blur(0px)", backgroundColor: PAPER, offset: 0.835 },
    { opacity: 0, x: 0, y: 0, width: `${POSTER_WIDTH}px`, height: `${POSTER_HEIGHT}px`, borderRadius: "24px", scale: 1, rotate: 0, filter: "blur(0px)", backgroundColor: PAPER, offset: 1 },
  ];
}

function AgentLabel({ label, animated = false }: { label: string; animated?: boolean }) {
  const style = {
    position: "absolute",
    left: 28,
    top: 177,
    minWidth: 112,
    padding: "9px 18px 10px",
    borderRadius: 999,
    color: PAPER,
    background: "rgba(20,45,31,.9)",
    border: "1px solid rgba(246,240,228,.35)",
    fontFamily: FONT,
    fontSize: 21,
    lineHeight: 1,
    fontWeight: 750,
    letterSpacing: ".01em",
    textAlign: "center",
    whiteSpace: "nowrap",
  } as const;
  return animated ? (
    <motion.div animate={videoLabelFrames()} transition={{ duration: DURATION_SECONDS, ease: "linear" }} style={style}>
      {label}
    </motion.div>
  ) : <div style={style}>{label}</div>;
}

function GridField() {
  const verticalLines = Array.from({ length: 44 }, (_, index) => index * 120);
  const horizontalLines = Array.from({ length: 16 }, (_, index) => index * 120);
  return (
    <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: BACKGROUND }}>
      {verticalLines.map((left) => (
        <span key={`v-${left}`} style={{ position: "absolute", left, top: 0, width: 1, height: WORLD_HEIGHT, background: GRID, opacity: 0.56 }} />
      ))}
      {horizontalLines.map((top) => (
        <span key={`h-${top}`} style={{ position: "absolute", left: 0, top, width: WORLD_WIDTH, height: 1, background: GRID, opacity: 0.56 }} />
      ))}
    </div>
  );
}

function MailCard() {
  return (
    <motion.div
      animate={mailFrames()}
      transition={{ duration: DURATION_SECONDS, ease: "linear" }}
      style={{
        position: "absolute",
        left: MAIL_CENTER.x - 180,
        top: MAIL_CENTER.y - 140,
        width: 360,
        height: 280,
        transformOrigin: "50% 50%",
        willChange: "transform, opacity, filter",
        zIndex: 20,
      }}
    >
      <img src={mailUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
    </motion.div>
  );
}

function DocumentCard() {
  return (
    <motion.div
      animate={documentFrames()}
      transition={{ duration: DURATION_SECONDS, ease: "linear" }}
      style={{
        position: "absolute",
        left: DOCUMENT_CENTER.x - 150,
        top: DOCUMENT_CENTER.y - 150,
        width: 300,
        height: 300,
        transformOrigin: "50% 50%",
        willChange: "transform, opacity, filter",
        zIndex: 21,
      }}
    >
      <img src={docsUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
    </motion.div>
  );
}

function PosterReveal() {
  return (
    <motion.div
      animate={posterContainerFrames()}
      transition={{ duration: DURATION_SECONDS, ease: "linear" }}
      style={{
        position: "absolute",
        left: MERGE_CENTER.x - POSTER_WIDTH / 2,
        top: MERGE_CENTER.y - POSTER_HEIGHT / 2,
        overflow: "hidden",
        border: `3px solid ${PAPER}`,
        boxShadow: "0 34px 0 rgba(7,19,12,.22), 0 60px 120px rgba(7,19,12,.46)",
        transformOrigin: "50% 50%",
        willChange: "width, height, transform, opacity, filter",
        zIndex: 60,
      }}
    />
  );
}

function SceneEightLayer() {
  return (
    <FourierMotion>
      <Universe camera={camera} overscan={0.95}>
        <World
          id="video-agent-open-space"
          x={0}
          y={0}
          width={WORLD_WIDTH}
          height={WORLD_HEIGHT}
          anchor={{ x: 0, y: 0 }}
          zIndex={1}
          cull="never"
        >
          <div
            aria-label="Video Agent catches the mail and script handoffs, circles both three times, and merges them into the Fourier poster"
            style={{ position: "absolute", inset: 0, width: WORLD_WIDTH, height: WORLD_HEIGHT, overflow: "visible", pointerEvents: "none" }}
          >
            <GridField />

            {agents.map((agent, index) => (
              <motion.div
                key={agent.label}
                animate={leftBehindFrames(index)}
                transition={{ duration: DURATION_SECONDS, ease: "linear" }}
                style={{
                  position: "absolute",
                  left: agent.x,
                  top: agent.y,
                  width: 260,
                  height: 236,
                  zIndex: 10,
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
                    filter: `drop-shadow(9px 13px 3px rgba(7,19,12,.36)) drop-shadow(0 0 12px ${agent.accent}55)`,
                  }}
                />
                <AgentLabel label={agent.label} />
              </motion.div>
            ))}

            <MailCard />
            <DocumentCard />
            <PosterReveal />

            <motion.div
              animate={videoCursorFrames()}
              transition={{ duration: DURATION_SECONDS, ease: "linear" }}
              style={{
                position: "absolute",
                left: 1285,
                top: 237,
                width: 260,
                height: 236,
                zIndex: 80,
                transformOrigin: "30px 22px",
                willChange: "transform, opacity, filter",
              }}
            >
              <img
                src={videoCursorUrl}
                alt=""
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  width: 220,
                  height: 174,
                  filter: `drop-shadow(9px 13px 3px rgba(7,19,12,.4)) drop-shadow(0 0 14px ${GOLD}66)`,
                }}
              />
              <AgentLabel label="视频" animated />
            </motion.div>
          </div>
        </World>
      </Universe>
    </FourierMotion>
  );
}

export default defineReact({
  name: "SceneEightVideoMerge",
  schema: {},
  component() {
    return <SceneEightLayer />;
  },
  designPreview() {
    return {
      props: {},
      composition: { width: 1920, height: 1080, durationSeconds: DURATION_SECONDS },
      player: { background: BACKGROUND, loop: true },
    };
  },
});
