import {
  FourierShaderCanvas,
  defineFourierShader,
  defineReact,
  defineSchema,
  field,
  glsl,
  useFourierContext,
  type FourierShaderVec3,
  type InferFields,
} from "@fourier-video/sdk";

export const AURORA_FLUX_DURATION_SECONDS = 8;
export const AURORA_FLUX_REFERENCE_SEED = 14.7;
export const AURORA_FLUX_FLOW_SPEED = 0.22;

export const AURORA_FLUX_PALETTE: readonly [
  FourierShaderVec3,
  FourierShaderVec3,
  FourierShaderVec3,
] = Object.freeze([
  [0.08, 0.88, 0.58],
  [0.18, 0.48, 1],
  [0.55, 0.25, 0.95],
]);

export const auroraFluxSchema = defineSchema({
  flowSpeed: field.number({
    min: 0.05,
    max: 0.85,
    default: AURORA_FLUX_FLOW_SPEED,
    label: "流动速度",
    description: "参考网页静止状态使用 0.22。",
  }),
  seed: field.number({
    min: 0,
    max: 100,
    default: AURORA_FLUX_REFERENCE_SEED,
    label: "噪声种子",
    description: "参考网页 AURORA 卡片是第二张卡片，对应种子 14.7。",
  }),
  glassBlur: field.number({
    min: 0,
    max: 80,
    default: 28,
    label: "毛玻璃模糊",
    description: "毛玻璃对下方 WebGL 色场的模糊半径，单位为像素。",
  }),
  glassOpacity: field.number({
    min: 0,
    max: 0.5,
    default: 0.1,
    label: "毛玻璃白膜",
    description: "覆盖在极光之上的半透明白色膜浓度。",
  }),
});

export type AuroraFluxProps = InferFields<typeof auroraFluxSchema>;

/**
 * Direct WebGL2 port of the supplied page's WebGL1 fragment shader.
 * Only gl_FragColor and host uniform names change for the Fourier runtime.
 */
export const AURORA_FLUX_FRAGMENT_SHADER = glsl`
  out vec4 fragColor;

  uniform float uFlowSpeed;
  uniform float uReferenceSeed;
  uniform float uHover;
  uniform vec3 uC1;
  uniform vec3 uC2;
  uniform vec3 uC3;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21) + uReferenceSeed);
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm(vec2 p) {
    float v = 0.0, amp = 0.55;
    mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
    for (int i = 0; i < 5; i++) {
      v += amp * noise(p);
      p = rot * p * 2.0 + 3.7;
      amp *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / uFourierResolution;
    vec2 p = uv * vec2(uFourierResolution.x / uFourierResolution.y, 1.0) * 1.6;
    float t = uFourierTime * uFlowSpeed;

    vec2 q = vec2(
      fbm(p + t * vec2(0.6, 0.2)),
      fbm(p + t * vec2(-0.4, 0.5) + 5.2)
    );
    vec2 r = vec2(
      fbm(p + 2.2 * q + t * vec2(0.3, -0.4) + 1.7),
      fbm(p + 2.2 * q + t * vec2(-0.2, 0.3) + 8.3)
    );
    float f = fbm(p + 2.4 * r);

    vec3 col = mix(uC1, uC2, smoothstep(0.15, 0.62, f));
    col = mix(col, uC3, smoothstep(0.60, 0.95, clamp(q.x * 1.3, 0.0, 1.0)));
    col += 0.15 * r.y * uC2;
    col = mix(col, col * col * 1.35 + col * 0.12, uHover * 0.55);

    float colorZone = smoothstep(0.30, 0.80, uv.x + 0.15 * (q.y - 0.5));
    float whiteT = smoothstep(0.50, 1.05, uv.y) * 0.55;
    float density = smoothstep(0.32, 0.85, f + 0.22 * r.x);
    vec3 base = vec3(0.985);
    float mask = colorZone * density;
    mask = clamp(mask + colorZone * 0.15, 0.0, 1.0);
    vec3 outCol = mix(base, col, mask);
    outCol = mix(outCol, base, whiteT * (1.0 - mask * 0.55));

    fragColor = vec4(outCol, 1.0);
  }
`;

export const auroraFluxShader = defineFourierShader({
  name: "AuroraFlux reference background",
  fragmentShader: AURORA_FLUX_FRAGMENT_SHADER,
  uniforms: {
    uFlowSpeed: "float",
    uReferenceSeed: "float",
    uHover: "float",
    uC1: "vec3",
    uC2: "vec3",
    uC3: "vec3",
  },
});

function AuroraFluxBackground({ props }: { readonly props: AuroraFluxProps }) {
  const { width, height } = useFourierContext();

  return (
    <div
      data-aurora-flux-background=""
      style={{
        position: "relative",
        width,
        height,
        overflow: "hidden",
        background:
          "radial-gradient(circle at 82% 68%, rgba(140,64,242,0.82), transparent 44%), radial-gradient(circle at 69% 43%, rgba(46,122,255,0.78), transparent 47%), radial-gradient(circle at 55% 72%, rgba(20,224,148,0.82), transparent 46%), rgb(251,251,251)",
      }}
    >
      <FourierShaderCanvas
        shader={auroraFluxShader}
        ariaLabel="青绿、蓝色与紫色域扭曲极光背景"
        style={{
          position: "absolute",
          zIndex: 0,
          inset: 0,
          filter: `blur(${props.glassBlur}px) saturate(118%)`,
          transform: "scale(1.045)",
          transformOrigin: "50% 50%",
        }}
        uniforms={{
          uFlowSpeed: props.flowSpeed,
          uReferenceSeed: props.seed,
          uHover: 0,
          uC1: AURORA_FLUX_PALETTE[0],
          uC2: AURORA_FLUX_PALETTE[1],
          uC3: AURORA_FLUX_PALETTE[2],
        }}
      />
      <div
        aria-hidden="true"
        data-aurora-flux-glass=""
        style={{
          position: "absolute",
          zIndex: 1,
          inset: 0,
          background:
            `linear-gradient(180deg, rgba(255,255,255,${Math.min(0.5, props.glassOpacity + 0.035)}), rgba(255,255,255,${props.glassOpacity}))`,
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.42)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

export const AuroraFlux = defineReact({
  name: "AuroraFluxBackground",
  schema: auroraFluxSchema,
  component({ props }) {
    return <AuroraFluxBackground props={props} />;
  },
  designPreview() {
    return {
      props: {},
      composition: {
        width: 1920,
        height: 1080,
        durationSeconds: AURORA_FLUX_DURATION_SECONDS,
      },
      player: { background: "#fbfbfb", loop: true },
    };
  },
});

export default AuroraFlux;
