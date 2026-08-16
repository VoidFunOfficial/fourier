import {
  FourierMotion,
  defineReact,
  motion,
  useFourierContext,
  type FourierMotionTarget,
} from "@fourier-video/sdk";
import arrowCursorUrl from "../assets/cursor-search.svg";
import textCursorUrl from "../assets/textcursor.svg";
import {
  MAC_WINDOW_BORDER,
  MAC_WINDOW_RADIUS,
  MAC_WINDOW_SHADOW,
  MacBrowserToolbar,
} from "./MacWindowChrome";

const PREVIEW_DURATION_SECONDS = 8;
const QUERY = "Motion effects for AI projects";
const FONT = "Inter, Arial, sans-serif";
const PAPER = "#f5efe2";
const PAPER_LIGHT = "#fffaf0";
const INK = "#25242b";
const MUTED = "#716e70";
const TEAL = "#4eaaa3";

const INPUT_CURSOR_START_X = 382;
const INPUT_CURSOR_END_X = 805;
const INPUT_CURSOR_Y = 292;
const SEARCH_CURSOR_X = 1480;
const SEARCH_CURSOR_Y = 292;

/** One linear clock for cursor, typing, camera, results, selection, and checks. */
export const SCENE_SIX_TIMING = Object.freeze({
  cameraMoveStart: 0.073,
  inputClick: 0.142,
  typingStart: 0.16,
  typingEnd: 0.302,
  actionCursorReveal: 0.318,
  searchClick: 0.375,
  loadingStart: 0.385,
  resultsReveal: 0.43,
  resultRevealStagger: 0.018,
  selectionStart: 0.55,
  selectionStagger: 0.05,
  flingStart: 0.7,
  flingStagger: 0.038,
} as const);

const SMOOTH_SEGMENT_EASING = "cubic-bezier(0.16, 1, 0.3, 1)";

export function cameraTrackFrames(): readonly FourierMotionTarget[] {
  return [
    { x: 0, y: 0, scale: 1.02, rotate: 0, offset: 0 },
    { x: 0, y: 0, scale: 1.02, rotate: 0, easing: SMOOTH_SEGMENT_EASING, offset: SCENE_SIX_TIMING.cameraMoveStart },
    { x: 118, y: 86, scale: 1.09, rotate: 0.12, offset: SCENE_SIX_TIMING.inputClick },
    { x: 118, y: 86, scale: 1.09, rotate: 0.12, offset: SCENE_SIX_TIMING.typingStart },
    { x: 28, y: 88, scale: 1.1, rotate: -0.12, offset: SCENE_SIX_TIMING.typingEnd },
    { x: 28, y: 88, scale: 1.1, rotate: -0.12, easing: SMOOTH_SEGMENT_EASING, offset: SCENE_SIX_TIMING.actionCursorReveal },
    { x: -96, y: 76, scale: 1.08, rotate: 0.08, offset: SCENE_SIX_TIMING.searchClick },
    { x: -96, y: 76, scale: 1.08, rotate: 0.08, easing: SMOOTH_SEGMENT_EASING, offset: SCENE_SIX_TIMING.searchClick + 0.02 },
    { x: 0, y: 0, scale: 1.02, rotate: 0, offset: SCENE_SIX_TIMING.resultsReveal },
    { x: 0, y: 0, scale: 1.02, rotate: 0, offset: 1 },
  ];
}

function BrowserChrome() {
  return (
    <div style={{ position: "absolute", inset: 0, fontFamily: FONT }}>
      <MacBrowserToolbar url="fourier.video/world" accent={TEAL} />
      <motion.div
        animate={[
          { opacity: 1, y: 0, filter: "blur(0px)", offset: 0 },
          { opacity: 1, y: 0, filter: "blur(0px)", offset: 0.035 },
          { opacity: 0, y: -16, filter: "blur(6px)", offset: 0.085 },
          { opacity: 0, y: -16, filter: "blur(6px)", offset: 1 },
        ]}
        transition={{ ease: [0.16, 1, 0.3, 1] }}
        style={{ position: "absolute", left: 36, right: 36, top: 142, color: INK, textAlign: "center" }}
      >
        <div style={{ fontSize: 64, fontWeight: 650, lineHeight: 1, letterSpacing: "-.055em" }}>Fourier World</div>
      </motion.div>
    </div>
  );
}

