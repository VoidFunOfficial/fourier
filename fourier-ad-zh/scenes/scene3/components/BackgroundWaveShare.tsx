import {
  Color,
  FourierCanvas,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Vector2,
  defineReact,
  defineSchema,
  field,
  useRef,
  type InferFields,
} from "@fourier-video/sdk/three";

export const BACKGROUND_WAVE_DURATION_SECONDS = 4;

export const backgroundWaveShareSchema = defineSchema({
  backgroundColor: field.color({
    label: "Background color",
    description: "The color used for pixel gaps and the darkest canvas areas.",
    default: "#10100e",
  }),
  idleColor: field.color({
    label: "Idle pixel color",
    description: "The square color when no wave is passing through.",
    default: "#50504c",
  }),
  activeColor: field.color({
    label: "Wave color",
    description: "The illuminated square color at the wave crest.",
    default: "#ff671d",
  }),
  pixelSize: field.number({
    label: "Pixel size",
    description: "The side length of each square in pixels.",
    min: 12,
    max: 52,
    integer: true,
    default: 24,
  }),
  pixelGap: field.number({
    label: "Pixel gap",
    description: "The spacing between adjacent squares in pixels.",
    min: 3,
    max: 18,
    integer: true,
    default: 8,
  }),
  waveCount: field.number({
    label: "Concurrent waves",
    description: "The number of concentric waves formed by falling squares.",
    min: 3,
    max: 10,
    integer: true,
    default: 6,
  }),
  waveThickness: field.number({
    label: "Wave thickness",
    description: "The radial width of illuminated falling squares.",
    min: 44,
    max: 180,
    integer: true,
    default: 108,
  }),
  dropDistance: field.number({
    label: "Drop distance",
    description: "How far each illuminated square falls when a wave arrives.",
    min: 8,
    max: 60,
    integer: true,
    default: 26,
  }),
  gaussianBlur: field.number({
    label: "Gaussian blur",
    description: "The Gaussian blur radius applied over the full canvas.",
    min: 0,
    max: 24,
    integer: true,
    default: 7,
  }),
  timeOffsetSeconds: field.number({
    label: "Time offset",
    description: "Offsets the wave phase to continue seamlessly across scenes.",
    min: 0,
    max: 60,
    default: 0,
  }),
});

export type BackgroundWaveShareProps = InferFields<typeof backgroundWaveShareSchema>;

export interface BackgroundWaveGrid {
  readonly pixelSize: number;
  readonly pixelGap: number;
  readonly pitch: number;
  readonly columns: number;
  readonly rows: number;
  readonly visiblePixelCount: number;
}

export interface BackgroundWavePixelState {
  readonly activation: number;
  readonly drop: number;
}

interface BackgroundWaveRig {
  readonly geometry: PlaneGeometry;
  readonly material: ShaderMaterial;
  readonly mesh: Mesh<PlaneGeometry, ShaderMaterial>;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const progress = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return progress * progress * (3 - 2 * progress);
}

export function backgroundWaveGrid(
  width: number,
  height: number,
  pixelSize: number,
  pixelGap: number,
): BackgroundWaveGrid {
  const safePixelSize = clamp(Math.round(pixelSize), 1, 256);
  const safePixelGap = clamp(Math.round(pixelGap), 0, 128);
  const pitch = safePixelSize + safePixelGap;
  const columns = Math.ceil(Math.max(1, width) / pitch) + 1;
  const rows = Math.ceil(Math.max(1, height) / pitch) + 1;
  return {
    pixelSize: safePixelSize,
    pixelGap: safePixelGap,
    pitch,
    columns,
    rows,
    visiblePixelCount: columns * rows,
  };
}

export function backgroundWaveMaximumRadius(width: number, height: number): number {
  return Math.hypot(Math.max(1, width) / 2, Math.max(1, height) / 2);
}

/** Mirrors the GPU shader's per-square radial wave calculation. */
export function backgroundWavePixelState(
  distance: number,
  timeSeconds: number,
  maximumRadius: number,
  waveCount: number,
  waveThickness: number,
  dropDistance: number,
  durationSeconds = BACKGROUND_WAVE_DURATION_SECONDS,
): BackgroundWavePixelState {
  const safeRadius = Math.max(1, maximumRadius);
  const safeCount = Math.max(1, Math.floor(waveCount));
  const radialSpacing = safeRadius / safeCount;
  const cycles = timeSeconds / Math.max(0.001, durationSeconds) * safeCount
    - Math.max(0, distance) / radialSpacing;
  const phase = ((cycles % 1) + 1) % 1;
  const cyclicDistance = Math.min(phase, 1 - phase);
  const halfWidth = clamp(
    waveThickness / Math.max(1, radialSpacing) * 0.5,
    0.08,
    0.42,
  );
  const activation = 1 - smoothstep(
    Math.max(0, halfWidth - 0.045),
    halfWidth,
    cyclicDistance,
  );
  const shaped = activation * activation * (3 - 2 * activation);
  return {
    activation: shaped,
    drop: clamp(dropDistance, 0, 80) * shaped,
  };
}

