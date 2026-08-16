import {
  FourierShaderCanvas,
  defineFourierShader,
  defineReact,
  defineSchema,
  field,
  glsl,
  type FourierShaderVec3,
  type InferFields,
} from "@fourier-video/sdk";

export const SPECTRA_GL_DURATION_SECONDS = 8;

export const spectraGLSchema = defineSchema({
  textureMode: field.enum(["fbm", "grain", "hybrid"] as const, {
    default: "fbm",
    label: "纹理模式",
    description: "FBM 为参考原版；颗粒和混合模式是可选扩展。",
  }),
  density: field.number({
    min: 0.55,
    max: 1.55,
    default: 1,
    label: "云雾密度",
  }),
  layers: field.number({
    min: 2,
    max: 8,
    integer: true,
    default: 5,
    label: "FBM 层级",
  }),
  spatialStructure: field.enum(["reference", "radial", "bands"] as const, {
    default: "reference",
    label: "空间结构",
    description: "reference 完整复刻参考 HTML 的横向色彩云结构。",
  }),
  driveMode: field.enum(["drift", "breathe", "stir"] as const, {
    default: "drift",
    label: "驱动方式",
    description: "drift 完整复刻参考的缓慢累积流动。",
  }),
  flowSpeed: field.number({
    min: 0.05,
    max: 0.85,
    default: 0.22,
    label: "流动速度",
  }),
  colorStart: field.number({
    min: 0,
    max: 0.65,
    default: 0.3,
    label: "颜色起始位置",
    description: "参考效果左侧约四成留白给文字。",
  }),
  topFog: field.number({
    min: 0,
    max: 1,
    default: 0.55,
    label: "顶部白雾",
  }),
  saturation: field.number({
    min: 0,
    max: 1,
    default: 0,
    label: "饱和反馈",
    description: "对应参考卡片 hover 时的颜色饱和反馈。",
  }),
  palette: field.enum(
    ["original", "aurora", "klein", "ultraviolet", "chrome", "sunset", "custom"] as const,
    { default: "original", label: "配色方案" },
  ),
  colorA: field.color({ default: "#ff4f9e", label: "自定义颜色 A" }),
  colorB: field.color({ default: "#ff8c40", label: "自定义颜色 B" }),
  colorC: field.color({ default: "#b83dff", label: "自定义颜色 C" }),
  background: field.color({ default: "#fbfbfb", label: "留白颜色" }),
});

export type SpectraGLProps = InferFields<typeof spectraGLSchema>;

const namedColors: Readonly<Record<string, FourierShaderVec3>> = Object.freeze({
  black: [0, 0, 0],
  blue: [0, 0, 1],
  cyan: [0, 1, 1],
  green: [0, 0.5019607843, 0],
  magenta: [1, 0, 1],
  red: [1, 0, 0],
  transparent: [0, 0, 0],
  white: [1, 1, 1],
  yellow: [1, 1, 0],
});

export function spectraShaderColor(color: string): FourierShaderVec3 {
  const normalized = color.trim().toLowerCase();
  const named = namedColors[normalized];
  if (named !== undefined) return named;
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])(?:[0-9a-f])?$/.exec(normalized);
  const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})(?:[0-9a-f]{2})?$/.exec(
    normalized,
  );
  const channels = short === null
    ? long?.slice(1, 4).map((channel) => Number.parseInt(channel, 16))
    : short.slice(1, 4).map((channel) => Number.parseInt(channel + channel, 16));
  if (channels === undefined || channels.length !== 3) {
    throw new TypeError(`SpectraGL 不支持颜色 "${color}"；请使用十六进制或基础 CSS 色名`);
  }
  return [
    (channels[0] ?? 0) / 255,
    (channels[1] ?? 0) / 255,
    (channels[2] ?? 0) / 255,
  ];
}

const palettePresets = Object.freeze({
  original: [[1, 0.31, 0.62], [1, 0.55, 0.25], [0.72, 0.24, 1]],
  aurora: [[0.08, 0.88, 0.58], [0.18, 0.48, 1], [0.55, 0.25, 0.95]],
  klein: [[0, 0.18, 0.65], [0.13, 0.25, 0.85], [1, 0.36, 0.12]],
  ultraviolet: [[0.48, 0.24, 1], [0.72, 0.83, 0.24], [0.3, 0.17, 0.63]],
  chrome: [[0.13, 0.13, 0.13], [0.55, 0.55, 0.55], [0.82, 0.82, 0.82]],
  sunset: [[1, 0.72, 0.18], [1, 0.34, 0.28], [0.62, 0.14, 0.44]],
} as const);

export function spectraPalette(
  palette: SpectraGLProps["palette"],
  custom: readonly [string, string, string],
): readonly [FourierShaderVec3, FourierShaderVec3, FourierShaderVec3] {
  if (palette === "custom") {
    return [
      spectraShaderColor(custom[0]),
      spectraShaderColor(custom[1]),
      spectraShaderColor(custom[2]),
    ];
  }
  return palettePresets[palette];
}

const textureModeIndex = Object.freeze({ fbm: 0, grain: 1, hybrid: 2 } as const);
const spatialStructureIndex = Object.freeze({ reference: 0, radial: 1, bands: 2 } as const);
const driveModeIndex = Object.freeze({ drift: 0, breathe: 1, stir: 2 } as const);

