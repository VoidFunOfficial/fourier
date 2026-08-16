import poster1Url from "../assets/poster1.png";
import poster2Url from "../assets/poster2.png";
import {
  FourierMotion,
  defineReact,
  motion,
  type FourierMotionTarget,
} from "@fourier-video/sdk";
import { Universe, World, defineCamera } from "@fourier-video/sdk/universe";
import reviewCursorUrl from "../assets/cursor-review.svg";
import scriptCursorUrl from "../assets/cursor-script.svg";
import searchCursorUrl from "../assets/cursor-search.svg";
import videoCursorUrl from "../assets/cursor-video.svg";
import {
  MAC_WINDOW_BORDER,
  MAC_WINDOW_RADIUS,
  MAC_WINDOW_SHADOW,
  MacBrowserToolbar,
} from "./MacWindowChrome";

const DURATION_FRAMES = 204;
const DURATION_SECONDS = DURATION_FRAMES / 30;
const WORLD_WIDTH = 5_400;
const WORLD_HEIGHT = 2_700;
const FONT = "Inter, Arial, sans-serif";
const BACKGROUND = "#17221b";
const GRID = "#2b3930";
const PAPER = "#f5f0e6";
const INK = "#20261f";
const GOLD = "#c3a15c";
const CORAL = "#c56f52";
const TEAL = "#5f9d8e";
const POSTER_WIDTH = 1_400;
const POSTER_HEIGHT = 788;
const BROWSER_LEFT = 2_540;
const BROWSER_TOP = 130;
const BROWSER_WIDTH = 1_520;
const BROWSER_HEIGHT = 820;
const BROWSER_STYLE_X = BROWSER_LEFT + 162;
const BROWSER_STYLE_Y = BROWSER_TOP + 210;
const POSTER_DROP_X = 3_310;
const POSTER_DROP_Y = 1_650;
const REVIEW_START = { x: 375, y: 627 } as const;
const REVIEW_CATCH = { x: 3_425, y: 1_815 } as const;

const worldStyles = [
  { handle: "@mira-hart/botanical-ink", swatch: "#ffffff", selected: true },
  { handle: "@elliot-wren/quiet-charcoal", swatch: "#a8aa9d", selected: false },
  { handle: "@june-ito/warm-letterpress", swatch: GOLD, selected: false },
  { handle: "@owen-vale/field-notes", swatch: TEAL, selected: false },
] as const;

const agents = [
  { label: "搜索", cursor: searchCursorUrl, accent: TEAL, x: 375, y: 237 },
  { label: "视频", cursor: videoCursorUrl, accent: GOLD, x: 1_285, y: 237 },
  { label: "脚本", cursor: scriptCursorUrl, accent: CORAL, x: 1_285, y: 627 },
] as const;

const camera = defineCamera({
  width: 1_920,
  height: 1_080,
  initial: { x: 960, y: 540, zoom: 1.08, rotation: 0 },
  moves: [
    {
      at: "0f",
      duration: "38f",
      to: { kind: "pose", x: 3_360, y: 1_650, zoom: 1.08, rotation: 0.18 },
      path: {
        kind: "curve",
        points: [
          { x: 1_280, y: 710 },
          { x: 2_170, y: 1_050 },
          { x: 3_030, y: 1_520 },
        ],
      },
      ease: [0.36, 0.02, 0.16, 1],
    },
    {
      at: "38f",
      duration: "4f",
      to: { kind: "pose", x: 3_245, y: 1_580, zoom: 1.14, rotation: -0.08 },
      ease: "ease-out",
    },
    {
      at: "42f",
      duration: "4f",
      to: { kind: "pose", x: 3_300, y: 1_615, zoom: 1.18, rotation: 0 },
      ease: "ease-out",
    },
    {
      at: "52f",
      duration: "18f",
      to: { kind: "pose", x: 3_300, y: 1_610, zoom: 1.38, rotation: 0 },
      ease: [0.16, 1, 0.3, 1],
    },
    {
      at: "92f",
      duration: "30f",
      to: { kind: "pose", x: 3_300, y: 600, zoom: 1.05, rotation: -0.12 },
      path: {
        kind: "curve",
        points: [
          { x: 3_410, y: 1_310 },
          { x: 3_190, y: 920 },
        ],
      },
      ease: [0.16, 1, 0.3, 1],
    },
    {
      at: "130f",
      duration: "36f",
      to: { kind: "pose", x: 3_300, y: 1_610, zoom: 1.08, rotation: 0.1 },
      path: {
        kind: "curve",
        points: [
          { x: 3_180, y: 880 },
          { x: 3_420, y: 1_280 },
        ],
      },
      ease: [0.16, 1, 0.3, 1],
    },
    {
      at: "168f",
      duration: "5f",
      to: { kind: "pose", x: 3_300, y: 1_610, zoom: 1.17, rotation: -0.16 },
      ease: "ease-out",
    },
    {
      at: "173f",
      duration: "5f",
      to: { kind: "pose", x: 3_300, y: 1_610, zoom: 1.1, rotation: 0 },
      ease: "ease-out",
    },
  ],
});

