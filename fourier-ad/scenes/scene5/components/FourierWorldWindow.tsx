import {
  FourierMotion,
  defineReact,
  motion,
  useFourierContext,
  type FourierMotionTarget,
} from "@fourier-video/sdk";
import {
  MAC_WINDOW_BORDER,
  MAC_WINDOW_RADIUS,
  MAC_WINDOW_SHADOW,
  MacBrowserToolbar,
} from "./MacWindowChrome";

const FONT = "Inter, Arial, sans-serif";
const PAPER = "#f5efe2";
const INK = "#25242b";

function windowFrames(): readonly FourierMotionTarget[] {
  return [
    { opacity: 1, x: 768, y: 410, scaleX: .075, scaleY: .09, borderRadius: "82px", filter: "blur(0px)", offset: 0 },
    { opacity: 1, x: 768, y: 410, scaleX: .075, scaleY: .09, borderRadius: "82px", filter: "blur(0px)", offset: .07 },
    { opacity: 1, x: 768, y: 410, scaleX: .075, scaleY: .09, borderRadius: "82px", filter: "blur(0px)", offset: .22 },
    { opacity: 1, x: 664, y: 407, scaleX: .2, scaleY: .095, borderRadius: "72px", filter: "blur(0px)", offset: .32 },
    { opacity: 1, x: 232, y: 351, scaleX: .72, scaleY: .22, borderRadius: "58px", filter: "blur(0px)", offset: .47 },
    { opacity: 1, x: -37, y: -18, scaleX: 1.045, scaleY: 1.04, borderRadius: "26px", filter: "blur(0px)", offset: .68 },
    { opacity: 1, x: 17, y: 18, scaleX: .98, scaleY: .96, borderRadius: "31px", filter: "blur(0px)", offset: .80 },
    { opacity: 1, x: -10, y: -8, scaleX: 1.012, scaleY: 1.018, borderRadius: "27px", filter: "blur(0px)", offset: .90 },
    { opacity: 1, x: 0, y: 0, scaleX: 1, scaleY: 1, borderRadius: `${MAC_WINDOW_RADIUS}px`, filter: "blur(0px)", offset: 1 },
  ];
}

function chromeFrames(): readonly FourierMotionTarget[] {
  return [
    { opacity: 0, y: 24, filter: "blur(12px)", offset: 0 },
    { opacity: 0, y: 24, filter: "blur(12px)", offset: .5 },
    { opacity: 1, y: -7, filter: "blur(0px)", offset: .76 },
    { opacity: 1, y: 0, filter: "blur(0px)", offset: .9 },
    { opacity: 1, y: 0, filter: "blur(0px)", offset: 1 },
  ];
}

function BrowserChrome() {
  return (
    <motion.div
      animate={chromeFrames()}
      transition={{ duration: 1.85, ease: "linear" }}
      style={{ position: "absolute", inset: 0, fontFamily: FONT }}
    >
      <MacBrowserToolbar url="fourier.video/world" />
      <div style={{ position: "absolute", left: 36, right: 36, top: 142, color: INK, textAlign: "center" }}>
        <div style={{ fontSize: 64, fontWeight: 650, lineHeight: 1, letterSpacing: "-.055em" }}>Fourier World</div>
      </div>
    </motion.div>
  );
}

function FourierWorldWindow() {
  const { width, height } = useFourierContext();
  return (
    <FourierMotion>
      <div style={{ position: "relative", width, height, overflow: "visible", pointerEvents: "none" }}>
        <motion.div
          aria-label="A cursor drags a white panel into a Mac-style Fourier World browser"
          animate={windowFrames()}
          transition={{ duration: 1.85, ease: "linear" }}
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
            transformOrigin: "0% 0%",
            willChange: "transform, opacity, filter, border-radius",
          }}
        >
          <BrowserChrome />
        </motion.div>
      </div>
    </FourierMotion>
  );
}

export default defineReact({
  name: "SceneFiveFourierWorldWindow",
  schema: {},
  component() {
    return <FourierWorldWindow />;
  },
  designPreview() {
    return {
      props: {},
      composition: { width: 1920, height: 1080, durationSeconds: 5 },
      player: { background: "#565473", loop: true },
    };
  },
});
