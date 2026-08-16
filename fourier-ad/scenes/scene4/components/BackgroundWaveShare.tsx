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

const WAVE_CYCLE_SECONDS = 4;

const schema = defineSchema({
  backgroundColor: field.color({ default: "#23212d" }),
  idleColor: field.color({ default: "#4b4857" }),
  activeColor: field.color({ default: "#8274ff" }),
  pixelSize: field.number({ min: 12, max: 52, integer: true, default: 18 }),
  pixelGap: field.number({ min: 3, max: 18, integer: true, default: 8 }),
  waveCount: field.number({ min: 3, max: 10, integer: true, default: 6 }),
  waveThickness: field.number({ min: 44, max: 180, integer: true, default: 92 }),
  dropDistance: field.number({ min: 8, max: 60, integer: true, default: 20 }),
  gaussianBlur: field.number({ min: 0, max: 24, integer: true, default: 5 }),
  timeOffsetSeconds: field.number({ min: 0, max: 60, default: 7 }),
});

type Props = InferFields<typeof schema>;

interface Rig {
  readonly geometry: PlaneGeometry;
  readonly material: ShaderMaterial;
  readonly mesh: Mesh<PlaneGeometry, ShaderMaterial>;
}

const vertexShader = `
  void main() {
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const fragmentShader = `
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
    squareColor += vec3(bestCore * (0.035 + bestActivation * 0.13));
    vec3 color = mix(backgroundColor, squareColor, bestCore);
    float vignetteDistance = length((point - resolution * 0.5) / resolution);
    color *= 1.0 - smoothstep(0.42, 0.72, vignetteDistance) * 0.34;
    gl_FragColor = vec4(color, 1.0);
  }
`;

function Background({ props }: { props: Props }) {
  const rig = useRef<Rig | null>(null);
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
        ariaLabel="Concentric purple pixel waves continuing from the previous scene"
        rendererOptions={{ antialias: false, alpha: false }}
        style={{ background: props.backgroundColor }}
        onCreate={({ renderer, scene, width, height }) => {
          renderer.setClearColor(new Color(props.backgroundColor), 1);
          const geometry = new PlaneGeometry(2, 2, 1, 1);
          const material = new ShaderMaterial({
            depthTest: false,
            depthWrite: false,
            vertexShader,
            fragmentShader,
            uniforms: {
              resolution: { value: new Vector2(width, height) },
              timeSeconds: { value: props.timeOffsetSeconds },
              durationSeconds: { value: WAVE_CYCLE_SECONDS },
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
          const uniform = rig.current?.material.uniforms.timeSeconds;
          if (uniform !== undefined) uniform.value = timeSeconds + props.timeOffsetSeconds;
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(16,16,14,.012)",
          backdropFilter: `blur(${props.gaussianBlur}px)`,
          WebkitBackdropFilter: `blur(${props.gaussianBlur}px)`,
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

export default defineReact({
  name: "SceneFourBackgroundWave",
  schema,
  component({ props }) {
    return <Background props={props} />;
  },
  designPreview() {
    return {
      props: {},
      composition: { width: 1920, height: 1080, durationSeconds: 4 },
      player: { background: "#23212d", loop: true },
    };
  },
});