function frame(value: number): number {
  return value / DURATION_FRAMES;
}

function reviewFrames(): readonly FourierMotionTarget[] {
  const catchX = REVIEW_CATCH.x - REVIEW_START.x;
  const catchY = REVIEW_CATCH.y - REVIEW_START.y;
  const browserX = BROWSER_STYLE_X - 28 - REVIEW_START.x;
  const browserY = BROWSER_STYLE_Y - 24 - REVIEW_START.y;
  const posterX = POSTER_DROP_X - REVIEW_START.x;
  const posterY = POSTER_DROP_Y - REVIEW_START.y;

  return [
    { x: 0, y: 0, rotate: 0, scale: 1, opacity: 1, filter: "blur(0px)", offset: 0 },
    { x: 0, y: 0, rotate: 0, scale: 1, opacity: 1, filter: "blur(0px)", offset: frame(3) },
    { x: 510, y: 120, rotate: -5, scale: 1.04, opacity: 0.94, filter: "blur(9px)", offset: frame(10) },
    { x: 1_520, y: 430, rotate: 3, scale: 1.08, opacity: 0.86, filter: "blur(15px)", offset: frame(21) },
    { x: 2_630, y: 930, rotate: 8, scale: 1.1, opacity: 0.92, filter: "blur(9px)", offset: frame(34) },
    { x: catchX + 70, y: catchY + 45, rotate: -3, scale: 1.12, opacity: 1, filter: "blur(0px)", offset: frame(38) },
    { x: catchX - 34, y: catchY - 20, rotate: 1.5, scale: 0.96, opacity: 1, filter: "blur(0px)", offset: frame(42) },
    { x: catchX, y: catchY, rotate: 0, scale: 1, opacity: 1, filter: "blur(0px)", offset: frame(46) },
    { x: catchX, y: catchY, rotate: 0, scale: 1, opacity: 1, filter: "blur(0px)", offset: frame(66) },
    { x: catchX - 66, y: catchY + 4, rotate: -18, scale: 1.06, opacity: 1, filter: "blur(0px)", offset: frame(72) },
    { x: catchX + 60, y: catchY - 3, rotate: 17, scale: 1.09, opacity: 1, filter: "blur(0px)", offset: frame(78) },
    { x: catchX - 42, y: catchY + 2, rotate: -13, scale: 1.04, opacity: 1, filter: "blur(0px)", offset: frame(84) },
    { x: catchX + 22, y: catchY, rotate: 7, scale: 1.02, opacity: 1, filter: "blur(0px)", offset: frame(89) },
    { x: catchX, y: catchY, rotate: 0, scale: 1, opacity: 1, filter: "blur(0px)", offset: frame(92) },
    { x: catchX + 35, y: catchY - 350, rotate: -8, scale: 1.06, opacity: 0.96, filter: "blur(6px)", offset: frame(102) },
    { x: browserX - 42, y: browserY + 48, rotate: 7, scale: 1.08, opacity: 0.94, filter: "blur(8px)", offset: frame(117) },
    { x: browserX, y: browserY, rotate: 0, scale: 1, opacity: 1, filter: "blur(0px)", offset: frame(124) },
    { x: browserX, y: browserY, rotate: 0, scale: 0.72, opacity: 1, filter: "blur(0px)", offset: frame(130) },
    { x: browserX, y: browserY, rotate: 0, scale: 1, opacity: 1, filter: "blur(0px)", offset: frame(134) },
    { x: browserX + 56, y: browserY + 285, rotate: 6, scale: 1.06, opacity: 0.94, filter: "blur(6px)", offset: frame(143) },
    { x: posterX - 44, y: posterY - 120, rotate: -7, scale: 1.08, opacity: 0.92, filter: "blur(8px)", offset: frame(158) },
    { x: posterX, y: posterY, rotate: 0, scale: 0.74, opacity: 1, filter: "blur(0px)", offset: frame(168) },
    { x: posterX, y: posterY, rotate: 0, scale: 1, opacity: 1, filter: "blur(0px)", offset: frame(173) },
    { x: posterX - 62, y: posterY + 3, rotate: -17, scale: 1.06, opacity: 1, filter: "blur(0px)", offset: frame(180) },
    { x: posterX + 58, y: posterY - 4, rotate: 16, scale: 1.08, opacity: 1, filter: "blur(0px)", offset: frame(187) },
    { x: posterX - 38, y: posterY + 2, rotate: -11, scale: 1.04, opacity: 1, filter: "blur(0px)", offset: frame(194) },
    { x: posterX + 20, y: posterY, rotate: 6, scale: 1.02, opacity: 1, filter: "blur(0px)", offset: frame(199) },
    { x: posterX, y: posterY, rotate: 0, scale: 1, opacity: 1, filter: "blur(0px)", offset: 1 },
  ];
}

