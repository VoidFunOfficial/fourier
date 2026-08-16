import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  AmbientLight,
  Color,
  DirectionalLight,
  DoubleSide,
  ExtrudeGeometry,
  FourierCanvas,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  ShaderMaterial,
  Shape,
  SphereGeometry,
  defineReact,
  defineSchema,
  field,
  useRef,
  type BufferGeometry,
  type InferFields,
  type Material,
} from "@fourier-video/sdk/three";

const TAU = Math.PI * 2;
const PREVIEW_DURATION_SECONDS = 8;

export const frostedPetalBloom3DSchema = defineSchema({
  petalColor: field.color({
    default: "#ff63b8",
    label: "花瓣颜色",
    description: "毛玻璃花瓣的主色",
  }),
  coreColor: field.color({
    default: "#ffd2eb",
    label: "内芯颜色",
    description: "花瓣内部柔光与花心的颜色",
  }),
  background: field.color({
    default: "#260719",
    label: "背景颜色",
  }),
  petalCount: field.number({
    min: 6,
    max: 14,
    default: 10,
    label: "花瓣数量",
  }),
  spread: field.number({
    min: 0.72,
    max: 1.3,
    default: 1,
    label: "展开幅度",
  }),
  bloomDuration: field.number({
    min: 1.2,
    max: 3.6,
    default: 2.35,
    label: "绽放时长（秒）",
  }),
  orbitTurns: field.number({
    min: -0.5,
    max: 1.5,
    default: 0.28,
    label: "整体旋转圈数",
    description: "完整预览时长内花朵围绕中心旋转的圈数",
  }),
  frostiness: field.number({
    min: 0,
    max: 1,
    default: 0.72,
    label: "磨砂程度",
  }),
  glow: field.number({
    min: 0,
    max: 1.8,
    default: 1,
    label: "柔光强度",
  }),
});

export type FrostedPetalBloom3DProps = InferFields<
  typeof frostedPetalBloom3DSchema
>;

interface PetalRig {
  readonly group: Group;
  readonly shellMaterial: MeshPhysicalMaterial;
  readonly angle: number;
  readonly delay: number;
  readonly radiusVariation: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly depth: number;
  readonly tilt: number;
  readonly phase: number;
}

interface DustRig {
  readonly mesh: Mesh;
  readonly angle: number;
  readonly radius: number;
  readonly depth: number;
  readonly phase: number;
  readonly size: number;
}

interface BloomRig {
  readonly root: Group;
  readonly petals: readonly PetalRig[];
  readonly dust: readonly DustRig[];
  readonly dustMaterial: MeshBasicMaterial;
  readonly backdropMaterial: ShaderMaterial;
}

export function petalClamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function petalRange(
  timeSeconds: number,
  startSeconds: number,
  endSeconds: number,
): number {
  if (endSeconds <= startSeconds) return timeSeconds >= endSeconds ? 1 : 0;
  return petalClamp01(
    (timeSeconds - startSeconds) / (endSeconds - startSeconds),
  );
}

export function petalEaseInOutCubic(value: number): number {
  const progress = petalClamp01(value);
  return progress < 0.5
    ? 4 * progress ** 3
    : 1 - (-2 * progress + 2) ** 3 / 2;
}

export function petalEaseOutBack(value: number): number {
  const progress = petalClamp01(value);
  const overshoot = 1.18;
  const shifted = progress - 1;
  return 1 + (overshoot + 1) * shifted ** 3 + overshoot * shifted ** 2;
}

export function petalBloomProgress(
  timeSeconds: number,
  index: number,
  count: number,
  bloomDuration: number,
): number {
  const normalizedCount = Math.max(1, Math.round(count));
  const stagger = Math.min(0.22, bloomDuration * 0.075);
  const wave = (index % 2) * 0.45 + index / normalizedCount;
  const delay = wave * stagger;
  return petalRange(timeSeconds, 0.08 + delay, bloomDuration + delay);
}

export function petalOrbitAngle(
  timeSeconds: number,
  bloomDuration: number,
  orbitTurns: number,
): number {
  const opening = petalEaseInOutCubic(
    petalRange(timeSeconds, 0, bloomDuration * 0.94),
  );
  const openingTurn = (-42 + opening * 104) * Math.PI / 180;
  return openingTurn
    + petalClamp01(timeSeconds / PREVIEW_DURATION_SECONDS) * orbitTurns * TAU;
}

export function petalLayoutScale(count: number): number {
  const normalizedCount = Math.max(6, Math.min(14, Math.round(count)));
  return 1 - Math.max(0, normalizedCount - 10) * 0.065;
}

export function petalLayoutRadius(count: number): number {
  const normalizedCount = Math.max(6, Math.min(14, Math.round(count)));
  return 2.08
    + Math.max(0, normalizedCount - 10) * 0.045
    - Math.max(0, 10 - normalizedCount) * 0.025;
}

