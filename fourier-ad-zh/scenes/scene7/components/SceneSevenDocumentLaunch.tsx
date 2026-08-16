import {
  FourierMotion,
  defineReact,
  motion,
  useFourierContext,
  type FourierMotionTarget,
} from "@fourier-video/sdk";
import docsUrl from "../assets/docs.svg";
import scriptCursorUrl from "../assets/cursor-script.svg";

const PREVIEW_DURATION_SECONDS = 3;
const INK = "#28241f";
const PAPER = "#f2eadb";
const ACCENT = "#d96843";

export function documentSeedFrames(): readonly FourierMotionTarget[] {
  return [
    { opacity: 0, scaleX: 1, scaleY: 1, rotate: 0, filter: "blur(4px)", offset: 0 },
    { opacity: 0, scaleX: 1, scaleY: 1, rotate: 0, filter: "blur(4px)", offset: 0.12 },
    { opacity: 1, scaleX: 1.08, scaleY: 0.82, rotate: 0, filter: "blur(0px)", offset: 0.2 },
    { opacity: 1, scaleX: 0.72, scaleY: 1.18, rotate: -1.5, filter: "blur(0px)", offset: 0.3 },
    { opacity: 0.2, scaleX: 0.34, scaleY: 1.42, rotate: 2, filter: "blur(5px)", offset: 0.39 },
    { opacity: 0, scaleX: 0.2, scaleY: 1.5, rotate: 2, filter: "blur(7px)", offset: 0.45 },
    { opacity: 0, scaleX: 0.2, scaleY: 1.5, rotate: 2, filter: "blur(7px)", offset: 1 },
  ];
}

export function documentIconMorphFrames(): readonly FourierMotionTarget[] {
  return [
    { opacity: 0, scaleX: 1.65, scaleY: 0.32, scale: 0.5, rotate: -2, filter: "blur(8px)", offset: 0 },
    { opacity: 0, scaleX: 1.65, scaleY: 0.32, scale: 0.5, rotate: -2, filter: "blur(8px)", offset: 0.28 },
    { opacity: 0.4, scaleX: 1.28, scaleY: 0.58, scale: 0.72, rotate: 2, filter: "blur(5px)", offset: 0.35 },
    { opacity: 1, scaleX: 0.9, scaleY: 1.1, scale: 1.08, rotate: -1, filter: "blur(0px)", offset: 0.44 },
    { opacity: 1, scaleX: 1.03, scaleY: 0.97, scale: 0.98, rotate: 0.4, filter: "blur(0px)", offset: 0.5 },
    { opacity: 1, scaleX: 1, scaleY: 1, scale: 1, rotate: 0, filter: "blur(0px)", offset: 0.56 },
    { opacity: 1, scaleX: 1, scaleY: 1, scale: 1, rotate: 0, filter: "blur(0px)", offset: 1 },
  ];
}

export function documentLaunchFrames(): readonly FourierMotionTarget[] {
  return [
    { x: 0, y: 0, scaleX: 1, scaleY: 1, rotate: 0, opacity: 1, filter: "blur(0px)", offset: 0 },
    { x: 0, y: 0, scaleX: 1, scaleY: 1, rotate: 0, opacity: 1, filter: "blur(0px)", offset: 0.66 },
    { x: 0, y: 18, scaleX: 1.08, scaleY: 0.92, rotate: 1.5, opacity: 1, filter: "blur(0px)", offset: 0.7 },
    { x: 0, y: -8, scaleX: 1.18, scaleY: 0.78, rotate: -2, opacity: 1, filter: "blur(0px)", offset: 0.73 },
    { x: 12, y: -220, scaleX: 0.9, scaleY: 1.18, rotate: -8, opacity: 1, filter: "blur(2px)", offset: 0.79 },
    { x: -22, y: -760, scaleX: 0.78, scaleY: 1.08, rotate: -24, opacity: 0.94, filter: "blur(7px)", offset: 0.91 },
    { x: 18, y: -1260, scaleX: 0.62, scaleY: 0.92, rotate: -42, opacity: 0, filter: "blur(12px)", offset: 1 },
  ];
}

