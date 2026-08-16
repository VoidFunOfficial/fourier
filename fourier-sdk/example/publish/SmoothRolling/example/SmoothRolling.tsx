import defaultFontUrl from "../placeholder/fonts/Creator Genius.ttf";
import {
  CanvasTexture,
  ClampToEdgeWrapping,
  Color,
  DoubleSide,
  FourierCanvas,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  ShaderMaterial,
  SRGBColorSpace,
  defineReact,
  defineSchema,
  field,
  loadFont,
  useRef,
  type InferFields,
  type Texture,
} from "@fourier-video/sdk/three";

const TEXTURE_WIDTH = 4_096;
const TEXTURE_HEIGHT = 1_024;

export const smoothRollingSchema = defineSchema({
  text1: field.string({
    minLength: 1,
    maxLength: 48,
    default: "hello",
    label: "文字 1",
    description: "切换开始时正面显示、随后向下卷走的文字",
  }),
  text2: field.string({
    minLength: 1,
    maxLength: 48,
    default: "你好",
    label: "文字 2",
    description: "从上方展开并在切换结束时正面显示的文字",
  }),
  font: field.asset({
    accept: ["font/ttf", "font/otf", "font/woff", "font/woff2"],
    default: defaultFontUrl,
    label: "字体文件",
    description: "本地 TTF、OTF、WOFF 或 WOFF2；中文需选择包含中文字形的字体",
  }),
  fontWeight: field.number({
    min: 100,
    max: 900,
    integer: true,
    default: 800,
    label: "字重",
  }),
  textColor: field.color({
    default: "#ffffff",
    label: "文字颜色",
  }),
  background: field.color({
    default: "#000000",
    label: "背景颜色",
  }),
  deformation: field.number({
    min: 0.4,
    max: 1.8,
    default: 1,
    label: "卷动变形强度",
    description: "控制逐列卷曲的角度差和波形边缘",
  }),
});

export type SmoothRollingProps = InferFields<typeof smoothRollingSchema>;

interface RollingRig {
  readonly progressUniform: { value: number };
}

export function rollingClamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Smooth host-time progress; it never depends on the previously sampled frame. */
export function smoothRollingProgress(progress: number): number {
  const bounded = rollingClamp01(progress);
  return bounded * bounded * (3 - 2 * bounded);
}

export function smoothRollingIncomingOpacity(progress: number): number {
  const bounded = rollingClamp01(progress);
  const reveal = rollingClamp01((bounded - 0.055) / (0.14 - 0.055));
  return reveal * reveal * (3 - 2 * reveal);
}

function rollingEdge(normalizedX: number, deformation: number): number {
  return normalizedX
    + Math.sin(normalizedX * 12.6 + 0.35) * 0.016 * deformation
    + Math.sin(normalizedX * 27.4 - 0.8) * 0.008 * deformation;
}

/** Per-column roll amount used by the upper and lower text ribbons. */
export function smoothRollingLocalProgress(
  progress: number,
  normalizedX: number,
  deformation = 1,
): number {
  const globalProgress = smoothRollingProgress(progress);
  if (globalProgress <= 0) return 0;
  if (globalProgress >= 1) return 1;
  const front = globalProgress * 1.4 - 0.2;
  const width = 0.55;
  const edge = rollingEdge(normalizedX, deformation);
  const linear = rollingClamp01((front + width / 2 - edge) / width);
  return linear * linear * (3 - 2 * linear);
}

function fitFontSize(
  context: CanvasRenderingContext2D,
  text: string,
  family: string,
  weight: number,
): number {
  const maximum = 780;
  context.font = `${weight} ${maximum}px ${JSON.stringify(family)}`;
  const measuredWidth = Math.max(1, context.measureText(text).width);
  return Math.min(maximum, maximum * (TEXTURE_WIDTH - 288) / measuredWidth);
}

