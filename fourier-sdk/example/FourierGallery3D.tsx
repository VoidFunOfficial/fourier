import image1Url from "../placeholder/pic/1.png";
import image2Url from "../placeholder/pic/2.png";
import image3Url from "../placeholder/pic/3.png";
import image4Url from "../placeholder/pic/4.png";
import image5Url from "../placeholder/pic/5.png";
import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  AmbientLight,
  Color,
  DirectionalLight,
  DoubleSide,
  ExtrudeGeometry,
  Fog,
  FourierCanvas,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  PlaneGeometry,
  ShaderMaterial,
  Shape,
  SphereGeometry,
  SRGBColorSpace,
  TextureLoader,
  TorusGeometry,
  defineReact,
  defineSchema,
  field,
  useRef,
  type BufferGeometry,
  type InferFields,
  type Material,
  type Texture,
} from "@fourier-video/sdk/three";

const DEGREE = Math.PI / 180;
const CARD_ASPECT = 1122 / 1402;
const CARD_HEIGHT = 1.72;
const CARD_WIDTH = CARD_HEIGHT * CARD_ASPECT;

export const fourierGallery3DSchema = defineSchema({
  image1: field.asset({
    accept: ["image/png", "image/jpeg", "image/webp"],
    default: image1Url,
    label: "主图",
    description: "第一张从中心白点飞出的图片",
  }),
  image2: field.asset({
    accept: ["image/png", "image/jpeg", "image/webp"],
    default: image2Url,
    label: "图片 2",
  }),
  image3: field.asset({
    accept: ["image/png", "image/jpeg", "image/webp"],
    default: image3Url,
    label: "图片 3",
  }),
  image4: field.asset({
    accept: ["image/png", "image/jpeg", "image/webp"],
    default: image4Url,
    label: "图片 4",
  }),
  image5: field.asset({
    accept: ["image/png", "image/jpeg", "image/webp"],
    default: image5Url,
    label: "图片 5",
  }),
  background: field.color({
    default: "#08090c",
    label: "背景颜色",
  }),
  orbitDegrees: field.number({
    min: 20,
    max: 120,
    default: 60,
    label: "整体 Z 轴旋转角度",
    description: "全部图片围绕画面中心隐藏轴旋转的角度",
  }),
  spread: field.number({
    min: 0.7,
    max: 1.25,
    default: 1,
    label: "图片散开幅度",
  }),
  pace: field.number({
    min: 0.75,
    max: 1.35,
    default: 1,
    label: "动画舒缓程度",
    description: "数值越大，入场越舒缓",
  }),
});

export type FourierGallery3DProps = InferFields<typeof fourierGallery3DSchema>;

interface CardTarget {
  readonly position: readonly [number, number, number];
  readonly rotation: readonly [number, number, number];
  readonly scale: number;
  readonly curve: number;
}

interface CardRig {
  readonly group: Group;
  readonly imageMaterial: ShaderMaterial;
  readonly frameMaterial: MeshPhysicalMaterial;
  readonly shadowMaterial: MeshBasicMaterial;
}

interface ParticleRig {
  readonly mesh: Mesh;
  readonly angle: number;
  readonly distance: number;
  readonly lift: number;
  readonly delay: number;
}

interface GalleryRig {
  readonly root: Group;
  readonly cards: readonly CardRig[];
  readonly source: Group;
  readonly sourceCore: MeshBasicMaterial;
  readonly sourceHalo: MeshBasicMaterial;
  readonly orbitRing: MeshBasicMaterial;
  readonly particles: readonly ParticleRig[];
}

const CARD_TARGETS: readonly CardTarget[] = [
  {
    position: [0.37, -0.25, 0.96],
    rotation: [-1.5 * DEGREE, 2.5 * DEGREE, -2 * DEGREE],
    scale: 1.16,
    curve: 0,
  },
  {
    position: [-0.28, 2.38, -0.08],
    rotation: [-5 * DEGREE, 9 * DEGREE, -2.5 * DEGREE],
    scale: 0.86,
    curve: -0.24,
  },
  {
    position: [1.92, -1.43, -0.72],
    rotation: [4 * DEGREE, -9 * DEGREE, 2 * DEGREE],
    scale: 0.76,
    curve: 0.28,
  },
  {
    position: [-1.86, 0.72, 0.38],
    rotation: [5 * DEGREE, 8 * DEGREE, 1.5 * DEGREE],
    scale: 0.92,
    curve: 0.2,
  },
  {
    position: [-0.26, -2.05, -0.42],
    rotation: [-4 * DEGREE, -8 * DEGREE, -2 * DEGREE],
    scale: 0.8,
    curve: -0.22,
  },
] as const;