function createRoundedPetalShape(): Shape {
  const shape = new Shape();
  shape.moveTo(0, -0.82);
  shape.bezierCurveTo(-0.4, -0.84, -0.66, -0.57, -0.67, -0.12);
  shape.bezierCurveTo(-0.69, 0.34, -0.42, 0.75, -0.04, 0.82);
  shape.bezierCurveTo(0.38, 0.84, 0.65, 0.52, 0.65, 0.08);
  shape.bezierCurveTo(0.66, -0.37, 0.4, -0.79, 0, -0.82);
  return shape;
}

function createPetalShellGeometry(): ExtrudeGeometry {
  const geometry = new ExtrudeGeometry(createRoundedPetalShape(), {
    depth: 0.3,
    steps: 1,
    curveSegments: 32,
    bevelEnabled: true,
    bevelSegments: 10,
    bevelSize: 0.15,
    bevelThickness: 0.14,
  });
  geometry.center();
  geometry.computeVertexNormals();
  return geometry;
}

function createPetalCoreGeometry(): ExtrudeGeometry {
  const geometry = new ExtrudeGeometry(createRoundedPetalShape(), {
    depth: 0.16,
    steps: 1,
    curveSegments: 32,
    bevelEnabled: true,
    bevelSegments: 8,
    bevelSize: 0.1,
    bevelThickness: 0.09,
  });
  geometry.center();
  geometry.scale(0.73, 0.77, 1);
  geometry.computeVertexNormals();
  return geometry;
}