function videoKickFrames(): readonly FourierMotionTarget[] {
  return [
    { x: 0, y: 0, rotate: 0, scale: 1, offset: 0 },
    { x: 0, y: 0, rotate: 0, scale: 1, offset: frame(5) },
    { x: -34, y: 22, rotate: -14, scale: 1.12, offset: frame(10) },
    { x: 48, y: -26, rotate: 16, scale: 0.92, offset: frame(15) },
    { x: 0, y: 0, rotate: 0, scale: 1, offset: frame(20) },
    { x: 0, y: 0, rotate: 0, scale: 1, offset: 1 },
  ];
}

function reviewLabelFrames(): readonly FourierMotionTarget[] {
  return [
    { opacity: 1, y: 0, scale: 1, offset: 0 },
    { opacity: 1, y: 0, scale: 1, offset: frame(5) },
    { opacity: 0, y: 16, scale: 0.9, offset: frame(20) },
    { opacity: 0, y: 16, scale: 0.9, offset: 1 },
  ];
}

function posterDeliveryFrames(): readonly FourierMotionTarget[] {
  return [
    { x: 0, y: 0, rotate: -10, scale: 0.11, opacity: 0, filter: "blur(12px)", offset: 0 },
    { x: 0, y: 0, rotate: -10, scale: 0.11, opacity: 0, filter: "blur(12px)", offset: frame(8) },
    { x: 120, y: 110, rotate: -7, scale: 0.18, opacity: 1, filter: "blur(5px)", offset: frame(14) },
    { x: 620, y: 410, rotate: 7, scale: 0.42, opacity: 0.9, filter: "blur(12px)", offset: frame(24) },
    { x: 1_160, y: 820, rotate: -5, scale: 0.78, opacity: 0.96, filter: "blur(8px)", offset: frame(36) },
    { x: 1_370, y: 1_010, rotate: 2.5, scale: 1.06, opacity: 1, filter: "blur(0px)", offset: frame(46) },
    { x: 1_300, y: 970, rotate: -1, scale: 0.97, opacity: 1, filter: "blur(0px)", offset: frame(51) },
    { x: 1_320, y: 983, rotate: 0, scale: 1, opacity: 1, filter: "blur(0px)", offset: frame(56) },
    { x: 1_320, y: 983, rotate: 0, scale: 1, opacity: 1, filter: "blur(0px)", offset: 1 },
  ];
}

function posterOneFrames(): readonly FourierMotionTarget[] {
  return [
    { opacity: 1, scale: 1, filter: "blur(0px)", offset: 0 },
    { opacity: 1, scale: 1, filter: "blur(0px)", offset: frame(166) },
    { opacity: 0, scale: 0.985, filter: "blur(8px)", offset: frame(171) },
    { opacity: 0, scale: 0.985, filter: "blur(8px)", offset: 1 },
  ];
}

function posterTwoFrames(): readonly FourierMotionTarget[] {
  return [
    { opacity: 0, scale: 1.025, filter: "blur(8px)", offset: 0 },
    { opacity: 0, scale: 1.025, filter: "blur(8px)", offset: frame(166) },
    { opacity: 1, scale: 1.018, filter: "blur(1px)", offset: frame(171) },
    { opacity: 1, scale: 1, filter: "blur(0px)", offset: frame(177) },
    { opacity: 1, scale: 1, filter: "blur(0px)", offset: 1 },
  ];
}