export function characterFrames(index: number): readonly FourierMotionTarget[] {
  const start = SCENE_SIX_TIMING.typingStart +
    index / Math.max(1, QUERY.length) *
      (SCENE_SIX_TIMING.typingEnd - SCENE_SIX_TIMING.typingStart);
  const visible = Math.min(SCENE_SIX_TIMING.typingEnd, start + 0.004);
  return [
    { opacity: 0, y: 3, offset: 0 },
    { opacity: 0, y: 3, offset: start },
    { opacity: 1, y: -1, offset: visible },
    { opacity: 1, y: 0, offset: Math.min(SCENE_SIX_TIMING.typingEnd, visible + 0.004) },
    { opacity: 1, y: 0, offset: 1 },
  ];
}

function firstArrowFrames(): readonly FourierMotionTarget[] {
  return [
    { x: 1710, y: 930, opacity: 0, rotate: 4, scale: 0.92, filter: "blur(0px)", offset: 0 },
    { x: 1710, y: 930, opacity: 0, rotate: 4, scale: 0.92, filter: "blur(0px)", offset: 0.055 },
    { x: 1710, y: 930, opacity: 1, rotate: 4, scale: 1, filter: "blur(0px)", offset: 0.07 },
    { x: 920, y: 480, opacity: 0.86, rotate: -7, scale: 1.05, filter: "blur(12px)", offset: 0.095 },
    { x: INPUT_CURSOR_START_X - 18, y: INPUT_CURSOR_Y + 12, opacity: 1, rotate: -2, scale: 1.06, filter: "blur(0px)", offset: 0.12 },
    { x: INPUT_CURSOR_START_X + 7, y: INPUT_CURSOR_Y - 3, opacity: 1, rotate: 1, scale: 0.94, filter: "blur(0px)", offset: 0.132 },
    { x: INPUT_CURSOR_START_X, y: INPUT_CURSOR_Y, opacity: 1, rotate: 0, scale: 0.72, filter: "blur(0px)", offset: SCENE_SIX_TIMING.inputClick },
    { x: INPUT_CURSOR_START_X, y: INPUT_CURSOR_Y, opacity: 0, rotate: 0, scale: 1, filter: "blur(0px)", offset: 0.157 },
    { x: INPUT_CURSOR_START_X, y: INPUT_CURSOR_Y, opacity: 0, rotate: 0, scale: 1, filter: "blur(0px)", offset: 1 },
  ];
}

function textCursorFrames(): readonly FourierMotionTarget[] {
  return [
    { x: INPUT_CURSOR_START_X - 8, y: INPUT_CURSOR_Y - 12, opacity: 0, offset: 0 },
    { x: INPUT_CURSOR_START_X - 8, y: INPUT_CURSOR_Y - 12, opacity: 0, offset: SCENE_SIX_TIMING.typingStart - 0.008 },
    { x: INPUT_CURSOR_START_X - 8, y: INPUT_CURSOR_Y - 12, opacity: 1, offset: SCENE_SIX_TIMING.typingStart },
    { x: INPUT_CURSOR_END_X, y: INPUT_CURSOR_Y - 12, opacity: 1, offset: SCENE_SIX_TIMING.typingEnd },
    { x: INPUT_CURSOR_END_X, y: INPUT_CURSOR_Y - 12, opacity: 0, offset: 0.315 },
    { x: INPUT_CURSOR_END_X, y: INPUT_CURSOR_Y - 12, opacity: 0, offset: 1 },
  ];
}