export const BACKGROUND_WAVE_VERTEX_SHADER = `
  void main() {
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const BACKGROUND_WAVE_FRAGMENT_SHADER = `
  precision highp float;

  uniform vec2 resolution;
  uniform float timeSeconds;
  uniform float durationSeconds;
  uniform float pixelSize;
  uniform float pixelGap;
  uniform float waveCount;
  uniform float waveThickness;
  uniform float dropDistance;
  uniform vec3 backgroundColor;
  uniform vec3 idleColor;
  uniform vec3 activeColor;

  float waveActivation(vec2 sourceCenter) {
    float maximumRadius = length(resolution * 0.5);
    float radialSpacing = maximumRadius / max(1.0, waveCount);
    float cycles = timeSeconds / max(0.001, durationSeconds) * waveCount
      - length(sourceCenter - resolution * 0.5) / radialSpacing;
    float phase = fract(cycles);
    float cyclicDistance = min(phase, 1.0 - phase);
    float halfWidth = clamp(
      waveThickness / max(1.0, radialSpacing) * 0.5,
      0.08,
      0.42
    );
    float activation = 1.0 - smoothstep(
      max(0.0, halfWidth - 0.045),
      halfWidth,
      cyclicDistance
    );
    return activation * activation * (3.0 - 2.0 * activation);
  }

  float squareDistance(vec2 point, vec2 center, float size) {
    vec2 delta = abs(point - center) - vec2(size * 0.5);
    return length(max(delta, 0.0)) + min(max(delta.x, delta.y), 0.0);
  }

  void main() {
    vec2 point = vec2(gl_FragCoord.x, resolution.y - gl_FragCoord.y);
    float pitch = pixelSize + pixelGap;
    vec2 gridIndex = floor((point - resolution * 0.5) / pitch + 0.5);

    float bestCore = 0.0;
    float bestActivation = 0.0;
    // Squares only move vertically, so the current source column plus seven
    // candidate rows cover the maximum configured 60px downward travel.
    for (int rowOffset = -5; rowOffset <= 1; rowOffset++) {
      vec2 sourceCenter = resolution * 0.5
        + (gridIndex + vec2(0.0, float(rowOffset))) * pitch;
      float activation = waveActivation(sourceCenter);
      vec2 displayedCenter = sourceCenter + vec2(0.0, dropDistance * activation);
      float signedDistance = squareDistance(point, displayedCenter, pixelSize);
      float core = 1.0 - smoothstep(-0.7, 0.7, signedDistance);
      if (core > bestCore) {
        bestCore = core;
        bestActivation = activation;
      }
    }

    vec3 squareColor = mix(idleColor, activeColor, bestActivation);
    float highlight = bestCore * (0.035 + bestActivation * 0.13);
    squareColor += vec3(highlight);
    vec3 color = mix(backgroundColor, squareColor, bestCore);

    float vignetteDistance = length((point - resolution * 0.5) / resolution);
    color *= 1.0 - smoothstep(0.42, 0.72, vignetteDistance) * 0.34;
    gl_FragColor = vec4(color, 1.0);
  }
`;

function BackgroundWaveShareLayer({ props }: { props: BackgroundWaveShareProps }) {
  const rig = useRef<BackgroundWaveRig | null>(null);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: props.backgroundColor,
      }}
    >
      <FourierCanvas
        ariaLabel="GPU-rendered square pixels falling and glowing as concentric waves travel outward"
        rendererOptions={{ antialias: false, alpha: false }}
        style={{ background: props.backgroundColor }}
        onCreate={({ renderer, scene, width, height }) => {
          renderer.setClearColor(new Color(props.backgroundColor), 1);
          const geometry = new PlaneGeometry(2, 2, 1, 1);
          const material = new ShaderMaterial({
            depthTest: false,
            depthWrite: false,
            vertexShader: BACKGROUND_WAVE_VERTEX_SHADER,
            fragmentShader: BACKGROUND_WAVE_FRAGMENT_SHADER,
            uniforms: {
              resolution: { value: new Vector2(width, height) },
              timeSeconds: { value: 0 },
              durationSeconds: { value: BACKGROUND_WAVE_DURATION_SECONDS },
              pixelSize: { value: props.pixelSize },
              pixelGap: { value: props.pixelGap },
              waveCount: { value: props.waveCount },
              waveThickness: { value: props.waveThickness },
              dropDistance: { value: props.dropDistance },
              backgroundColor: { value: new Color(props.backgroundColor) },
              idleColor: { value: new Color(props.idleColor) },
              activeColor: { value: new Color(props.activeColor) },
            },
          });
          const mesh = new Mesh(geometry, material);
          mesh.frustumCulled = false;
          scene.add(mesh);
          rig.current = { geometry, material, mesh };

          return () => {
            scene.remove(mesh);
            geometry.dispose();
            material.dispose();
            rig.current = null;
          };
        }}
        onFrame={({ timeSeconds }) => {
          const current = rig.current;
          if (current === null) return;
          const uniform = current.material.uniforms.timeSeconds;
          if (uniform !== undefined) uniform.value = timeSeconds + props.timeOffsetSeconds;
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(16, 16, 14, 0.012)",
          backdropFilter: `blur(${props.gaussianBlur}px)`,
          WebkitBackdropFilter: `blur(${props.gaussianBlur}px)`,
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

export const BackgroundWaveShare = defineReact({
  name: "BackgroundWaveShare",
  schema: backgroundWaveShareSchema,
  component({ props }) {
    return <BackgroundWaveShareLayer props={props} />;
  },
  designPreview() {
    return {
      props: {},
      composition: {
        width: 1920,
        height: 1080,
        durationSeconds: BACKGROUND_WAVE_DURATION_SECONDS,
      },
      player: { background: "#10100e", loop: true },
    };
  },
});

export default BackgroundWaveShare;