/** Port of the supplied FLUX domain-warped FBM fragment shader. */
export const SPECTRA_GL_FRAGMENT_SHADER = glsl`
  out vec4 fragColor;

  uniform int uTextureMode;
  uniform float uDensity;
  uniform int uLayers;
  uniform int uStructure;
  uniform int uDriver;
  uniform float uFlowSpeed;
  uniform float uColorStart;
  uniform float uTopFog;
  uniform float uSaturation;
  uniform vec3 uC1;
  uniform vec3 uC2;
  uniform vec3 uC3;
  uniform vec3 uBase;

  float hash(vec2 point) {
    point = fract(point * vec2(123.34, 456.21) + uFourierSeed);
    point += dot(point, point + 45.32);
    return fract(point.x * point.y);
  }

  float noise(vec2 point) {
    vec2 cell = floor(point);
    vec2 local = fract(point);
    local = local * local * (3.0 - 2.0 * local);
    float a = hash(cell);
    float b = hash(cell + vec2(1.0, 0.0));
    float c = hash(cell + vec2(0.0, 1.0));
    float d = hash(cell + vec2(1.0, 1.0));
    return mix(mix(a, b, local.x), mix(c, d, local.x), local.y);
  }

  float fbm(vec2 point) {
    float value = 0.0;
    float amplitude = 0.55;
    mat2 rotation = mat2(0.8, 0.6, -0.6, 0.8);
    for (int octave = 0; octave < 8; octave++) {
      if (octave >= uLayers) break;
      value += amplitude * noise(point);
      point = rotation * point * 2.0 + 3.7;
      amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / uFourierResolution;
    vec2 point = uv * vec2(uFourierResolution.x / uFourierResolution.y, 1.0) * 1.6;
    if (uStructure == 1) {
      point = vec2(length(point - vec2(0.8)), atan(point.y - 0.8, point.x - 0.8));
    } else if (uStructure == 2) {
      point.y *= 2.1;
    }

    float time = uFourierTime * uFlowSpeed + fract(uFourierSeed * 0.6180339) * 100.0;
    if (uDriver == 1) {
      time += sin(uFourierProgress * 6.28318530718) * 0.18;
    } else if (uDriver == 2) {
      time *= 2.5;
    }

    vec2 q = vec2(
      fbm(point + time * vec2(0.6, 0.2)),
      fbm(point + time * vec2(-0.4, 0.5) + 5.2)
    );
    vec2 r = vec2(
      fbm(point + 2.2 * q + time * vec2(0.3, -0.4) + 1.7),
      fbm(point + 2.2 * q + time * vec2(-0.2, 0.3) + 8.3)
    );
    float field = fbm(point + 2.4 * r);

    vec3 color = mix(uC1, uC2, smoothstep(0.15, 0.62, field));
    color = mix(color, uC3, smoothstep(0.60, 0.95, clamp(q.x * 1.3, 0.0, 1.0)));
    color += 0.15 * r.y * uC2;
    color = mix(
      color,
      color * color * 1.35 + color * 0.12,
      uSaturation * 0.55
    );

    float colorZone = smoothstep(uColorStart, 0.80, uv.x + 0.15 * (q.y - 0.5));
    float whiteTop = smoothstep(0.50, 1.05, uv.y) * uTopFog;
    float density = smoothstep(0.32, 0.85, (field + 0.22 * r.x) * uDensity);
    if (uTextureMode == 1) {
      density *= mix(0.82, 1.18, hash(gl_FragCoord.xy));
    } else if (uTextureMode == 2) {
      density *= mix(0.9, 1.1, hash(gl_FragCoord.xy));
    }
    float mask = colorZone * density;
    mask = clamp(mask + colorZone * 0.15, 0.0, 1.0);
    vec3 outputColor = mix(uBase, color, mask);
    outputColor = mix(outputColor, uBase, whiteTop * (1.0 - mask * 0.55));
    fragColor = vec4(outputColor, 1.0);
  }
`;

export const spectraGLShader = defineFourierShader({
  name: "SpectraGL FLUX reference",
  fragmentShader: SPECTRA_GL_FRAGMENT_SHADER,
  uniforms: {
    uTextureMode: "int",
    uDensity: "float",
    uLayers: "int",
    uStructure: "int",
    uDriver: "int",
    uFlowSpeed: "float",
    uColorStart: "float",
    uTopFog: "float",
    uSaturation: "float",
    uC1: "vec3",
    uC2: "vec3",
    uC3: "vec3",
    uBase: "vec3",
  },
});

function SpectraGLLayer({ props }: { readonly props: SpectraGLProps }) {
  const palette = spectraPalette(props.palette, [props.colorA, props.colorB, props.colorC]);
  return (
    <FourierShaderCanvas
      shader={spectraGLShader}
      ariaLabel="SpectraGL FLUX domain-warped living color field"
      style={{ background: props.background }}
      uniforms={{
        uTextureMode: textureModeIndex[props.textureMode],
        uDensity: props.density,
        uLayers: props.layers,
        uStructure: spatialStructureIndex[props.spatialStructure],
        uDriver: driveModeIndex[props.driveMode],
        uFlowSpeed: props.flowSpeed,
        uColorStart: props.colorStart,
        uTopFog: props.topFog,
        uSaturation: props.saturation,
        uC1: palette[0],
        uC2: palette[1],
        uC3: palette[2],
        uBase: spectraShaderColor(props.background),
      }}
    />
  );
}

export const SpectraGL = defineReact({
  name: "SpectraGL",
  schema: spectraGLSchema,
  component({ props }) {
    return <SpectraGLLayer props={props} />;
  },
  designPreview() {
    return {
      props: {},
      composition: {
        width: 960,
        height: 540,
        durationSeconds: SPECTRA_GL_DURATION_SECONDS,
      },
      player: { background: "#fbfbfb", loop: true },
    };
  },
});

export default SpectraGL;
