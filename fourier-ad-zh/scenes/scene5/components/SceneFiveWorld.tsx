import {
  FourierMotion,
  defineReact,
  motion,
  type FourierMotionTarget,
} from "@fourier-video/sdk";
import { Universe, World, defineCamera } from "@fourier-video/sdk/universe";
import resizeCursorUrl from "../assets/cursor-resize-diagonal.svg";
import reviewCursorUrl from "../assets/cursor-review.svg";
import scriptCursorUrl from "../assets/cursor-script.svg";
import searchCursorUrl from "../assets/cursor-search.svg";
import videoCursorUrl from "../assets/cursor-video.svg";

const PREVIEW_DURATION_SECONDS = 8;
const WORLD_WIDTH = 1920;
const WORLD_HEIGHT = 1080;
const CURSOR_START = { x: 375, y: 237 } as const;
const BROWSER_CENTER = { x: 3050, y: 860 } as const;
const FONT = "Inter, Arial, sans-serif";

const leftBehindAgents = [
  { label: "视频", cursor: videoCursorUrl, accent: "#9c90d4", x: 1285, y: 237 },
  { label: "审核", cursor: reviewCursorUrl, accent: "#e2bd76", x: 375, y: 627 },
  { label: "脚本", cursor: scriptCursorUrl, accent: "#d98da3", x: 1285, y: 627 },
] as const;

const camera = defineCamera({
  width: WORLD_WIDTH,
  height: WORLD_HEIGHT,
  initial: { x: 960, y: 540, zoom: 1.08, rotation: 0 },
  moves: [
    {
      at: "0f",
      duration: "38f",
      to: { kind: "pose", x: 3140, y: 905, zoom: 1.12 },
      path: {
        kind: "curve",
        points: [
          { x: 1180, y: 250 },
          { x: 2050, y: 330 },
          { x: 2820, y: 720 },
        ],
      },
      ease: [0.36, 0.02, 0.16, 1],
    },
    {
      at: "38f",
      duration: "4f",
      to: { kind: "pose", x: 3020, y: 845, zoom: 1.04 },
      ease: "ease-out",
    },
    {
      at: "42f",
      duration: "4f",
      to: { kind: "pose", x: 3050, y: 860, zoom: 1.06 },
      ease: "ease-out",
    },
  ],
});

function cursorFrames(): readonly FourierMotionTarget[] {
  const overshootX = 3140 - CURSOR_START.x;
  const overshootY = 905 - CURSOR_START.y;
  const reboundX = 3020 - CURSOR_START.x;
  const reboundY = 845 - CURSOR_START.y;
  const targetX = BROWSER_CENTER.x - CURSOR_START.x;
  const targetY = BROWSER_CENTER.y - CURSOR_START.y;
  return [
    { x: 0, y: 0, scale: 1, rotate: 0, filter: "blur(0px)", opacity: 1, offset: 0, easing: "cubic-bezier(.36,.02,.16,1)" },
    { x: 420, y: -60, scale: 1.05, rotate: -5, filter: "blur(9px)", opacity: .86, offset: .035 },
    { x: 1240, y: 70, scale: 1.08, rotate: 3, filter: "blur(16px)", opacity: .76, offset: .065 },
    { x: 2150, y: 390, scale: 1.08, rotate: 7, filter: "blur(12px)", opacity: .82, offset: .106 },
    { x: overshootX, y: overshootY, scale: 1.12, rotate: -2, filter: "blur(0px)", opacity: 1, offset: .152, easing: "ease-out" },
    { x: reboundX, y: reboundY, scale: .96, rotate: 1.4, filter: "blur(0px)", opacity: 1, offset: .17, easing: "ease-out" },
    { x: targetX, y: targetY, scale: 1, rotate: 0, filter: "blur(0px)", opacity: 1, offset: .188 },
    { x: targetX, y: targetY, scale: 1, rotate: 0, filter: "blur(0px)", opacity: 1, offset: .193 },
    { x: targetX, y: targetY, scale: .72, rotate: 0, filter: "blur(0px)", opacity: 1, offset: .205 },
    { x: targetX, y: targetY, scale: 1, rotate: 0, filter: "blur(0px)", opacity: 1, offset: .222 },
    { x: targetX, y: targetY, scale: 1, rotate: 0, filter: "blur(0px)", opacity: 1, offset: .235 },
    { x: targetX, y: targetY, scale: .72, rotate: 0, filter: "blur(0px)", opacity: 1, offset: .249 },
    { x: targetX, y: targetY, scale: 1, rotate: 0, filter: "blur(0px)", opacity: 1, offset: .269 },
    { x: targetX, y: targetY, scale: 1, rotate: 0, filter: "blur(0px)", opacity: 1, offset: .285, easing: "ease-out" },
    { x: targetX + 59, y: targetY + 39, scale: .78, rotate: 2, filter: "blur(2px)", opacity: 1, offset: .305 },
    { x: targetX + 59, y: targetY + 39, scale: .72, rotate: 2, filter: "blur(0px)", opacity: 0, offset: .315 },
    { x: targetX + 59, y: targetY + 39, scale: .72, rotate: 2, filter: "blur(0px)", opacity: 0, offset: 1 },
  ];
}

