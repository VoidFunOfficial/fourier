import {
  FourierMotion,
  defineReact,
  motion,
  useFourierContext,
} from "@fourier-video/sdk";
import mailDraftUrl from "../assets/mail-draft.svg";
import mailReadyUrl from "../assets/mail-ready.svg";

const PREVIEW_DURATION_SECONDS = 3;
const FONT = "Inter, Arial, sans-serif";
const PAPER = "#f5efe2";
const INK = "#25242b";
const MUTED = "#716e70";
const TEAL = "#4eaaa3";

function SceneSixMailMorphLayer() {
  const { width, height } = useFourierContext();
  return (
    <FourierMotion>
      <div
        aria-label="A spinning draft mail blurs out before a ready-to-send mail appears"
        style={{ position: "relative", width, height, overflow: "hidden", pointerEvents: "none" }}
      >
        <motion.div
          aria-hidden="true"
          animate={[
            { opacity: 0, offset: 0 },
            { opacity: 0, offset: 0.06 },
            { opacity: 1, offset: 0.17 },
            { opacity: 1, offset: 1 },
          ]}
          transition={{ ease: [0.2, 0.8, 0.2, 1] }}
          style={{ position: "absolute", inset: 0, background: INK }}
        />

        <motion.div
          animate={[
            { opacity: 0, x: 0, y: 88, scale: 0.05, scaleX: 0.32, scaleY: 1.5, rotate: -15, filter: "blur(18px)", offset: 0 },
            { opacity: 1, x: -44, y: -20, scale: 1.12, scaleX: 0.93, scaleY: 1.07, rotate: 4.8, filter: "blur(0px)", offset: 0.14 },
            { opacity: 1, x: 14, y: 7, scale: 0.98, scaleX: 1.018, scaleY: 0.982, rotate: -1.25, filter: "blur(0px)", offset: 0.22 },
            { opacity: 1, x: 0, y: 0, scale: 1, scaleX: 1, scaleY: 1, rotate: 0, filter: "blur(0px)", offset: 0.29 },
            { opacity: 1, x: 0, y: 0, scale: 1, scaleX: 1, scaleY: 1, rotate: 0, filter: "blur(0px)", offset: 0.4 },
            { opacity: 1, x: 0, y: 0, scale: 1.055, scaleX: 1.1, scaleY: 0.9, rotate: -0.7, filter: "blur(0px)", offset: 0.47 },
            { opacity: 1, x: -16, y: -7, scale: 0.985, scaleX: 0.975, scaleY: 1.025, rotate: 0.5, filter: "blur(0px)", offset: 0.56 },
            { opacity: 1, x: 7, y: 3, scale: 1.008, scaleX: 1.008, scaleY: 0.992, rotate: -0.15, filter: "blur(0px)", offset: 0.65 },
            { opacity: 1, x: 0, y: 0, scale: 1, scaleX: 1, scaleY: 1, rotate: 0, filter: "blur(0px)", offset: 0.72 },
            { opacity: 1, x: 0, y: 0, scale: 1, scaleX: 1, scaleY: 1, rotate: 0, filter: "blur(0px)", offset: 1 },
          ]}
          transition={{ ease: [0.16, 1, 0.3, 1] }}
          style={{
            position: "absolute",
            left: width / 2 - 265,
            top: height / 2 - 265,
            width: 530,
            height: 530,
            overflow: "hidden",
            borderRadius: 70,
            color: INK,
            background: PAPER,
            border: `3px solid ${INK}`,
            boxShadow: "0 52px 110px rgba(0,0,0,.42),0 0 0 12px rgba(245,239,226,.16)",
            transformOrigin: "50% 50%",
            willChange: "transform, opacity, filter",
          }}
        >
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              left: 34,
              top: 34,
              padding: "8px 13px",
              border: `1px solid ${INK}`,
              borderRadius: 999,
              color: MUTED,
              fontFamily: FONT,
              fontSize: 12,
              fontWeight: 850,
              letterSpacing: ".15em",
            }}
          >
            FOURIER MAIL
          </div>

          <motion.img
            src={mailDraftUrl}
            alt=""
            animate={[
              { opacity: 1, scale: 1, rotate: 0, filter: "blur(0px)", offset: 0 },
              { opacity: 1, scale: 1, rotate: 0, filter: "blur(0px)", offset: 0.31 },
              { opacity: 1, scale: 1.09, rotate: 58, filter: "blur(7px)", offset: 0.36 },
              { opacity: 0.65, scale: 1.16, rotate: 128, filter: "blur(16px)", offset: 0.4 },
              { opacity: 0, scale: 0.7, rotate: 205, filter: "blur(28px)", offset: 0.46 },
              { opacity: 0, scale: 0.7, rotate: 205, filter: "blur(28px)", offset: 1 },
            ]}
            transition={{ ease: [0.55, 0, 0.25, 1] }}
            style={{
              position: "absolute",
              left: 85,
              top: 78,
              width: 360,
              height: 360,
              transformOrigin: "50% 50%",
              filter: "drop-shadow(0 22px 28px rgba(37,36,43,.2))",
            }}
          />

          <motion.img
            src={mailReadyUrl}
            alt=""
            animate={[
              { opacity: 0, scale: 0.66, rotate: -105, filter: "blur(26px)", offset: 0 },
              { opacity: 0, scale: 0.66, rotate: -105, filter: "blur(26px)", offset: 0.48 },
              { opacity: 0.08, scale: 0.7, rotate: -92, filter: "blur(24px)", offset: 0.5 },
              { opacity: 1, scale: 1.14, rotate: 8, filter: "blur(2px)", offset: 0.59 },
              { opacity: 1, scale: 0.96, rotate: -2, filter: "blur(0px)", offset: 0.65 },
              { opacity: 1, scale: 1.025, rotate: 0.5, filter: "blur(0px)", offset: 0.69 },
              { opacity: 1, scale: 1, rotate: 0, filter: "blur(0px)", offset: 0.73 },
              { opacity: 1, scale: 1, rotate: 0, filter: "blur(0px)", offset: 1 },
            ]}
            transition={{ ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: "absolute",
              left: 85,
              top: 78,
              width: 360,
              height: 360,
              transformOrigin: "50% 50%",
              filter: "drop-shadow(0 22px 28px rgba(37,36,43,.2))",
            }}
          />

          <motion.div
            animate={[
              { opacity: 0, y: 14, offset: 0 },
              { opacity: 0, y: 14, offset: 0.61 },
              { opacity: 1, y: -3, offset: 0.69 },
              { opacity: 1, y: 0, offset: 0.74 },
              { opacity: 1, y: 0, offset: 1 },
            ]}
            transition={{ ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 35,
              color: TEAL,
              textAlign: "center",
              fontFamily: FONT,
              fontSize: 21,
              fontWeight: 920,
              letterSpacing: ".16em",
            }}
          >
            READY TO SEND
          </motion.div>
        </motion.div>
      </div>
    </FourierMotion>
  );
}

export default defineReact({
  name: "SceneSixMailMorph",
  schema: {},
  component() {
    return <SceneSixMailMorphLayer />;
  },
  designPreview() {
    return {
      props: {},
      composition: { width: 1920, height: 1080, durationSeconds: PREVIEW_DURATION_SECONDS },
      player: { background: INK, loop: true },
    };
  },
});
