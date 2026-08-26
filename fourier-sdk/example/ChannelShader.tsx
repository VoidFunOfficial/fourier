import {
  defineFourierShader,
  defineShader,
  field,
  glsl,
} from "@fourier-video/sdk";

export const channelShader = defineFourierShader({
  name: "ChannelShader",
  uniforms: { amount: "float" },
  fragmentShader: glsl`
    in vec2 vUv;
    uniform float amount;
    out vec4 fragColor;

    void main() {
      vec4 source = texture(uFourierSource, vUv);
      fragColor = vec4(mix(source.rgb, source.bgr, amount), source.a);
    }
  `,
});

export default defineShader({
  name: "ChannelShader",
  schema: {
    amount: field.number({ min: 0, max: 1, default: 1 }),
  },
  shader: channelShader,
  uniforms: ({ props }) => ({ amount: props.amount }),
  designPreview() {
    return {
      props: {},
      subject: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3Crect width='64' height='64' fill='%23ff0000'/%3E%3C/svg%3E",
      composition: { width: 64, height: 64, durationSeconds: 1 },
    };
  },
});