function resizeCursorFrames(): readonly FourierMotionTarget[] {
  return [
    { opacity: 0, x: 59, y: 39, scale: .9, filter: "blur(0px)", offset: 0 },
    { opacity: 0, x: 59, y: 39, scale: .9, filter: "blur(0px)", offset: .31 },
    { opacity: 1, x: 59, y: 39, scale: 1, filter: "blur(0px)", offset: .316 },
    { opacity: 1, x: 59, y: 39, scale: .76, filter: "blur(0px)", offset: .326 },
    { opacity: 1, x: 157, y: 40, scale: .9, filter: "blur(2px)", offset: .343 },
    { opacity: .82, x: 563, y: 93, scale: .94, filter: "blur(8px)", offset: .378 },
    { opacity: .9, x: 819, y: 442, scale: 1.03, filter: "blur(5px)", offset: .431 },
    { opacity: 1, x: 768, y: 408, scale: .96, filter: "blur(0px)", offset: .46 },
    { opacity: 1, x: 792, y: 432, scale: 1.01, filter: "blur(0px)", offset: .48 },
    { opacity: 1, x: 783, y: 425, scale: 1, filter: "blur(0px)", offset: .502 },
    { opacity: 1, x: 783, y: 425, scale: 1, filter: "blur(0px)", offset: .519 },
    { opacity: 0, x: 783, y: 425, scale: .88, filter: "blur(3px)", offset: .554 },
    { opacity: 0, x: 783, y: 425, scale: .88, filter: "blur(3px)", offset: 1 },
  ];
}

function ClickRing({ second = false }: { second?: boolean }) {
  const start = second ? .245 : .2;
  return (
    <motion.div
      aria-hidden="true"
      animate={[
        { opacity: 0, scale: .3, offset: 0 },
        { opacity: 0, scale: .3, offset: start },
        { opacity: .95, scale: .48, offset: start + .008 },
        { opacity: 0, scale: 1.65, offset: start + .032 },
        { opacity: 0, scale: 1.65, offset: 1 },
      ]}
      transition={{ ease: [0.2, .84, .2, 1] }}
      style={{
        position: "absolute",
        left: BROWSER_CENTER.x - 56,
        top: BROWSER_CENTER.y - 56,
        width: 112,
        height: 112,
        borderRadius: "50%",
        border: "5px solid rgba(216,242,239,.88)",
        boxShadow: "0 0 26px rgba(120,200,193,.52)",
        zIndex: 18,
      }}
    />
  );
}