export function galleryClamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function galleryRange(
  timeSeconds: number,
  startSeconds: number,
  endSeconds: number,
): number {
  if (endSeconds <= startSeconds) return timeSeconds >= endSeconds ? 1 : 0;
  return galleryClamp01(
    (timeSeconds - startSeconds) / (endSeconds - startSeconds),
  );
}

export function galleryEaseOutQuint(value: number): number {
  const progress = galleryClamp01(value);
  return 1 - (1 - progress) ** 5;
}

export function galleryEaseInOutCubic(value: number): number {
  const progress = galleryClamp01(value);
  return progress < 0.5
    ? 4 * progress ** 3
    : 1 - (-2 * progress + 2) ** 3 / 2;
}

/** Whole-gallery rotation around the invisible center Z axis. */
export function galleryOrbitAngle(
  timeSeconds: number,
  orbitDegrees: number,
  pace: number,
): number {
  const lead = galleryEaseInOutCubic(
    galleryRange(timeSeconds, 0.82 * pace, 2.18 * pace),
  ) * orbitDegrees * DEGREE;
  const breathing = Math.sin((timeSeconds - 2.18 * pace) * 0.46)
    * 3.2 * DEGREE
    * galleryRange(timeSeconds, 2.18 * pace, 3.15 * pace);
  return lead + breathing;
}

/** Counter-rotates a card so its portrait edge stays visually upright. */
export function galleryUprightCompensation(
  axisAngle: number,
  timeSeconds: number,
  index: number,
): number {
  const subtleLean = Math.sin(timeSeconds * 0.55 + index * 1.21)
    * (index === 0 ? 0.8 : 1.7) * DEGREE;
  return -axisAngle + subtleLean;
}

function roundedRectangleShape(
  width: number,
  height: number,
  radius: number,
): Shape {
  const left = -width / 2;
  const right = width / 2;
  const top = height / 2;
  const bottom = -height / 2;
  const shape = new Shape();
  shape.moveTo(left + radius, bottom);
  shape.lineTo(right - radius, bottom);
  shape.quadraticCurveTo(right, bottom, right, bottom + radius);
  shape.lineTo(right, top - radius);
  shape.quadraticCurveTo(right, top, right - radius, top);
  shape.lineTo(left + radius, top);
  shape.quadraticCurveTo(left, top, left, top - radius);
  shape.lineTo(left, bottom + radius);
  shape.quadraticCurveTo(left, bottom, left + radius, bottom);
  return shape;
}