function actionArrowFrames(): readonly FourierMotionTarget[] {
  return [
    { x: INPUT_CURSOR_END_X + 18, y: INPUT_CURSOR_Y, opacity: 0, rotate: 0, scale: 0.94, filter: "blur(0px)", offset: 0 },
    { x: INPUT_CURSOR_END_X + 18, y: INPUT_CURSOR_Y, opacity: 0, rotate: 0, scale: 0.94, filter: "blur(0px)", offset: SCENE_SIX_TIMING.actionCursorReveal - 0.012 },
    { x: INPUT_CURSOR_END_X + 18, y: INPUT_CURSOR_Y, opacity: 1, rotate: 0, scale: 1, filter: "blur(0px)", offset: SCENE_SIX_TIMING.actionCursorReveal },
    { x: SEARCH_CURSOR_X + 22, y: SEARCH_CURSOR_Y - 10, opacity: 0.88, rotate: -5, scale: 1.08, filter: "blur(8px)", offset: 0.35 },
    { x: SEARCH_CURSOR_X - 7, y: SEARCH_CURSOR_Y + 4, opacity: 1, rotate: 1, scale: 0.94, filter: "blur(0px)", offset: 0.363 },
    { x: SEARCH_CURSOR_X, y: SEARCH_CURSOR_Y, opacity: 1, rotate: 0, scale: 0.72, filter: "blur(0px)", offset: SCENE_SIX_TIMING.searchClick },
    { x: SEARCH_CURSOR_X, y: SEARCH_CURSOR_Y, opacity: 1, rotate: 0, scale: 1, filter: "blur(0px)", offset: 0.395 },
    { x: 430, y: 610, opacity: 0.86, rotate: -5, scale: 1.08, filter: "blur(10px)", offset: 0.535 },
    { x: 410, y: 610, opacity: 1, rotate: 0, scale: 0.72, filter: "blur(0px)", offset: SCENE_SIX_TIMING.selectionStart },
    { x: 410, y: 610, opacity: 1, rotate: 0, scale: 1, filter: "blur(0px)", offset: 0.565 },
    { x: 980, y: 610, opacity: 0.86, rotate: 3, scale: 1.08, filter: "blur(8px)", offset: 0.59 },
    { x: 960, y: 610, opacity: 1, rotate: 0, scale: 0.72, filter: "blur(0px)", offset: SCENE_SIX_TIMING.selectionStart + SCENE_SIX_TIMING.selectionStagger },
    { x: 960, y: 610, opacity: 1, rotate: 0, scale: 1, filter: "blur(0px)", offset: 0.615 },
    { x: 1530, y: 610, opacity: 0.84, rotate: -3, scale: 1.08, filter: "blur(9px)", offset: 0.64 },
    { x: 1510, y: 610, opacity: 1, rotate: 0, scale: 0.72, filter: "blur(0px)", offset: SCENE_SIX_TIMING.selectionStart + SCENE_SIX_TIMING.selectionStagger * 2 },
    { x: 1510, y: 610, opacity: 1, rotate: 0, scale: 1, filter: "blur(0px)", offset: 0.67 },
    { x: 1510, y: 610, opacity: 0, rotate: 0, scale: 0.86, filter: "blur(3px)", offset: 0.7 },
    { x: 1510, y: 610, opacity: 0, rotate: 0, scale: 0.86, filter: "blur(3px)", offset: 1 },
  ];
}

function ClickRing({ x, y, at, color = TEAL }: { x: number; y: number; at: number; color?: string }) {
  return (
    <motion.div
      aria-hidden="true"
      animate={[
        { opacity: 0, scale: 0.3, offset: 0 },
        { opacity: 0, scale: 0.3, offset: at },
        { opacity: 0.9, scale: 0.5, offset: at + 0.006 },
        { opacity: 0, scale: 1.8, offset: at + 0.035 },
        { opacity: 0, scale: 1.8, offset: 1 },
      ]}
      transition={{ ease: "linear" }}
      style={{
        position: "absolute",
        left: x - 39,
        top: y - 39,
        width: 78,
        height: 78,
        borderRadius: "50%",
        border: `4px solid ${color}`,
        boxShadow: `0 0 22px ${color}66`,
        zIndex: 205,
      }}
    />
  );
}

const cards = [
  {
    name: "HandWritingMotion",
    description: "Organic ink with a human rhythm.",
    accent: "#b78c3d",
    left: 40,
  },
  {
    name: "OutlineDraw",
    description: "Trace any silhouette into focus.",
    accent: "#b8617b",
    left: 590,
  },
  {
    name: "Left2RightGlow",
    description: "Sweep intelligent light across an idea.",
    accent: TEAL,
    left: 1140,
  },
] as const;

export function sceneSixResultTiming(index: number): Readonly<{
  reveal: number;
  selectedAt: number;
  flingAt: number;
}> {
  const safeIndex = Math.min(cards.length - 1, Math.max(0, Math.floor(index)));
  return Object.freeze({
    reveal: SCENE_SIX_TIMING.resultsReveal +
      safeIndex * SCENE_SIX_TIMING.resultRevealStagger,
    selectedAt: SCENE_SIX_TIMING.selectionStart +
      safeIndex * SCENE_SIX_TIMING.selectionStagger,
    flingAt: SCENE_SIX_TIMING.flingStart +
      safeIndex * SCENE_SIX_TIMING.flingStagger,
  });
}