function createTextTexture(
  text: string,
  family: string,
  weight: number,
  anisotropy: number,
): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = TEXTURE_WIDTH;
  canvas.height = TEXTURE_HEIGHT;
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("SmoothRolling 无法创建文字纹理 Canvas");
  }

  const fontSize = fitFontSize(context, text, family, weight);
  context.clearRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);
  context.fillStyle = "#ffffff";
  context.font = `${weight} ${fontSize}px ${JSON.stringify(family)}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, TEXTURE_WIDTH / 2, TEXTURE_HEIGHT * 0.52);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = anisotropy;
  texture.needsUpdate = true;
  return texture;
}

function createRibbonMaterial(
  texture: Texture,
  textColor: string,
  deformation: number,
  layer: "incoming" | "outgoing",
  progressUniform: { value: number },
): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      textMap: { value: texture },
      textColor: { value: new Color(textColor) },
      deformation: { value: deformation },
      layer: { value: layer === "incoming" ? 1 : -1 },
      progress: progressUniform,
    },
    vertexShader: `
      uniform float progress;
      uniform float deformation;
      uniform float layer;
      varying vec2 vUv;

      float rollingEdge(float x) {
        return x
          + sin(x * 12.6 + 0.35) * 0.016 * deformation
          + sin(x * 27.4 - 0.8) * 0.008 * deformation;
      }

      void main() {
        vUv = uv;
        float front = progress * 1.4 - 0.2;
        float roll = 1.0 - smoothstep(
          front - 0.275,
          front + 0.275,
          rollingEdge(uv.x)
        );
        if (progress <= 0.0) roll = 0.0;
        if (progress >= 1.0) roll = 1.0;

        // Neighboring x columns rotate by different amounts. One side of a
        // glyph can face the camera while the other collapses into a thin line.
        float transitionBand = 4.0 * roll * (1.0 - roll);
        float columnTwist = (
          sin(uv.x * 19.0 + 0.4) * 0.035
          + sin(uv.x * 41.0 - 1.1) * 0.017
        ) * transitionBand * deformation;
        float maximumAngle = 1.57079632679;
        float angle = layer > 0.0
          ? mix(-maximumAngle, 0.0, roll)
          : mix(0.0, maximumAngle, roll);
        angle += columnTwist * (layer > 0.0 ? 1.0 : -1.0);

        // The shared crease travels from +half-height to -half-height. That
        // keeps text1 centered at the start and text2 centered at the end,
        // while both ribbons meet continuously during the switch.
        float seamY = 0.5 - roll;
        float localY = layer > 0.0 ? uv.y : uv.y - 1.0;
        vec3 transformed = position;
        transformed.y = seamY + localY * cos(angle);
        transformed.z = localY * sin(angle);
        transformed.x += transitionBand
          * sin(uv.y * 5.4 + uv.x * 24.0)
          * 0.018
          * deformation;
        transformed.z -= transitionBand
          * sin(uv.x * 15.0 + 0.7)
          * 0.018
          * deformation;

        gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D textMap;
      uniform vec3 textColor;
      uniform float progress;
      uniform float layer;
      varying vec2 vUv;

      void main() {
        float alpha = texture2D(textMap, vUv).a;
        float incomingReveal = layer > 0.0
          ? smoothstep(0.055, 0.14, progress)
          : 1.0;
        float outgoingFade = layer > 0.0
          ? 1.0
          : 1.0 - smoothstep(0.78, 0.98, progress);
        alpha *= incomingReveal * outgoingFade;
        if (alpha < 0.002) discard;
        gl_FragColor = vec4(textColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  });
}

function SmoothRollingComponent({
  props,
}: {
  props: Readonly<SmoothRollingProps>;
}) {
  const rigRef = useRef<RollingRig | null>(null);
  const fontFamily = loadFont(props.font, { weight: props.fontWeight });

  return (
    <FourierCanvas
      ariaLabel={`${props.text1} 切换为 ${props.text2} 的逐列卷动效果`}
      style={{ background: props.background }}
      onCreate={async ({ renderer, scene, camera, width, height }) => {
        if (!(camera instanceof PerspectiveCamera)) {
          throw new Error("SmoothRolling 需要 PerspectiveCamera");
        }
        renderer.setClearColor(new Color(props.background), 1);
        camera.fov = 31;
        camera.near = 0.1;
        camera.far = 20;
        camera.position.set(0, 0, 6.2);
        camera.lookAt(0, 0, 0);
        camera.updateProjectionMatrix();

        await document.fonts.load(
          `${props.fontWeight} 256px ${JSON.stringify(fontFamily)}`,
          `${props.text1}${props.text2}`,
        );
        await document.fonts.ready;

        const anisotropy = renderer.capabilities.getMaxAnisotropy();
        const outgoingTexture = createTextTexture(
          props.text1,
          fontFamily,
          props.fontWeight,
          anisotropy,
        );
        const incomingTexture = createTextTexture(
          props.text2,
          fontFamily,
          props.fontWeight,
          anisotropy,
        );
        const viewAspect = width / height;
        const ribbonWidth = Math.min(3.4, 2.18 * viewAspect);
        const ribbonHeight = 1;
        const outgoingGeometry = new PlaneGeometry(
          ribbonWidth,
          ribbonHeight,
          192,
          20,
        );
        const incomingGeometry = new PlaneGeometry(
          ribbonWidth,
          ribbonHeight,
          192,
          20,
        );
        const progressUniform = { value: 0 };
        const outgoingMaterial = createRibbonMaterial(
          outgoingTexture,
          props.textColor,
          props.deformation,
          "outgoing",
          progressUniform,
        );
        const incomingMaterial = createRibbonMaterial(
          incomingTexture,
          props.textColor,
          props.deformation,
          "incoming",
          progressUniform,
        );
        const outgoingMesh = new Mesh(outgoingGeometry, outgoingMaterial);
        const incomingMesh = new Mesh(incomingGeometry, incomingMaterial);
        outgoingMesh.frustumCulled = false;
        incomingMesh.frustumCulled = false;
        incomingMesh.renderOrder = 2;
        outgoingMesh.renderOrder = 1;
        scene.add(outgoingMesh, incomingMesh);
        rigRef.current = { progressUniform };

        return () => {
          scene.remove(outgoingMesh, incomingMesh);
          outgoingGeometry.dispose();
          incomingGeometry.dispose();
          outgoingMaterial.dispose();
          incomingMaterial.dispose();
          outgoingTexture.dispose();
          incomingTexture.dispose();
          rigRef.current = null;
        };
      }}
      onFrame={({ progress }) => {
        const rig = rigRef.current;
        if (rig === null) return;
        rig.progressUniform.value = smoothRollingProgress(progress);
      }}
    />
  );
}

export const SmoothRolling = defineReact({
  name: "SmoothRolling",
  schema: smoothRollingSchema,
  component: SmoothRollingComponent,
  designPreview() {
    return {
      props: {},
      composition: { width: 960, height: 540, durationSeconds: 1 },
      player: { background: "#000000", loop: false },
    };
  },
});

export default SmoothRolling;