function createImageMaterial(texture: Texture): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      image: { value: texture },
      opacity: { value: 0 },
      aspect: { value: CARD_ASPECT },
      radius: { value: 0.055 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D image;
      uniform float opacity;
      uniform float aspect;
      uniform float radius;
      varying vec2 vUv;

      float roundedRectMask(vec2 uv) {
        vec2 point = abs(vec2((uv.x - 0.5) * aspect, uv.y - 0.5));
        vec2 bounds = vec2(aspect * 0.5 - radius, 0.5 - radius);
        vec2 delta = point - bounds;
        float distance = length(max(delta, 0.0))
          + min(max(delta.x, delta.y), 0.0) - radius;
        return 1.0 - smoothstep(-0.004, 0.004, distance);
      }

      void main() {
        float mask = roundedRectMask(vUv);
        if (mask < 0.01) discard;
        vec4 color = texture2D(image, vUv);
        gl_FragColor = vec4(color.rgb, color.a * mask * opacity);
      }
    `,
    transparent: true,
    depthWrite: true,
    side: DoubleSide,
  });
}

function setCardOpacity(card: CardRig, opacity: number): void {
  const value = galleryClamp01(opacity);
  card.imageMaterial.uniforms.opacity!.value = value;
  card.frameMaterial.opacity = value;
  card.shadowMaterial.opacity = value * 0.16;
}

function createCard(
  texture: Texture,
  geometries: Set<BufferGeometry>,
  materials: Set<Material>,
): CardRig {
  const group = new Group();
  const planeGeometry = new PlaneGeometry(CARD_WIDTH, CARD_HEIGHT, 1, 1);
  geometries.add(planeGeometry);
  const imageMaterial = createImageMaterial(texture);
  materials.add(imageMaterial);
  const image = new Mesh(planeGeometry, imageMaterial);
  image.position.z = 0.055;
  group.add(image);

  const border = 0.075;
  const frameShape = roundedRectangleShape(
    CARD_WIDTH + border * 2,
    CARD_HEIGHT + border * 2,
    0.12,
  );
  const frameGeometry = new ExtrudeGeometry(frameShape, {
    depth: 0.07,
    bevelEnabled: true,
    bevelSegments: 4,
    bevelSize: 0.018,
    bevelThickness: 0.014,
    curveSegments: 16,
  });
  frameGeometry.translate(0, 0, -0.075);
  geometries.add(frameGeometry);
  const frameMaterial = new MeshPhysicalMaterial({
    color: new Color("#ddd7ca"),
    metalness: 0.2,
    roughness: 0.42,
    clearcoat: 0.42,
    clearcoatRoughness: 0.5,
    transparent: true,
    opacity: 0,
  });
  materials.add(frameMaterial);
  group.add(new Mesh(frameGeometry, frameMaterial));

  const shadowGeometry = new PlaneGeometry(CARD_WIDTH * 1.12, CARD_HEIGHT * 1.12);
  geometries.add(shadowGeometry);
  const shadowMaterial = new MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: DoubleSide,
  });
  materials.add(shadowMaterial);
  const shadow = new Mesh(shadowGeometry, shadowMaterial);
  shadow.position.set(0.04, -0.075, -0.11);
  group.add(shadow);

  group.visible = false;
  return { group, imageMaterial, frameMaterial, shadowMaterial };
}

function updateHero(
  card: CardRig,
  timeSeconds: number,
  props: FourierGallery3DProps,
): void {
  const pace = props.pace;
  const appear = galleryEaseOutQuint(galleryRange(timeSeconds, 0.28, 1.35 * pace));
  const orbit = galleryEaseInOutCubic(
    galleryRange(timeSeconds, 0.82 * pace, 2.18 * pace),
  );
  const target = CARD_TARGETS[0]!;
  const depthScale = target.scale * (1 + Math.max(0, target.position[2]) * 0.12);
  const scale = depthScale * (0.012 + appear * 0.988)
    * (1 + Math.sin(Math.PI * appear) * 0.08);
  const hover = Math.sin((timeSeconds - 2.1) * 0.72) * 0.022
    * galleryRange(timeSeconds, 1.9, 2.7);

  card.group.visible = appear > 0.001;
  card.group.scale.setScalar(scale);
  card.group.position.set(
    target.position[0] * appear,
    target.position[1] * appear + hover + Math.sin(Math.PI * appear) * 0.1,
    -2.7 + (target.position[2] + 2.7) * appear
      + Math.sin(Math.PI * appear) * 0.34,
  );
  card.group.rotation.set(
    34 * DEGREE * (1 - appear) + target.rotation[0],
    -24 * DEGREE * (1 - appear) + target.rotation[1],
    target.rotation[2] - 4 * DEGREE * (1 - orbit),
  );
  setCardOpacity(card, galleryClamp01(appear * 1.5));
}

function updateSecondaryCard(
  card: CardRig,
  index: number,
  timeSeconds: number,
  props: FourierGallery3DProps,
): void {
  const target = CARD_TARGETS[index]!;
  const start = 2.02 * props.pace + (index - 1) * 0.13 * props.pace;
  const progress = galleryRange(timeSeconds, start, start + 1.48 * props.pace);
  const eased = galleryEaseOutQuint(progress);
  const arc = Math.sin(Math.PI * progress);
  const targetX = target.position[0] * props.spread;
  const targetY = target.position[1] * props.spread;
  const phase = index * 1.37;
  const hover = Math.sin(timeSeconds * 0.68 + phase) * 0.026 * eased;
  const startingRotation = (index % 2 === 0 ? 4 : -4) * DEGREE;
  const depthScale = target.scale * (1 + Math.max(0, target.position[2]) * 0.12);

  card.group.visible = progress > 0.001;
  card.group.position.set(
    targetX * eased + target.curve * arc,
    targetY * eased + arc * (0.56 + index * 0.035) + hover,
    -1.85 * (1 - eased) + target.position[2] * eased + arc * 0.62,
  );
  card.group.scale.setScalar(
    depthScale * (0.018 + eased * 0.982) * (1 + arc * 0.065),
  );
  card.group.rotation.set(
    target.rotation[0] * eased + 26 * DEGREE * (1 - eased),
    target.rotation[1] * eased + (index % 2 === 0 ? -1 : 1)
      * 30 * DEGREE * (1 - eased),
    startingRotation * (1 - eased) + target.rotation[2] * eased,
  );
  setCardOpacity(card, galleryClamp01(progress * 2.8));
}

function updateSource(rig: GalleryRig, timeSeconds: number, pace: number): void {
  const firstFade = 1 - galleryRange(timeSeconds, 0.34, 1.1 * pace);
  const burstProgress = galleryRange(timeSeconds, 1.82 * pace, 2.82 * pace);
  const burst = Math.sin(Math.PI * burstProgress);
  const opacity = Math.max(firstFade, burst * 0.86);
  const pulse = 1 + Math.sin(timeSeconds * 3.2) * 0.09 + burst * 1.7;

  rig.source.visible = opacity > 0.002;
  rig.source.scale.setScalar(pulse);
  rig.sourceCore.opacity = opacity;
  rig.sourceHalo.opacity = opacity * 0.14;
  rig.orbitRing.opacity = Math.sin(
    Math.PI * galleryRange(timeSeconds, 0.72 * pace, 2.25 * pace),
  ) * 0.18;

  const ringScale = 0.28 + galleryEaseOutQuint(
    galleryRange(timeSeconds, 0.72 * pace, 2.25 * pace),
  ) * 2.8;
  const ring = rig.source.children[2];
  if (ring !== undefined) ring.scale.setScalar(ringScale / pulse);
}

function updateParticles(
  particles: readonly ParticleRig[],
  timeSeconds: number,
  pace: number,
): void {
  for (const particle of particles) {
    const start = 1.94 * pace + particle.delay * pace;
    const progress = galleryRange(timeSeconds, start, start + 1.22 * pace);
    const eased = galleryEaseOutQuint(progress);
    const arc = Math.sin(Math.PI * progress);
    particle.mesh.visible = progress > 0.001 && progress < 0.999;
    particle.mesh.position.set(
      Math.cos(particle.angle) * particle.distance * eased,
      Math.sin(particle.angle) * particle.distance * eased + arc * particle.lift,
      arc * 0.72 - eased * 0.26,
    );
    const scale = (1 - progress) * (0.55 + particle.distance * 0.15);
    particle.mesh.scale.setScalar(scale);
  }
}

function GalleryScene({ props }: { props: FourierGallery3DProps }) {
  const rigRef = useRef<GalleryRig | null>(null);

  return (
    <FourierCanvas
      ariaLabel="从中心白点舒缓喷涌而出的 3D 图片画廊"
      style={{ background: props.background }}
      onCreate={async ({ renderer, scene, camera }) => {
        renderer.setClearColor(new Color(props.background), 1);
        renderer.toneMapping = ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.04;
        scene.fog = new Fog(props.background, 7.4, 12.5);
        camera.position.set(0, 0.08, 7.65);
        camera.lookAt(0, 0, 0);

        const textureUrls = [
          props.image1,
          props.image2,
          props.image3,
          props.image4,
          props.image5,
        ];
        const textures = await Promise.all(
          textureUrls.map((url) => new TextureLoader().loadAsync(url)),
        );
        for (const texture of textures) {
          texture.colorSpace = SRGBColorSpace;
          texture.anisotropy = Math.min(
            8,
            renderer.capabilities.getMaxAnisotropy(),
          );
        }

        const geometries = new Set<BufferGeometry>();
        const materials = new Set<Material>();
        const root = new Group();
        const cards = textures.map((texture) => {
          const card = createCard(texture, geometries, materials);
          root.add(card.group);
          return card;
        });

        const source = new Group();
        const coreGeometry = new SphereGeometry(0.035, 24, 16);
        const haloGeometry = new SphereGeometry(0.13, 24, 16);
        const ringGeometry = new TorusGeometry(0.19, 0.006, 12, 96);
        geometries.add(coreGeometry);
        geometries.add(haloGeometry);
        geometries.add(ringGeometry);
        const sourceCore = new MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 1,
          blending: AdditiveBlending,
          depthWrite: false,
        });
        const sourceHalo = new MeshBasicMaterial({
          color: 0xf5e6c8,
          transparent: true,
          opacity: 0.14,
          blending: AdditiveBlending,
          depthWrite: false,
        });
        const orbitRing = new MeshBasicMaterial({
          color: 0xf5e6c8,
          transparent: true,
          opacity: 0,
          blending: AdditiveBlending,
          depthWrite: false,
        });
        materials.add(sourceCore);
        materials.add(sourceHalo);
        materials.add(orbitRing);
        source.add(
          new Mesh(coreGeometry, sourceCore),
          new Mesh(haloGeometry, sourceHalo),
          new Mesh(ringGeometry, orbitRing),
        );
        source.position.z = 0.82;
        root.add(source);

        const particleGeometry = new SphereGeometry(0.018, 12, 8);
        geometries.add(particleGeometry);
        const particleMaterial = new MeshBasicMaterial({
          color: 0xe8ddc6,
          transparent: true,
          opacity: 0.42,
          blending: AdditiveBlending,
          depthWrite: false,
        });
        materials.add(particleMaterial);
        const particles = Array.from({ length: 14 }, (_, index): ParticleRig => {
          const mesh = new Mesh(particleGeometry, particleMaterial);
          mesh.visible = false;
          root.add(mesh);
          return {
            mesh,
            angle: index * 2.399963229728653 + 0.28,
            distance: 1.2 + (index % 5) * 0.31,
            lift: 0.18 + (index % 4) * 0.08,
            delay: (index % 7) * 0.035,
          };
        });

        const ambient = new AmbientLight(0xdce6ff, 1.55);
        const key = new DirectionalLight(0xfff4de, 4.1);
        key.position.set(-3.2, 4.8, 6.2);
        const rim = new DirectionalLight(0x7b8fae, 2.4);
        rim.position.set(4.5, 1.5, -3.2);
        scene.add(ambient, key, rim, root);

        rigRef.current = {
          root,
          cards,
          source,
          sourceCore,
          sourceHalo,
          orbitRing,
          particles,
        };

        return () => {
          scene.remove(ambient, key, rim, root);
          for (const geometry of geometries) geometry.dispose();
          for (const material of materials) material.dispose();
          for (const texture of textures) texture.dispose();
          scene.fog = null;
          rigRef.current = null;
        };
      }}
      onFrame={({ timeSeconds }) => {
        const rig = rigRef.current;
        if (rig === null) return;
        const axisAngle = galleryOrbitAngle(
          timeSeconds,
          props.orbitDegrees,
          props.pace,
        );
        updateHero(rig.cards[0]!, timeSeconds, props);
        for (let index = 1; index < rig.cards.length; index += 1) {
          updateSecondaryCard(rig.cards[index]!, index, timeSeconds, props);
        }
        for (let index = 0; index < rig.cards.length; index += 1) {
          const card = rig.cards[index]!;
          card.group.rotation.z += galleryUprightCompensation(
            axisAngle,
            timeSeconds,
            index,
          );
        }
        updateSource(rig, timeSeconds, props.pace);
        updateParticles(rig.particles, timeSeconds, props.pace);
        rig.root.rotation.z = axisAngle;
        rig.root.rotation.y = Math.sin(timeSeconds * 0.32) * 0.008;
      }}
    />
  );
}

export const FourierGallery3D = defineReact({
  name: "FourierGallery3D",
  schema: fourierGallery3DSchema,
  component({ props }) {
    return <GalleryScene props={props} />;
  },
  designPreview() {
    return {
      props: {},
      composition: { width: 960, height: 540, durationSeconds: 7 },
      player: { background: "#08090c", loop: false },
    };
  },
});

export default FourierGallery3D;