function SearchResultCard({
  name,
  description,
  accent,
  left,
  index,
}: (typeof cards)[number] & { index: number }) {
  const { reveal, selectedAt, flingAt } = sceneSixResultTiming(index);
  const direction = index === 0 ? 1 : index === 2 ? -1 : 0;
  const targetX = direction * 550;

  return (
    <motion.div
      animate={[
        { opacity: 0, x: 0, y: 46, scale: 0.94, rotate: direction * -2, boxShadow: "0 0 0 0 rgba(37,36,43,0)", offset: 0 },
        { opacity: 0, x: 0, y: 46, scale: 0.94, rotate: direction * -2, boxShadow: "0 0 0 0 rgba(37,36,43,0)", offset: reveal },
        { opacity: 1, x: 0, y: -9, scale: 1.018, rotate: direction * 0.25, boxShadow: "0 0 0 0 rgba(37,36,43,0)", offset: reveal + 0.035 },
        { opacity: 1, x: 0, y: 3, scale: 0.994, rotate: 0, boxShadow: "0 0 0 0 rgba(37,36,43,0)", offset: reveal + 0.052 },
        { opacity: 1, x: 0, y: 0, scale: 1, rotate: 0, boxShadow: "0 0 0 0 rgba(37,36,43,0)", offset: selectedAt },
        { opacity: 1, x: 0, y: 0, scale: 0.96, rotate: 0, boxShadow: "0 0 0 6px rgba(37,36,43,.16)", offset: selectedAt + 0.01 },
        { opacity: 1, x: 0, y: 0, scale: 1.018, rotate: direction * -0.35, boxShadow: "0 0 0 4px rgba(37,36,43,.12)", offset: selectedAt + 0.027 },
        { opacity: 1, x: 0, y: 0, scale: 1, rotate: 0, boxShadow: "0 0 0 0 rgba(37,36,43,0)", offset: flingAt },
        { opacity: 1, x: direction * -34, y: 28, scale: 1.055, rotate: direction * -4, boxShadow: "0 0 0 0 rgba(37,36,43,0)", offset: flingAt + 0.015 },
        { opacity: 0.9, x: targetX * 1.06, y: -168, scale: 0.58, rotate: direction * 7, boxShadow: "0 0 0 0 rgba(37,36,43,0)", offset: flingAt + 0.07 },
        { opacity: 0, x: targetX, y: -150, scale: 0.05, rotate: 0, boxShadow: "0 0 0 0 rgba(37,36,43,0)", offset: flingAt + 0.105 },
        { opacity: 0, x: targetX, y: -150, scale: 0.05, rotate: 0, boxShadow: "0 0 0 0 rgba(37,36,43,0)", offset: 1 },
      ]}
      transition={{ ease: "linear" }}
      style={{
        position: "absolute",
        left,
        top: 178,
        width: 480,
        height: 540,
        overflow: "hidden",
        color: INK,
        background: PAPER_LIGHT,
        border: `2px solid ${INK}`,
        fontFamily: FONT,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 26,
          right: 26,
          top: 24,
          display: "flex",
          alignItems: "center",
          gap: 12,
          paddingBottom: 18,
          borderBottom: `1px solid ${INK}`,
        }}
      >
        <span style={{ width: 10, height: 10, flex: "0 0 auto", borderRadius: "50%", background: accent }} />
        <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: ".15em", textTransform: "uppercase" }}>{name}</span>
      </div>
      <div style={{ position: "absolute", left: 26, right: 26, bottom: 24, color: MUTED, fontSize: 15, lineHeight: 1.45 }}>
        {description}
      </div>
      <motion.div
        animate={[
          { opacity: 0, scale: 0.3, rotate: -30, offset: 0 },
          { opacity: 0, scale: 0.3, rotate: -30, offset: selectedAt },
          { opacity: 1, scale: 1.2, rotate: 7, offset: selectedAt + 0.018 },
          { opacity: 1, scale: 1, rotate: 0, offset: selectedAt + 0.04 },
          { opacity: 1, scale: 1, rotate: 0, offset: flingAt },
          { opacity: 0, scale: 0.5, rotate: 18, offset: flingAt + 0.08 },
          { opacity: 0, scale: 0.5, rotate: 18, offset: 1 },
        ]}
        transition={{ ease: "linear" }}
        style={{
          position: "absolute",
          right: 22,
          top: 14,
          width: 38,
          height: 38,
          display: "grid",
          placeItems: "center",
          borderRadius: "50%",
          color: PAPER_LIGHT,
          background: INK,
          fontSize: 20,
          fontWeight: 950,
        }}
      >
        ✓
      </motion.div>
    </motion.div>
  );
}

