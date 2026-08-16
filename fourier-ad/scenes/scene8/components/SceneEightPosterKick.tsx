import {
  FourierMotion,
  defineReact,
  motion,
  useFourierContext,
  type FourierMotionTarget,
} from "@fourier-video/sdk";
import videoCursorUrl from "../assets/cursor-video.svg";

const DURATION_SECONDS = 1.2;
const PAPER = "#f6f0e4";
const GOLD = "#b79a52";
const FRAME_WIDTH = 1382;
const FRAME_HEIGHT = 778;

export function posterFrameKickFrames(): readonly FourierMotionTarget[] {
  return [
    { x: 0, y: 0, scaleX: 1, scaleY: 1, rotate: 0, opacity: 1, filter: "blur(0px)", offset: 0 },
    { x: 0, y: 0, scaleX: 1, scaleY: 1, rotate: 0, opacity: 1, filter: "blur(0px)", offset: 0.17 },
    { x: 14, y: -8, scaleX: 1.02, scaleY: 1.02, rotate: 0.3, opacity: 1, filter: "blur(0px)", offset: 0.22 },
    { x: -18, y: 20, scaleX: 0.9, scaleY: 0.9, rotate: -2, opacity: 1, filter: "blur(0px)", offset: 0.28 },
    { x: -210, y: 180, scaleX: 1.05, scaleY: 1.05, rotate: -8, opacity: 1, filter: "blur(1px)", offset: 0.44 },
    { x: -850, y: 720, scaleX: 0.75, scaleY: 0.75, rotate: -25, opacity: 0.92, filter: "blur(5px)", offset: 0.72 },
    { x: -1520, y: 1320, scaleX: 0.42, scaleY: 0.42, rotate: -45, opacity: 0, filter: "blur(10px)", offset: 1 },
  ];
}

export function videoCursorKickFrames(): readonly FourierMotionTarget[] {
  return [
    { x: 1600, y: 70, rotate: 4, scale: 0.82, opacity: 0, filter: "blur(0px)", offset: 0 },
    { x: 1600, y: 70, rotate: 4, scale: 0.82, opacity: 0, filter: "blur(0px)", offset: 0.02 },
    { x: 1540, y: 128, rotate: -6, scale: 1, opacity: 1, filter: "blur(0px)", offset: 0.08 },
    { x: 1608, y: 66, rotate: 8, scale: 1.08, opacity: 1, filter: "blur(0px)", offset: 0.14 },
    { x: 1370, y: 292, rotate: -18, scale: 1.16, opacity: 1, filter: "blur(2px)", offset: 0.22 },
    { x: 1248, y: 404, rotate: -26, scale: 1.3, opacity: 1, filter: "blur(1px)", offset: 0.28 },
    { x: 1378, y: 278, rotate: -8, scale: 0.92, opacity: 1, filter: "blur(0px)", offset: 0.38 },
    { x: 1434, y: 224, rotate: -2, scale: 0.78, opacity: 0, filter: "blur(4px)", offset: 0.52 },
    { x: 1434, y: 224, rotate: -2, scale: 0.78, opacity: 0, filter: "blur(4px)", offset: 1 },
  ];
}

function SceneEightPosterKickLayer() {
  const { width, height } = useFourierContext();
  return (
    <FourierMotion>
      <div
        aria-label="Video cursor strikes the completed poster diagonally toward the lower left"
        style={{ position: "relative", width, height, overflow: "hidden", pointerEvents: "none" }}
      >
        <motion.div
          animate={posterFrameKickFrames()}
          transition={{ duration: DURATION_SECONDS, ease: "linear", fill: "both" }}
          style={{
            position: "absolute",
            left: width / 2 - FRAME_WIDTH / 2,
            top: height / 2 - FRAME_HEIGHT / 2,
            width: FRAME_WIDTH,
            height: FRAME_HEIGHT,
            borderRadius: 24,
            border: `3px solid ${PAPER}`,
            boxShadow: "0 34px 0 rgba(7,19,12,.22), 0 60px 120px rgba(7,19,12,.46)",
            transformOrigin: "50% 50%",
            willChange: "transform, opacity, filter",
            zIndex: 2,
          }}
        />

        <motion.img
          src={videoCursorUrl}
          alt=""
          animate={videoCursorKickFrames()}
          transition={{ duration: DURATION_SECONDS, ease: "linear", fill: "both" }}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: 190,
            height: 150,
            transformOrigin: "28px 22px",
            filter: `drop-shadow(9px 13px 3px rgba(7,19,12,.42)) drop-shadow(0 0 12px ${GOLD}66)`,
            willChange: "transform, opacity, filter",
            zIndex: 10,
          }}
        />
      </div>
    </FourierMotion>
  );
}

export default defineReact({
  name: "SceneEightPosterKick",
  schema: {},
  component() {
    return <SceneEightPosterKickLayer />;
  },
  designPreview() {
    return {
      props: {},
      composition: { width: 1920, height: 1080, durationSeconds: DURATION_SECONDS },
      player: { background: "#17281f", loop: true },
    };
  },
});
