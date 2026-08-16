import {
  defineMotion,
  defineFourierShader,
  definePreview,
  defineReact,
  field,
  FourierShaderCanvas,
  glsl,
  loadFont,
} from "../src/index.ts";
import {
  searchFourierWorld,
  type WorldSearchResponse,
} from "../src/search.ts";

searchFourierWorld("cinematic launch title", {
  type: "motion",
  styles: ["cinematic"],
  moods: ["energetic"],
  languages: ["zh-CN"],
  limit: 8,
}) satisfies Promise<WorldSearchResponse>;

searchFourierWorld("cinematic launch title", {
  // @ts-expect-error styles use the Fourier World manifest vocabulary.
  styles: ["neon"],
});

const shader = defineFourierShader({
  fragmentShader: glsl`
    out vec4 fragColor;
    uniform float uGain;
    uniform vec3 uTint;
    void main() { fragColor = vec4(uTint * uGain, 1.0); }
  `,
  uniforms: { uGain: "float", uTint: "vec3" },
});

FourierShaderCanvas({
  shader,
  uniforms: ({ timeSeconds, width, height, seed }) => {
    timeSeconds satisfies number;
    width satisfies number;
    height satisfies number;
    seed satisfies number;
    return { uGain: 0.8, uTint: [1, 0.5, 0.2] };
  },
});

FourierShaderCanvas({
  shader,
  // @ts-expect-error uGain is required by the shader uniform layout.
  uniforms: { uTint: [1, 0.5, 0.2] },
});

FourierShaderCanvas({
  shader,
  uniforms: {
    // @ts-expect-error float uniforms accept numbers, not strings.
    uGain: "1",
    uTint: [1, 0.5, 0.2],
  },
});

const noCustomUniforms = defineFourierShader({
  fragmentShader: "out vec4 fragColor; void main() { fragColor = vec4(1.0); }",
});
FourierShaderCanvas({ shader: noCustomUniforms });

loadFont("./font.ttf") satisfies string;
loadFont("./font.otf", { weight: 700, style: "italic" }) satisfies string;
// @ts-expect-error loadFont weight is a numeric CSS weight or normal/bold.
loadFont("./font.ttf", { weight: "heavy" });

const panel = defineReact({
  name: "Panel",
  schema: {
    title: field.string(),
    value: field.number(),
    accent: field.color({ default: "#ffffff" }),
  },
  component({ props }) {
    props.title satisfies string;
    props.value satisfies number;
    props.accent satisfies string;
    return null;
  },
  designPreview() {
    return {
      props: { title: "Title", value: 1 },
      composition: { width: 100, height: 100, durationSeconds: 1 },
    };
  },
});

defineReact({
  name: "DomPanel",
  schema: { title: field.string() },
  static: true,
  component({ props }) {
    props.title satisfies string;
    // @ts-expect-error ABI v1 component input never exposes frame/fps/progress/time.
    props.frame satisfies never;
    return null;
  },
  designPreview() {
    return {
      props: { title: "Title" },
      composition: { width: 100, height: 100, durationSeconds: 1 },
    };
  },
});

defineReact({
  name: "InvalidStaticDeclaration",
  schema: {},
  // @ts-expect-error static declaration must be boolean when present.
  static: "yes",
  component() { return null; },
  designPreview() {
    return { props: {}, composition: { width: 1, height: 1, durationSeconds: 0 } };
  },
});

definePreview({
  artifact: panel,
  props: { title: "Title", value: 1 },
  composition: { width: 100, height: 100, durationSeconds: 1 },
});

definePreview({
  artifact: panel,
  // @ts-expect-error schema keeps value as number.
  props: { title: "Title", value: "1" },
  composition: { width: 100, height: 100, durationSeconds: 1 },
});

// @ts-expect-error designPreview is a mandatory artifact entry.
defineReact({ name: "Missing", schema: {}, component: () => null });