function circleFrames(): readonly FourierMotionTarget[] {
  const dropX = POSTER_DROP_X - BROWSER_STYLE_X;
  const dropY = POSTER_DROP_Y - BROWSER_STYLE_Y;

  return [
    { x: 0, y: 0, scale: 1, opacity: 1, filter: "blur(0px)", offset: 0 },
    { x: 0, y: 0, scale: 1, opacity: 1, filter: "blur(0px)", offset: frame(126) },
    { x: 0, y: 0, scale: 0.78, opacity: 1, filter: "blur(0px)", offset: frame(131) },
    { x: dropX * 0.28, y: dropY * 0.27, scale: 0.92, opacity: 1, filter: "blur(3px)", offset: frame(143) },
    { x: dropX * 0.68, y: dropY * 0.66, scale: 0.96, opacity: 1, filter: "blur(5px)", offset: frame(158) },
    { x: dropX, y: dropY, scale: 0.78, opacity: 1, filter: "blur(0px)", offset: frame(168) },
    { x: dropX, y: dropY, scale: 0.38, opacity: 1, filter: "blur(0px)", offset: frame(170) },
    { x: dropX, y: dropY, scale: 7.5, opacity: 0.42, filter: "blur(4px)", offset: frame(173) },
    { x: dropX, y: dropY, scale: 9, opacity: 0, filter: "blur(8px)", offset: frame(178) },
    { x: dropX, y: dropY, scale: 9, opacity: 0, filter: "blur(8px)", offset: 1 },
  ];
}