function SearchInterface() {
  return (
    <motion.div
      animate={[
        { opacity: 0, offset: 0 },
        { opacity: 0, offset: 0.045 },
        { opacity: 1, offset: 0.075 },
        { opacity: 1, offset: 1 },
      ]}
      transition={{ ease: "linear" }}
      style={{
        position: "absolute",
        left: 0,
        top: 142,
        width: 1660,
        height: 758,
        overflow: "hidden",
        color: INK,
        background: PAPER,
      }}
    >
      <motion.div
        animate={[
          { opacity: 0, y: -34, scale: 0.95, offset: 0 },
          { opacity: 0, y: -34, scale: 0.95, offset: 0.045 },
          { opacity: 1, y: 8, scale: 1.01, offset: 0.075 },
          { opacity: 1, y: -3, scale: 0.997, offset: 0.09 },
          { opacity: 1, y: 0, scale: 1, offset: 0.105 },
          { opacity: 1, y: 0, scale: 1, offset: 1 },
        ]}
        transition={{ ease: "linear" }}
        style={{
          position: "absolute",
          left: 170,
          top: 34,
          width: 1320,
          height: 84,
          display: "flex",
          alignItems: "center",
          gap: 18,
          padding: "0 28px",
          borderRadius: 20,
          background: PAPER_LIGHT,
          border: `2px solid ${TEAL}`,
          boxShadow: "0 16px 38px rgba(37,36,43,.12)",
          fontFamily: FONT,
        }}
      >
        <div style={{ color: TEAL, fontSize: 32, lineHeight: 1 }}>⌕</div>
        <div style={{ position: "relative", display: "flex", width: 970, overflow: "hidden", fontSize: 25, fontWeight: 720, letterSpacing: ".004em" }}>
          <motion.span
            animate={[
              { opacity: 0, offset: 0 },
              { opacity: 0, offset: 0.085 },
              { opacity: 0.62, offset: 0.105 },
              { opacity: 0.62, offset: 0.145 },
              { opacity: 0, offset: 0.16 },
              { opacity: 0, offset: 1 },
            ]}
            transition={{ ease: "linear" }}
            style={{ position: "absolute", color: MUTED, fontWeight: 500, whiteSpace: "nowrap" }}
          >
            Search Fourier World
          </motion.span>
          {Array.from(QUERY, (character, index) => (
            <motion.span
              key={`${index}:${character}`}
              animate={characterFrames(index)}
              transition={{ ease: "linear" }}
              style={{ display: "inline-block", whiteSpace: "pre", willChange: "transform, opacity" }}
            >
              {character === " " ? "\u00a0" : character}
            </motion.span>
          ))}
        </div>
        <motion.div
          animate={[
            { scale: 1, y: 0, backgroundColor: INK, offset: 0 },
            { scale: 1, y: 0, backgroundColor: INK, offset: SCENE_SIX_TIMING.searchClick - 0.025 },
            { scale: 0.91, y: 2, backgroundColor: "#151419", offset: SCENE_SIX_TIMING.searchClick },
            { scale: 1.04, y: -2, backgroundColor: INK, offset: SCENE_SIX_TIMING.searchClick + 0.017 },
            { scale: 1, y: 0, backgroundColor: INK, offset: SCENE_SIX_TIMING.searchClick + 0.035 },
            { scale: 1, y: 0, backgroundColor: INK, offset: 1 },
          ]}
          transition={{ ease: "linear" }}
          style={{
            marginLeft: "auto",
            width: 170,
            height: 58,
            display: "grid",
            placeItems: "center",
            borderRadius: 14,
            color: PAPER_LIGHT,
            fontSize: 16,
            fontWeight: 900,
            letterSpacing: ".08em",
          }}
        >
          SEARCH
        </motion.div>
      </motion.div>

      <motion.div
        animate={[
          { opacity: 0, y: 20, offset: 0 },
          { opacity: 0, y: 20, offset: SCENE_SIX_TIMING.resultsReveal - 0.025 },
          { opacity: 1, y: -4, offset: SCENE_SIX_TIMING.resultsReveal },
          { opacity: 1, y: 0, offset: SCENE_SIX_TIMING.resultsReveal + 0.015 },
          { opacity: 1, y: 0, offset: 1 },
        ]}
        transition={{ ease: "linear" }}
        style={{ position: "absolute", left: 40, top: 128, fontFamily: FONT }}
      >
        <div style={{ fontSize: 24, fontWeight: 900 }}>3 motion components found</div>
      </motion.div>

      {cards.map((card, index) => <SearchResultCard key={card.name} {...card} index={index} />)}

      <motion.div
        aria-label="Loading search results"
        animate={[
          { opacity: 0, scale: 0.6, rotate: 0, offset: 0 },
          { opacity: 0, scale: 0.6, rotate: 0, offset: SCENE_SIX_TIMING.loadingStart },
          { opacity: 1, scale: 1, rotate: 120, offset: SCENE_SIX_TIMING.loadingStart + 0.015 },
          { opacity: 0, scale: 0.7, rotate: 330, offset: SCENE_SIX_TIMING.resultsReveal - 0.005 },
          { opacity: 0, scale: 0.7, rotate: 330, offset: 1 },
        ]}
        transition={{ ease: "linear" }}
        style={{
          position: "absolute",
          left: 812,
          top: 136,
          width: 36,
          height: 36,
          borderRadius: "50%",
          border: "4px solid rgba(78,170,163,.24)",
          borderTopColor: TEAL,
        }}
      />
    </motion.div>
  );
}

