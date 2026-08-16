import {
  FourierMotion,
  defineReact,
  motion,
  useFourierContext,
  type FourierMotionTarget,
} from "@fourier-video/sdk";
import cursorUrl from "../assets/cursor-search.svg";

const PREVIEW_DURATION_SECONDS = 8;

function cursorFrames(): readonly FourierMotionTarget[] {
  return [
    { x: 1710, y: 930, scale: 1, rotate: -3, opacity: 0, filter: "blur(0px)", offset: 0 },
    { x: 1710, y: 930, scale: 1, rotate: -3, opacity: 0, filter: "blur(0px)", offset: 0.018 },
    { x: 1710, y: 930, scale: 1, rotate: -3, opacity: 1, filter: "blur(0px)", offset: 0.032 },
    { x: 780, y: 250, scale: 1.06, rotate: 3, opacity: 0.86, filter: "blur(12px)", offset: 0.07 },
    { x: 600, y: 276, scale: 0.96, rotate: -1, opacity: 1, filter: "blur(0px)", offset: 0.086 },
    { x: 618, y: 290, scale: 1.015, rotate: 0, opacity: 1, filter: "blur(0px)", offset: 0.094 },
    { x: 612, y: 285, scale: 1, rotate: 0, opacity: 1, filter: "blur(0px)", offset: 0.102 },
    { x: 612, y: 285, scale: 0.72, rotate: 0, opacity: 1, filter: "blur(0px)", offset: 0.11 },
    { x: 612, y: 285, scale: 1, rotate: 0, opacity: 1, filter: "blur(0px)", offset: 0.123 },
    { x: 612, y: 285, scale: 1, rotate: 0, opacity: 1, filter: "blur(0px)", offset: 0.205 },
    { x: 1390, y: 276, scale: 1.08, rotate: -2, opacity: 0.88, filter: "blur(9px)", offset: 0.224 },
    { x: 1425, y: 285, scale: 0.98, rotate: 0, opacity: 1, filter: "blur(0px)", offset: 0.232 },
    { x: 1425, y: 285, scale: 0.72, rotate: 0, opacity: 1, filter: "blur(0px)", offset: 0.24 },
    { x: 1425, y: 285, scale: 1.03, rotate: 0, opacity: 1, filter: "blur(0px)", offset: 0.253 },
    { x: 1425, y: 285, scale: 1, rotate: 0, opacity: 1, filter: "blur(0px)", offset: 0.27 },
    { x: 690, y: 545, scale: 1.08, rotate: -3, opacity: 0.84, filter: "blur(10px)", offset: 0.335 },
    { x: 600, y: 552, scale: 1, rotate: 0, opacity: 1, filter: "blur(0px)", offset: 0.347 },
    { x: 600, y: 552, scale: 0.7, rotate: 0, opacity: 1, filter: "blur(0px)", offset: 0.355 },
    { x: 600, y: 552, scale: 1, rotate: 0, opacity: 1, filter: "blur(0px)", offset: 0.37 },
    { x: 1080, y: 548, scale: 1.08, rotate: 2, opacity: 0.86, filter: "blur(8px)", offset: 0.388 },
    { x: 1150, y: 552, scale: 1, rotate: 0, opacity: 1, filter: "blur(0px)", offset: 0.397 },
    { x: 1150, y: 552, scale: 0.7, rotate: 0, opacity: 1, filter: "blur(0px)", offset: 0.405 },
    { x: 1150, y: 552, scale: 1, rotate: 0, opacity: 1, filter: "blur(0px)", offset: 0.42 },
    { x: 1640, y: 545, scale: 1.08, rotate: -2, opacity: 0.84, filter: "blur(9px)", offset: 0.438 },
    { x: 1700, y: 552, scale: 1, rotate: 0, opacity: 1, filter: "blur(0px)", offset: 0.447 },
    { x: 1700, y: 552, scale: 0.7, rotate: 0, opacity: 1, filter: "blur(0px)", offset: 0.455 },
    { x: 1700, y: 552, scale: 1, rotate: 0, opacity: 1, filter: "blur(0px)", offset: 0.47 },
    { x: 1260, y: 420, scale: 1.12, rotate: -7, opacity: 0.83, filter: "blur(14px)", offset: 0.505 },
    { x: 1010, y: 430, scale: 0.96, rotate: 2, opacity: 1, filter: "blur(0px)", offset: 0.525 },
    { x: 1010, y: 430, scale: 1.02, rotate: -0.5, opacity: 1, filter: "blur(0px)", offset: 0.54 },
    { x: 1010, y: 430, scale: 0.86, rotate: 0, opacity: 0, filter: "blur(3px)", offset: 0.62 },
    { x: 1010, y: 430, scale: 0.86, rotate: 0, opacity: 0, filter: "blur(3px)", offset: 1 },
  ];
}

function ClickRing({ x, y, at, color = "#4eaaa3" }: { x: number; y: number; at: number; color?: string }) {
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
      transition={{ ease: [0.2, 0.84, 0.2, 1] }}
      style={{
        position: "absolute",
        left: x - 39,
        top: y - 39,
        width: 78,
        height: 78,
        borderRadius: "50%",
        border: `4px solid ${color}`,
        boxShadow: `0 0 22px ${color}88`,
      }}
    />
  );
}

function SceneSixCursorLayer() {
  const { width, height } = useFourierContext();
  return (
    <FourierMotion>
      <div style={{ position: "relative", width, height, overflow: "hidden", pointerEvents: "none" }}>
        <ClickRing x={640} y={310} at={0.108} />
        <ClickRing x={1455} y={310} at={0.236} color="#25242b" />
        <ClickRing x={630} y={578} at={0.351} color="#b78c3d" />
        <ClickRing x={1180} y={578} at={0.401} color="#b8617b" />
        <ClickRing x={1730} y={578} at={0.451} color="#4eaaa3" />
        <motion.img
          src={cursorUrl}
          alt=""
          animate={cursorFrames()}
          transition={{ ease: "linear" }}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: 92,
            height: 92,
            transformOrigin: "28px 22px",
            filter: "drop-shadow(7px 10px 3px rgba(37,36,43,.28)) drop-shadow(0 0 12px rgba(78,170,163,.34))",
            willChange: "transform, opacity, filter",
          }}
        />
      </div>
    </FourierMotion>
  );
}

export default defineReact({
  name: "SceneSixCursor",
  schema: {},
  component() {
    return <SceneSixCursorLayer />;
  },
  designPreview() {
    return {
      props: {},
      composition: { width: 1920, height: 1080, durationSeconds: PREVIEW_DURATION_SECONDS },
      player: { background: "#4b4965", loop: true },
    };
  },
});