function AgentLabel({ label }: { label: string }) {
  return (
    <div
      style={{
        position: "absolute",
        left: 28,
        top: 177,
        minWidth: 112,
        padding: "9px 18px 10px",
        borderRadius: 999,
        color: PAPER,
        background: "rgba(29,42,33,.9)",
        fontFamily: FONT,
        fontSize: 21,
        lineHeight: 1,
        fontWeight: 750,
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
  const verticalLines = Array.from({ length: 46 }, (_, index) => index * 120);
  const horizontalLines = Array.from({ length: 24 }, (_, index) => index * 120);
  return (
    <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: BACKGROUND }}>
      {verticalLines.map((left) => (
        <span key={`v-${left}`} style={{ position: "absolute", left, top: 0, width: 1, height: WORLD_HEIGHT, background: GRID, opacity: 0.48 }} />
      ))}
      {horizontalLines.map((top) => (
        <span key={`h-${top}`} style={{ position: "absolute", left: 0, top, width: WORLD_WIDTH, height: 1, background: GRID, opacity: 0.48 }} />
      ))}
    </div>
  );
}

function FourierWorldBrowser() {
  return (
    <div
      aria-label="Fourier World browser containing reusable styles"
      style={{
        position: "absolute",
        left: BROWSER_LEFT,
        top: BROWSER_TOP,
        width: BROWSER_WIDTH,
        height: BROWSER_HEIGHT,
        overflow: "hidden",
        border: MAC_WINDOW_BORDER,
        borderRadius: MAC_WINDOW_RADIUS,
        background: PAPER,
        boxShadow: MAC_WINDOW_SHADOW,
        fontFamily: FONT,
        zIndex: 20,
      }}
    >
      <MacBrowserToolbar url="fourier.video/world" height={116} accent={TEAL} />
      <div
        style={{
          position: "absolute",
          left: 54,
          right: 54,
          top: 146,
          display: "grid",
          gap: 16,
        }}
      >
        {worldStyles.map((style) => (
          <div
            key={style.handle}
            style={{
              height: 128,
              display: "flex",
              alignItems: "center",
              padding: "0 56px",
              borderRadius: 24,
              color: INK,
              background: style.selected ? "#dedbd2" : "#ebe6dc",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 104,
                height: 104,
                flex: "0 0 auto",
                borderRadius: "50%",
                background: style.selected ? "#cbc8bf" : style.swatch,
              }}
            />
            <span
              style={{
                marginLeft: 46,
                fontSize: 34,
                fontWeight: style.selected ? 760 : 650,
                letterSpacing: "-.025em",
              }}
            >
              {style.handle}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DeliveredPoster() {
  return (
    <motion.div
      animate={posterDeliveryFrames()}
      transition={{ duration: DURATION_SECONDS, ease: "linear" }}
      style={{
        position: "absolute",
        left: 1_280,
        top: 237,
        width: POSTER_WIDTH,
        height: POSTER_HEIGHT,
        overflow: "hidden",
        borderRadius: 22,
        boxShadow: "0 42px 90px rgba(5,13,8,.5)",
        transformOrigin: "42px 32px",
        willChange: "transform, opacity, filter",
        zIndex: 40,
      }}
    >
      <motion.img
        src={poster1Url}
        alt="Initial poster sent by the Video Agent"
        animate={posterOneFrames()}
        transition={{ duration: DURATION_SECONDS, ease: "linear" }}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", willChange: "transform, opacity, filter" }}
      />
      <motion.img
        src={poster2Url}
        alt="Poster revised by the Fourier World component"
        animate={posterTwoFrames()}
        transition={{ duration: DURATION_SECONDS, ease: "linear" }}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", willChange: "transform, opacity, filter" }}
      />
    </motion.div>
  );
}

function SceneNineReviewWorldLayer() {
  return (
    <FourierMotion>
      <Universe camera={camera} overscan={0.95}>
        <World
          id="review-agent-open-space"
          x={0}
          y={0}
          width={WORLD_WIDTH}
          height={WORLD_HEIGHT}
          anchor={{ x: 0, y: 0 }}
          zIndex={1}
          cull="never"
        >
          <div
            aria-label="Review Agent catches a poster, retrieves a white Fourier World component, and applies it to the image"
            style={{ position: "absolute", inset: 0, width: WORLD_WIDTH, height: WORLD_HEIGHT, overflow: "visible", pointerEvents: "none" }}
          >
            <GridField />
            <FourierWorldBrowser />

            {agents.map((agent) => (
              <motion.div
                key={agent.label}
                animate={agent.label === "视频"
                  ? videoKickFrames()
                  : [
                      { x: 0, y: 0, rotate: 0, scale: 1, offset: 0 },
                      { x: 0, y: 0, rotate: 0, scale: 1, offset: 1 },
                    ]}
                transition={{ duration: DURATION_SECONDS, ease: "linear" }}
                style={{ position: "absolute", left: agent.x, top: agent.y, width: 260, height: 236, zIndex: 12, transformOrigin: "30px 22px" }}
              >
                <img
                  src={agent.cursor}
                  alt=""
                  style={{ position: "absolute", left: 0, top: 0, width: 220, height: 174, filter: `drop-shadow(9px 13px 3px rgba(7,19,12,.38)) drop-shadow(0 0 12px ${agent.accent}55)` }}
                />
                <AgentLabel label={agent.label} />
              </motion.div>
            ))}

            <DeliveredPoster />

            <motion.div
              aria-hidden="true"
              animate={circleFrames()}
              transition={{ duration: DURATION_SECONDS, ease: "linear" }}
              style={{
                position: "absolute",
                left: BROWSER_STYLE_X - 52,
                top: BROWSER_STYLE_Y - 52,
                width: 104,
                height: 104,
                borderRadius: "50%",
                background: "#ffffff",
                boxShadow: "0 18px 44px rgba(5,13,8,.28)",
                transformOrigin: "50% 50%",
                willChange: "transform, opacity, filter",
                zIndex: 55,
              }}
            />

            <motion.div
              animate={reviewFrames()}
              transition={{ duration: DURATION_SECONDS, ease: "linear" }}
              style={{
                position: "absolute",
                left: REVIEW_START.x,
                top: REVIEW_START.y,
                width: 260,
                height: 236,
                zIndex: 80,
                transformOrigin: "30px 22px",
                willChange: "transform, opacity, filter",
              }}
            >
              <img
                src={reviewCursorUrl}
                alt=""
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  width: 220,
                  height: 174,
                  filter: `drop-shadow(9px 13px 3px rgba(7,19,12,.42)) drop-shadow(0 0 14px ${GOLD}66)`,
                }}
              />
              <motion.div animate={reviewLabelFrames()} transition={{ duration: DURATION_SECONDS, ease: "linear" }}>
                <AgentLabel label="审核" />
              </motion.div>
            </motion.div>
          </div>
        </World>
      </Universe>
    </FourierMotion>
  );
}

export default defineReact({
  name: "SceneNineReviewWorld",
  schema: {},
  component() {
    return <SceneNineReviewWorldLayer />;
  },
  designPreview() {
    return {
      props: {},
      composition: { width: 1_920, height: 1_080, durationSeconds: 7 },
      player: { background: BACKGROUND, loop: false },
    };
  },
});