function createBackdropMaterial(
  background: string,
  petalColor: string,
): ShaderMaterial {
  const base = new Color(background);
  const deep = base.clone().multiplyScalar(0.38);
  const tint = new Color(petalColor).lerp(base, 0.66);
  return new ShaderMaterial({
    uniforms: {
      baseColor: { value: base },
      deepColor: { value: deep },
      tintColor: { value: tint },
      time: { value: 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 baseColor;
      uniform vec3 deepColor;
      uniform vec3 tintColor;
      uniform float time;
      varying vec2 vUv;

      float hash(vec2 point) {
        return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453);
      }

      void main() {
        vec2 p = vUv - 0.5;
        p.x *= 1.76;
        float vignette = smoothstep(0.95, 0.13, length(p));
        float centerGlow = exp(-4.2 * dot(p, p));
        float driftingGlow = exp(-5.5 * dot(
          p - vec2(sin(time * 0.19) * 0.16, cos(time * 0.15) * 0.1),
          p - vec2(sin(time * 0.19) * 0.16, cos(time * 0.15) * 0.1)
        ));
        float grain = (hash(gl_FragCoord.xy) - 0.5) * 0.018;
        vec3 color = mix(deepColor, baseColor, 0.3 + vignette * 0.7);
        color = mix(color, tintColor, centerGlow * 0.24 + driftingGlow * 0.08);
        color += grain;
        gl_FragColor = vec4(color, 1.0);
      }
    `,
    depthWrite: false,
  });
}

function createPetal(
  index: number,
  count: number,
  props: FrostedPetalBloom3DProps,
  shellGeometry: BufferGeometry,
  coreGeometry: BufferGeometry,
  materials: Set<Material>,
): PetalRig {
  const angle = index / count * TAU;
  const variation = Math.sin(index * 12.9898 + 1.7);
  const shellColor = new Color(props.petalColor)
    .lerp(new Color("#fff4fb"), 0.04 + (variation + 1) * 0.025);
  const shellMaterial = new MeshPhysicalMaterial({
    color: shellColor.clone().lerp(new Color("#fffafd"), 0.28),
    roughness: 0.58 + props.frostiness * 0.38,
    metalness: 0,
    transmission: 0.58 - props.frostiness * 0.12,
    thickness: 1.28,
    ior: 1.31,
    attenuationColor: new Color(props.petalColor),
    attenuationDistance: 0.94,
    clearcoat: 0.32,
    clearcoatRoughness: 0.52 + props.frostiness * 0.22,
    sheen: 0.48,
    sheenColor: new Color(props.coreColor),
    sheenRoughness: 0.82,
    emissive: new Color(props.petalColor).multiplyScalar(0.06),
    emissiveIntensity: 0.08 * props.glow,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: DoubleSide,
  });
  materials.add(shellMaterial);

  const coreMaterial = new MeshPhysicalMaterial({
    color: new Color(props.petalColor).lerp(new Color(props.coreColor), 0.12),
    roughness: 0.64,
    metalness: 0,
    transmission: 0,
    thickness: 0.3,
    clearcoat: 0.18,
    clearcoatRoughness: 0.62,
    sheen: 0.5,
    sheenColor: new Color(props.coreColor),
    sheenRoughness: 0.76,
    emissive: new Color(props.petalColor).multiplyScalar(0.14),
    emissiveIntensity: 0.12 * props.glow,
    side: DoubleSide,
  });
  materials.add(coreMaterial);

  const group = new Group();
  const core = new Mesh(coreGeometry, coreMaterial);
  core.position.set(-0.02, -0.005, 0);
  const shell = new Mesh(shellGeometry, shellMaterial);
  shell.renderOrder = 1;
  group.add(core, shell);
  group.visible = false;

  return {
    group,
    shellMaterial,
    angle,
    delay: (index % 2) * 0.45 + index / count,
    radiusVariation: Math.sin(index * 2.17) * 0.08,
    scaleX: 0.84 + ((index * 7) % 5) * 0.018,
    scaleY: 0.88 + ((index * 11) % 4) * 0.016,
    depth: Math.sin(angle * 2.0 + 0.4) * 0.13,
    tilt: Math.sin(index * 1.73) * 0.105,
    phase: index * 1.61803398875,
  };
}

function updatePetal(
  petal: PetalRig,
  index: number,
  count: number,
  timeSeconds: number,
  props: FrostedPetalBloom3DProps,
): void {
  const rawProgress = petalBloomProgress(
    timeSeconds,
    index,
    count,
    props.bloomDuration,
  );
  const bloom = petalEaseOutBack(rawProgress);
  const fade = petalEaseInOutCubic(petalClamp01(rawProgress * 2.8));
  const fold = 1 - petalEaseInOutCubic(rawProgress);
  const pulse = Math.sin(Math.PI * rawProgress);
  const layoutScale = petalLayoutScale(count);
  const radius = (
    petalLayoutRadius(count) + petal.radiusVariation * 0.3
  ) * props.spread * bloom;
  const hover = Math.sin(timeSeconds * 0.62 + petal.phase) * 0.035 * fade;
  const selfTurn = Math.sin(timeSeconds * 0.48 + petal.phase) * 0.055 * fade;
  const selfRoll = Math.sin(timeSeconds * 0.37 + petal.phase * 0.7) * 0.075 * fade;

  petal.group.visible = rawProgress > 0.001;
  petal.group.position.set(
    Math.cos(petal.angle) * radius,
    Math.sin(petal.angle) * radius + hover,
    -0.72 * fold + petal.depth * bloom + pulse * 0.32,
  );
  petal.group.rotation.set(
    fold * (1.28 + (index % 2) * 0.12) + petal.tilt * bloom + selfRoll,
    fold * (index % 2 === 0 ? -0.52 : 0.52) + selfTurn,
    petal.angle - Math.PI / 2
      + (index % 2 === 0 ? -1 : 1) * 0.03
      + Math.sin(timeSeconds * 0.31 + petal.phase) * 0.026 * fade,
  );
  petal.group.scale.set(
    petal.scaleX * layoutScale * (0.035 + bloom * 0.965) * (1 + pulse * 0.04),
    petal.scaleY * layoutScale * (0.035 + bloom * 0.965) * (1 + pulse * 0.05),
    layoutScale * (0.12 + bloom * 0.88),
  );
  petal.shellMaterial.opacity = fade * 0.78;
}

function updateDust(
  rig: BloomRig,
  timeSeconds: number,
  bloomDuration: number,
  glow: number,
): void {
  const reveal = petalEaseInOutCubic(
    petalRange(timeSeconds, bloomDuration * 0.56, bloomDuration * 1.18),
  );
  let combinedOpacity = 0;
  for (const dust of rig.dust) {
    const twinkle = 0.35 + 0.65 * Math.max(
      0,
      Math.sin(timeSeconds * 1.1 + dust.phase),
    );
    const angle = dust.angle + Math.sin(timeSeconds * 0.22 + dust.phase) * 0.045;
    const radius = dust.radius * (0.72 + reveal * 0.28);
    dust.mesh.visible = reveal > 0.001;
    dust.mesh.position.set(
      Math.cos(angle) * radius,
      Math.sin(angle) * radius,
      dust.depth + Math.sin(timeSeconds * 0.46 + dust.phase) * 0.055,
    );
    dust.mesh.scale.setScalar(dust.size * (0.55 + twinkle * 0.45));
    combinedOpacity += twinkle;
  }
  rig.dustMaterial.opacity = rig.dust.length === 0
    ? 0
    : reveal * glow * 0.2 * combinedOpacity / rig.dust.length;
}

function PetalBloomScene({ props }: { props: FrostedPetalBloom3DProps }) {
  const rigRef = useRef<BloomRig | null>(null);

  return (
    <FourierCanvas
      ariaLabel="从画面中心旋转绽放的粉色毛玻璃 3D 花朵"
      style={{ background: props.background }}
      rendererOptions={{ antialias: true, alpha: false }}
      onCreate={({ renderer, scene, camera }) => {
        renderer.setClearColor(new Color(props.background), 1);
        renderer.toneMapping = ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.26;
        if (camera instanceof PerspectiveCamera) {
          camera.fov = 35;
          camera.near = 0.1;
          camera.far = 50;
          camera.position.set(0, 0.02, 9.8);
          camera.updateProjectionMatrix();
        } else {
          camera.position.set(0, 0.02, 9.8);
        }
        camera.lookAt(0, 0, 0);

        const geometries = new Set<BufferGeometry>();
        const materials = new Set<Material>();
        const root = new Group();
        root.rotation.x = -0.025;

        const petalShellGeometry = createPetalShellGeometry();
        const petalCoreGeometry = createPetalCoreGeometry();
        geometries.add(petalShellGeometry);
        geometries.add(petalCoreGeometry);
        const petalCount = Math.max(6, Math.min(14, Math.round(props.petalCount)));
        const petals = Array.from({ length: petalCount }, (_, index) => {
          const petal = createPetal(
            index,
            petalCount,
            props,
            petalShellGeometry,
            petalCoreGeometry,
            materials,
          );
          root.add(petal.group);
          return petal;
        });

        const dustGeometry = new SphereGeometry(0.022, 12, 8);
        geometries.add(dustGeometry);
        const dustMaterial = new MeshBasicMaterial({
          color: new Color(props.coreColor),
          transparent: true,
          opacity: 0,
          blending: AdditiveBlending,
          depthWrite: false,
        });
        materials.add(dustMaterial);
        const dust = Array.from({ length: 22 }, (_, index): DustRig => {
          const mesh = new Mesh(dustGeometry, dustMaterial);
          mesh.visible = false;
          root.add(mesh);
          return {
            mesh,
            angle: index * 2.399963229728653,
            radius: 0.9 + (index % 7) * 0.34,
            depth: -0.18 + (index % 5) * 0.085,
            phase: index * 1.41421356237,
            size: 0.42 + (index % 4) * 0.17,
          };
        });

        const backdropGeometry = new PlaneGeometry(18, 10.2);
        const backdropMaterial = createBackdropMaterial(
          props.background,
          props.petalColor,
        );
        geometries.add(backdropGeometry);
        materials.add(backdropMaterial);
        const backdrop = new Mesh(backdropGeometry, backdropMaterial);
        backdrop.position.z = -3.4;

        const ambient = new AmbientLight(0xffd7eb, 1.25);
        const hemisphere = new HemisphereLight(0xfff1fa, 0x3a0929, 1.75);
        const key = new DirectionalLight(0xffffff, 4.8);
        key.position.set(-3.8, 4.6, 6.5);
        const blush = new DirectionalLight(new Color(props.petalColor), 3.4);
        blush.position.set(4.2, -1.2, 4.8);
        const rim = new DirectionalLight(0x8f5bff, 2.2);
        rim.position.set(2.8, 2.4, -4.5);
        scene.add(backdrop, ambient, hemisphere, key, blush, rim, root);

        rigRef.current = {
          root,
          petals,
          dust,
          dustMaterial,
          backdropMaterial,
        };

        return () => {
          scene.remove(backdrop, ambient, hemisphere, key, blush, rim, root);
          for (const geometry of geometries) geometry.dispose();
          for (const material of materials) material.dispose();
          rigRef.current = null;
        };
      }}
      onFrame={({ timeSeconds }) => {
        const rig = rigRef.current;
        if (rig === null) return;
        const petalCount = rig.petals.length;
        for (let index = 0; index < petalCount; index += 1) {
          updatePetal(
            rig.petals[index]!,
            index,
            petalCount,
            timeSeconds,
            props,
          );
        }
        updateDust(rig, timeSeconds, props.bloomDuration, props.glow);
        rig.root.rotation.z = petalOrbitAngle(
          timeSeconds,
          props.bloomDuration,
          props.orbitTurns,
        );
        rig.root.rotation.y = Math.sin(timeSeconds * 0.28) * 0.035;
        rig.root.position.y = Math.sin(timeSeconds * 0.42) * 0.025;
        rig.backdropMaterial.uniforms.time!.value = timeSeconds;
      }}
    />
  );
}

export const FrostedPetalBloom3D = defineReact({
  name: "FrostedPetalBloom3D",
  schema: frostedPetalBloom3DSchema,
  component({ props }) {
    return <PetalBloomScene props={props} />;
  },
  designPreview() {
    return {
      props: {},
      composition: {
        width: 960,
        height: 540,
        durationSeconds: PREVIEW_DURATION_SECONDS,
      },
      player: { background: "#260719", loop: true },
    };
  },
});

export default FrostedPetalBloom3D;