const motion = defineMotion({
  name: "Motion",
  schema: { amount: field.number() },
  supportsTextMotion: false,
  component({ subject }) { return subject; },
  designPreview() {
    return {
      props: { amount: 10 },
      subject: "subject",
      composition: { width: 100, height: 100, durationSeconds: 1 },
    };
  },
});

const videoMotion = defineMotion({
  name: "VideoMotion",
  schema: { radius: field.number({ default: 0.055 }) },
  videoComposition: "ffmpeg",
  component({ video, props }) {
    video.id satisfies string;
    props.radius satisfies number;
    // @ts-expect-error opaque handles never expose a source path.
    video.src satisfies never;
    return null;
  },
  designPreview() {
    return {
      props: {},
      composition: { width: 100, height: 100, durationSeconds: 1 },
    };
  },
});

definePreview({
  artifact: videoMotion,
  props: {},
  composition: { width: 100, height: 100, durationSeconds: 1 },
});

definePreview({
  artifact: videoMotion,
  props: {},
  composition: { width: 100, height: 100, durationSeconds: 1 },
  // @ts-expect-error FFmpeg Video Motion preview forbids a React subject.
  subject: "video pixels",
});

defineMotion({
  name: "InvalidVideoTextMotion",
  schema: {},
  videoComposition: "ffmpeg",
  // @ts-expect-error FFmpeg Video Motion cannot declare Text Motion support.
  supportsTextMotion: false,
  component() { return null; },
  designPreview() {
    return {
      props: {},
      composition: { width: 100, height: 100, durationSeconds: 1 },
    };
  },
});

defineMotion({
  name: "InvalidVideoOverlay",
  schema: {},
  videoComposition: "ffmpeg",
  component() { return null; },
  // @ts-expect-error FFmpeg Video Motion cannot define an overlay.
  overlay() { return null; },
  designPreview() {
    return {
      props: {},
      composition: { width: 100, height: 100, durationSeconds: 1 },
    };
  },
});

defineMotion({
  name: "TextMotion",
  schema: { amount: field.number() },
  supportsTextMotion: true,
  component({ subject }) { return subject; },
  textComponent({ text, props }) {
    text satisfies string;
    props.amount satisfies number;
    return text;
  },
  designPreview() {
    return {
      props: { amount: 10 },
      subject: "subject",
      composition: { width: 100, height: 100, durationSeconds: 1 },
    };
  },
});

// @ts-expect-error every Motion must explicitly declare Text Motion support.
defineMotion({
  name: "MissingTextCapability",
  schema: {},
  component({ subject }) { return subject; },
  designPreview() {
    return {
      props: {},
      subject: "subject",
      composition: { width: 100, height: 100, durationSeconds: 1 },
    };
  },
});

// @ts-expect-error supportsTextMotion=true requires textComponent.
defineMotion({
  name: "MissingTextComponent",
  schema: {},
  supportsTextMotion: true,
  component({ subject }: { subject: import("react").ReactNode }) { return subject; },
  designPreview() {
    return {
      props: {},
      subject: "subject",
      composition: { width: 100, height: 100, durationSeconds: 1 },
    };
  },
});

definePreview({
  artifact: motion,
  props: { amount: 10 },
  subject: "subject",
  composition: { width: 100, height: 100, durationSeconds: 1 },
});

definePreview({
  artifact: motion,
  props: { amount: 10 },
  composition: { width: 100, height: 100, durationSeconds: 1 },
  // @ts-expect-error Motion preview must include subject.
  subject: undefined,
});

definePreview({
  artifact: panel,
  props: { title: "Title", value: 1 },
  composition: {
    width: 100,
    height: 100,
    durationSeconds: 1,
    // @ts-expect-error preview fps is fixed at 60 and is not author-configurable.
    fps: 30,
  },
});

definePreview({
  artifact: panel,
  props: { title: "Title", value: 1 },
  // @ts-expect-error durationSeconds is mandatory.
  composition: { width: 100, height: 100 },
});

export {};