function SceneFiveLayer() {
  return (
    <FourierMotion>
      <Universe camera={camera} overscan={.8}>
        <World id="scene-five-space" x={0} y={0} width={4400} height={1900} anchor={{ x: 0, y: 0 }} zIndex={1} cull="never">
          <div
            aria-label="Search Agent opens Fourier World in a Mac-style browser"
            style={{ position: "absolute", inset: 0, width: 4400, height: 1900, overflow: "visible", pointerEvents: "none" }}
          >
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                left: 2480,
                top: 330,
                width: 1200,
                height: 980,
                borderRadius: "50%",
                background: "radial-gradient(circle, rgba(130,116,255,.16), transparent 68%)",
                filter: "blur(45px)",
              }}
            />

            <ClickRing />
            <ClickRing second />

            {leftBehindAgents.map((agent) => (
              <div key={agent.label} aria-label={`${agent.label} Agent left behind as Search moves away`}>
                <img
                  src={agent.cursor}
                  alt=""
                  style={{
                    position: "absolute",
                    left: agent.x,
                    top: agent.y,
                    width: 220,
                    height: 174,
                    zIndex: 24,
                    transformOrigin: "30px 22px",
                    filter: `drop-shadow(9px 13px 3px rgba(28,25,48,.34)) drop-shadow(0 0 14px ${agent.accent}55)`,
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: agent.x + 26,
                    top: agent.y + 177,
                    minWidth: 112,
                    padding: "9px 18px 10px",
                    borderRadius: 999,
                    color: "#fff7f1",
                    background: "rgba(42,39,67,.76)",
                    border: "1px solid rgba(235,232,255,.2)",
                    boxShadow: "0 8px 18px rgba(27,24,46,.24)",
                    fontFamily: FONT,
                    fontSize: 21,
                    lineHeight: 1,
                    fontWeight: 650,
                    letterSpacing: ".01em",
                    textAlign: "center",
                    whiteSpace: "nowrap",
                    zIndex: 24,
                  }}
                >
                  {agent.label}
                </div>
              </div>
            ))}

            <motion.div
              animate={[
                { opacity: 1, scale: 1, filter: "blur(0px)", offset: 0 },
                { opacity: 1, scale: 1, filter: "blur(0px)", offset: .04 },
                { opacity: 0, scale: .92, filter: "blur(8px)", offset: .1 },
                { opacity: 0, scale: .92, filter: "blur(8px)", offset: 1 },
              ]}
              transition={{ ease: "ease-out" }}
              style={{
                position: "absolute",
                left: CURSOR_START.x + 25,
                top: CURSOR_START.y + 178,
                padding: "9px 18px 10px",
                borderRadius: 999,
                color: "#fff7f1",
                background: "rgba(42,39,67,.76)",
                border: "1px solid rgba(235,232,255,.2)",
                fontFamily: FONT,
                fontSize: 21,
                fontWeight: 650,
                zIndex: 28,
              }}
            >
              搜索
            </motion.div>

            <motion.img
              src={searchCursorUrl}
              alt=""
              animate={cursorFrames()}
              transition={{ ease: "linear" }}
              style={{
                position: "absolute",
                left: CURSOR_START.x,
                top: CURSOR_START.y,
                width: 220,
                height: 174,
                zIndex: 30,
                transformOrigin: "30px 22px",
                filter: "drop-shadow(9px 13px 3px rgba(28,25,48,.34)) drop-shadow(0 0 14px rgba(120,200,193,.34))",
                willChange: "transform, opacity, filter",
              }}
            />

            <motion.img
              src={resizeCursorUrl}
              alt=""
              animate={resizeCursorFrames()}
              transition={{ ease: "linear" }}
              style={{
                position: "absolute",
                left: BROWSER_CENTER.x - 46,
                top: BROWSER_CENTER.y - 46,
                width: 92,
                height: 92,
                zIndex: 31,
                transformOrigin: "46px 46px",
                filter: "drop-shadow(0 5px 4px rgba(31,25,61,.35)) drop-shadow(0 0 14px rgba(120,200,193,.5))",
                willChange: "transform, opacity, filter",
              }}
            />
          </div>
        </World>
      </Universe>
    </FourierMotion>
  );
}

export default defineReact({
  name: "SceneFiveWorld",
  schema: {},
  component() {
    return <SceneFiveLayer />;
  },
  designPreview() {
    return {
      props: {},
      composition: { width: 1920, height: 1080, durationSeconds: PREVIEW_DURATION_SECONDS },
      player: { background: "#23212d", loop: true },
    };
  },
});
