import { defineReact } from "@fourier-video/sdk/react";
import { FourierMotion, motion } from "@fourier-video/sdk/motion";

export default defineReact({
  name: "InvalidMotionOffsets",
  schema: {},
  component() {
    return (
      <FourierMotion>
        <motion.div animate={[
          { opacity: 0, offset: 0.7 },
          { opacity: 1, offset: 0.2 },
        ]} />
      </FourierMotion>
    );
  },
  designPreview() {
    return {
      props: {},
      composition: { width: 64, height: 64, durationSeconds: 1 },
    };
  },
});
