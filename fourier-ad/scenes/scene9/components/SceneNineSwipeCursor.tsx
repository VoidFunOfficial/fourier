import {
  FourierMotion,
  defineReact,
  motion,
  type FourierMotionTarget,
} from "@fourier-video/sdk";
import reviewCursorUrl from "../assets/cursor-review.svg";
import {
  SCENE_NINE_MONTAGE_DURATION_SECONDS,
  SCENE_NINE_POSTER_CUT_SECONDS,
} from "./sceneNineTiming.ts";

const GOLD = "#c3a15c";
const CURSOR_WIDTH = 190;
const CURSOR_HEIGHT = 150;
const START_X = 1_350;
const START_Y = 780;

function swipeFrames(): readonly FourierMotionTarget[] {
  const duration = SCENE_NINE_MONTAGE_DURATION_SECONDS;
  const frames: FourierMotionTarget[] = [
    { x: START_X, y: START_Y, rotate: 0, scale: 1, opacity: 1, filter: "blur(0px)", offset: 0 },
    { x: START_X - 36, y: START_Y + 2, rotate: -13, scale: 1.05, opacity: 1, filter: "blur(0px)", offset: 0.045 },
    { x: START_X + 34, y: START_Y - 2, rotate: 12, scale: 1.06, opacity: 1, filter: "blur(0px)", offset: 0.085 },
    { x: START_X, y: START_Y, rotate: 0, scale: 1, opacity: 1, filter: "blur(0px)", offset: 0.115 },
  ];

  for (let index = 1; index < SCENE_NINE_POSTER_CUT_SECONDS.length; index += 1) {
    const cut = SCENE_NINE_POSTER_CUT_SECONDS[index]!;
    const previousCut = SCENE_NINE_POSTER_CUT_SECONDS[index - 1]!;
    const interval = cut - previousCut;
    const direction = index % 2 === 1 ? -1 : 1;
    const targetX = direction < 0 ? 430 : 1_470;
    const lead = Math.max(
      index === 1 ? 0.43 : previousCut + 0.018,
      cut - Math.min(0.14, interval * 0.52),
    );
    frames.push(
      {
        x: direction < 0 ? 1_455 : 445,
        y: START_Y + direction * 42,
        rotate: -direction * 5,
        scale: 1.04,
        opacity: 1,
        filter: "blur(0px)",
        offset: lead / duration,
      },
      {
        x: targetX,
        y: START_Y - direction * 54,
        rotate: direction * 15,
        scale: 1.12,
        opacity: 0.94,
        filter: `blur(${Math.min(13, 5 + index)}px)`,
        offset: cut / duration,
      },
    );
  }

  frames.push(
    { x: 430, y: START_Y + 54, rotate: 0, scale: 1, opacity: 1, filter: "blur(0px)", offset: 0.72 },
    { x: 430, y: START_Y + 54, rotate: 0, scale: 0.9, opacity: 0, filter: "blur(5px)", offset: 0.82 },
    { x: 430, y: START_Y + 54, rotate: 0, scale: 0.9, opacity: 0, filter: "blur(5px)", offset: 1 },
  );
  return frames;
}

function SceneNineSwipeCursorLayer() {
  return (
    <FourierMotion>
      <div
        aria-label="Review Agent swipes through poster variations at an accelerating pace"
        style={{ position: "relative", width: 1_920, height: 1_080, overflow: "hidden", pointerEvents: "none" }}
      >
        <motion.img
          src={reviewCursorUrl}
          alt=""
          animate={swipeFrames()}
          transition={{ duration: SCENE_NINE_MONTAGE_DURATION_SECONDS, ease: "linear" }}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: CURSOR_WIDTH,
            height: CURSOR_HEIGHT,
            transformOrigin: "27px 21px",
            filter: `drop-shadow(9px 13px 3px rgba(7,19,12,.42)) drop-shadow(0 0 14px ${GOLD}66)`,
            willChange: "transform, opacity, filter",
          }}
        />
      </div>
    </FourierMotion>
  );
}

export default defineReact({
  name: "SceneNineSwipeCursor",
  schema: {},
  component() {
    return <SceneNineSwipeCursorLayer />;
  },
  designPreview() {
    return {
      props: {},
      composition: { width: 1_920, height: 1_080, durationSeconds: 4 },
      player: { background: "#17221b", loop: false },
    };
  },
});