export function scriptCursorHitFrames(): readonly FourierMotionTarget[] {
  return [
    { x: 900, y: 1160, rotate: -10, scale: 0.8, opacity: 0, filter: "blur(0px)", offset: 0 },
    { x: 900, y: 1160, rotate: -10, scale: 0.8, opacity: 0, filter: "blur(0px)", offset: 0.52 },
    { x: 890, y: 980, rotate: -14, scale: 1, opacity: 1, filter: "blur(0px)", easing: "cubic-bezier(.16,1,.3,1)", offset: 0.58 },
    { x: 870, y: 1030, rotate: -18, scale: 1.1, opacity: 1, filter: "blur(0px)", offset: 0.64 },
    { x: 930, y: 626, rotate: 8, scale: 1.22, opacity: 1, filter: "blur(2px)", easing: "cubic-bezier(.7,0,.84,0)", offset: 0.73 },
    { x: 892, y: 790, rotate: -12, scale: 0.98, opacity: 1, filter: "blur(0px)", offset: 0.79 },
    { x: 880, y: 900, rotate: -16, scale: 0.82, opacity: 0, filter: "blur(4px)", offset: 0.87 },
    { x: 880, y: 900, rotate: -16, scale: 0.82, opacity: 0, filter: "blur(4px)", offset: 1 },
  ];
}

function impactFrames(): readonly FourierMotionTarget[] {
  return [
    { opacity: 0, scale: 0.2, rotate: 0, offset: 0 },
    { opacity: 0, scale: 0.2, rotate: 0, offset: 0.725 },
    { opacity: 1, scale: 0.48, rotate: 0, offset: 0.73 },
    { opacity: 0, scale: 1.85, rotate: 18, offset: 0.79 },
    { opacity: 0, scale: 1.85, rotate: 18, offset: 1 },
  ];
}

function SceneSevenDocumentLaunchLayer() {
  const { width, height } = useFourierContext();
  const iconSize = 190;
  return (
    <FourierMotion>
      <div
        aria-label="The document compresses into a file icon and the Script cursor strikes it upward"
        style={{ position: "relative", width, height, overflow: "hidden", pointerEvents: "none" }}
      >
        <motion.div
          animate={documentSeedFrames()}
          transition={{ duration: PREVIEW_DURATION_SECONDS, ease: "linear", fill: "both" }}
          style={{
            position: "absolute",
            left: width / 2 - 150,
            top: height / 2 - 35,
            width: 300,
            height: 70,
            borderRadius: 18,
            background: PAPER,
            border: `2px solid ${INK}`,
            boxShadow: "0 18px 38px rgba(17,14,11,.34)",
            transformOrigin: "50% 50%",
          }}
        />

        <motion.div
          animate={documentLaunchFrames()}
          transition={{ duration: PREVIEW_DURATION_SECONDS, ease: "linear", fill: "both" }}
          style={{ position: "absolute", inset: 0, transformOrigin: "50% 50%", willChange: "transform, opacity, filter" }}
        >
          <motion.img
            src={docsUrl}
            alt=""
            animate={documentIconMorphFrames()}
            transition={{ duration: PREVIEW_DURATION_SECONDS, ease: "linear", fill: "both" }}
            style={{
              position: "absolute",
              left: width / 2 - iconSize / 2,
              top: height / 2 - iconSize / 2,
              width: iconSize,
              height: iconSize,
              filter: "drop-shadow(0 22px 28px rgba(17,14,11,.4))",
              transformOrigin: "50% 50%",
              willChange: "transform, opacity, filter",
            }}
          />
        </motion.div>

        <motion.div
          aria-hidden="true"
          animate={impactFrames()}
          transition={{ duration: PREVIEW_DURATION_SECONDS, ease: "linear", fill: "both" }}
          style={{
            position: "absolute",
            left: width / 2 - 50,
            top: height / 2 + 38,
            width: 100,
            height: 100,
            borderRadius: "50%",
            border: `7px solid ${ACCENT}`,
            boxShadow: "0 0 28px rgba(217,104,67,.62)",
            zIndex: 8,
          }}
        />

        <motion.img
          src={scriptCursorUrl}
          alt=""
          animate={scriptCursorHitFrames()}
          transition={{ duration: PREVIEW_DURATION_SECONDS, ease: "linear", fill: "both" }}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: 150,
            height: 118,
            zIndex: 10,
            transformOrigin: "30px 24px",
            filter: "drop-shadow(8px 12px 5px rgba(17,14,11,.38))",
            willChange: "transform, opacity, filter",
          }}
        />
      </div>
    </FourierMotion>
  );
}

export default defineReact({
  name: "SceneSevenDocumentLaunch",
  schema: {},
  component() {
    return <SceneSevenDocumentLaunchLayer />;
  },
  designPreview() {
    return {
      props: {},
      composition: { width: 1920, height: 1080, durationSeconds: PREVIEW_DURATION_SECONDS },
      player: { background: "#302c28", loop: true },
    };
  },
});