function SceneSixBrowserOverlayLayer() {
  const { width, height } = useFourierContext();
  return (
    <FourierMotion>
      <div style={{ position: "relative", width, height, overflow: "hidden", pointerEvents: "none" }}>
        <motion.div
          animate={cameraTrackFrames()}
          transition={{ ease: "linear" }}
          style={{ position: "absolute", inset: 0, width, height, transformOrigin: "50% 50%" }}
        >
          <div
            aria-label="A camera follows the cursor as it searches for AI project motion effects"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible", pointerEvents: "none" }}
          >
            <div
              style={{
                position: "absolute",
                left: width / 2 - 830,
                top: height / 2 - 450,
                width: 1660,
                height: 900,
                overflow: "hidden",
                color: INK,
                background: PAPER,
                border: MAC_WINDOW_BORDER,
                borderRadius: MAC_WINDOW_RADIUS,
                boxShadow: MAC_WINDOW_SHADOW,
              }}
            >
              <BrowserChrome />
              <SearchInterface />
            </div>

            <ClickRing x={INPUT_CURSOR_START_X} y={INPUT_CURSOR_Y} at={SCENE_SIX_TIMING.inputClick} />
            <ClickRing x={SEARCH_CURSOR_X} y={SEARCH_CURSOR_Y} at={SCENE_SIX_TIMING.searchClick} color={INK} />
            <ClickRing x={410} y={610} at={SCENE_SIX_TIMING.selectionStart} color="#b78c3d" />
            <ClickRing x={960} y={610} at={SCENE_SIX_TIMING.selectionStart + SCENE_SIX_TIMING.selectionStagger} color="#b8617b" />
            <ClickRing x={1510} y={610} at={SCENE_SIX_TIMING.selectionStart + SCENE_SIX_TIMING.selectionStagger * 2} color={TEAL} />

            <motion.img
              src={arrowCursorUrl}
              alt=""
              animate={firstArrowFrames()}
              transition={{ ease: "linear" }}
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: 92,
                height: 92,
                zIndex: 210,
                transformOrigin: "28px 22px",
                filter: "drop-shadow(7px 10px 3px rgba(37,36,43,.28))",
                willChange: "transform, opacity, filter",
              }}
            />
            <motion.img
              src={textCursorUrl}
              alt=""
              animate={textCursorFrames()}
              transition={{ ease: "linear" }}
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: 52,
                height: 52,
                zIndex: 210,
                transformOrigin: "50% 50%",
                filter: "drop-shadow(0 2px 5px rgba(0,0,0,.45))",
                willChange: "transform, opacity",
              }}
            />
            <motion.img
              src={arrowCursorUrl}
              alt=""
              animate={actionArrowFrames()}
              transition={{ ease: "linear" }}
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: 92,
                height: 92,
                zIndex: 210,
                transformOrigin: "28px 22px",
                filter: "drop-shadow(7px 10px 3px rgba(37,36,43,.28))",
                willChange: "transform, opacity, filter",
              }}
            />
          </div>
        </motion.div>
      </div>
    </FourierMotion>
  );
}

export default defineReact({
  name: "SceneSixBrowserOverlay",
  schema: {},
  component() {
    return <SceneSixBrowserOverlayLayer />;
  },
  designPreview() {
    return {
      props: {},
      composition: { width: 1920, height: 1080, durationSeconds: PREVIEW_DURATION_SECONDS },
      player: { background: "#4b4a54", loop: true },
    };
  },
});
