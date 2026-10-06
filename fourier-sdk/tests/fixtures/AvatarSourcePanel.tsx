import { defineReact, defineSchema } from "@fourier-video/sdk/avatar";
import { VoidAvatar } from "../../example/voidavatar/index.ts";

export default defineReact({
  name: "AvatarSourcePanel",
  schema: defineSchema({}),
  component() {
    return <VoidAvatar mode="source" position={[480, 270]} scale={.32} />;
  },
  designPreview() {
    return { props: {}, composition: { width: 960, height: 540, durationSeconds: 12 }, seed: 7 };
  },
});
