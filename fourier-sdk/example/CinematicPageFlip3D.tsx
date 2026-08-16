import poster1Url from "../placeholder/posters/poster1.png";
import poster2Url from "../placeholder/posters/poster2.png";
import poster3Url from "../placeholder/posters/poster3.png";
import poster4Url from "../placeholder/posters/poster4.png";
import poster5Url from "../placeholder/posters/poster5.png";
import poster6Url from "../placeholder/posters/poster6.png";
import poster7Url from "../placeholder/posters/poster7.png";
import poster8Url from "../placeholder/posters/poster8.png";
import poster9Url from "../placeholder/posters/poster9.png";
import poster10Url from "../placeholder/posters/poster10.png";
import poster11Url from "../placeholder/posters/poster11.png";
import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  Color,
  FourierCanvas,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  SRGBColorSpace,
  ShaderMaterial,
  TextureLoader,
  defineReact,
  defineSchema,
  field,
  useFourierContext,
  useRef,
  type BufferGeometry,
  type InferFields,
  type Material,
  type Texture,
} from "@fourier-video/sdk/three";
import { Universe, World, defineCamera } from "@fourier-video/sdk/universe";

const POSTER_WIDTH = 5.78;
const POSTER_HEIGHT = POSTER_WIDTH * 941 / 1672;
const POSTER_INTERVAL_SECONDS = 0.34;
const POSTER_SETTLE_SECONDS = 0.12;
const DOLLY_START_DISTANCE = 4.9;
const DOLLY_END_DISTANCE = 9.4;
const DOLLY_START_FOV = 45;

const camera = defineCamera({
  width: 1920,
  height: 1080,
  initial: { x: -70, y: 0, zoom: 1.02, rotation: 0 },
  moves: [{
    at: "0f",
    duration: "299f",
    to: { kind: "pose", x: 110, y: -18, zoom: 0.9, rotation: 0 },
    path: { kind: "linear" },
    ease: "linear",
  }],
});

export const cinematicPageFlip3DSchema = defineSchema({
  poster1: field.asset({
    accept: ["image/png", "image/jpeg", "image/webp"],
    default: poster1Url,
    label: "海报 1",
    description: "连续退镜中最先闪现的海报",
  }),
  poster2: field.asset({
    accept: ["image/png", "image/jpeg", "image/webp"],
    default: poster2Url,
    label: "海报 2",
  }),
  poster3: field.asset({
    accept: ["image/png", "image/jpeg", "image/webp"],
    default: poster3Url,
    label: "海报 3",
  }),
  poster4: field.asset({
    accept: ["image/png", "image/jpeg", "image/webp"],
    default: poster4Url,
    label: "海报 4",
  }),
  poster5: field.asset({
    accept: ["image/png", "image/jpeg", "image/webp"],
    default: poster5Url,
    label: "海报 5",
  }),
  poster6: field.asset({
    accept: ["image/png", "image/jpeg", "image/webp"],
    default: poster6Url,
    label: "海报 6",
  }),
  poster7: field.asset({
    accept: ["image/png", "image/jpeg", "image/webp"],
    default: poster7Url,
    label: "海报 7",
  }),
  poster8: field.asset({
    accept: ["image/png", "image/jpeg", "image/webp"],
    default: poster8Url,
    label: "海报 8",
  }),
  poster9: field.asset({
    accept: ["image/png", "image/jpeg", "image/webp"],
    default: poster9Url,
    label: "海报 9",
  }),
  poster10: field.asset({
    accept: ["image/png", "image/jpeg", "image/webp"],
    default: poster10Url,
    label: "海报 10",
  }),
  poster11: field.asset({
    accept: ["image/png", "image/jpeg", "image/webp"],
    default: poster11Url,
    label: "海报 11",
    description: "退镜结束后停留的最终海报",
  }),
  background: field.color({
    default: "#090706",
    label: "背景颜色",
  }),
  flashColor: field.color({
    default: "#fff7e8",
    label: "切换闪光",
  }),
  flashIntensity: field.number({
    min: 0,
    max: 1,
    default: 0.82,
    label: "闪光强度",
  }),
});

export type CinematicPageFlip3DProps = InferFields<
  typeof cinematicPageFlip3DSchema
>;

interface PosterRig {
  readonly group: Group;
  readonly material: ShaderMaterial;
}

interface MontageRig {
  readonly root: Group;
  readonly posters: readonly PosterRig[];
  readonly flash: Mesh;
  readonly flashMaterial: MeshBasicMaterial;
  readonly depthField: Group;
}

export function montageClamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function montageRange(
  timeSeconds: number,
  startSeconds: number,
  endSeconds: number,
): number {
  if (endSeconds <= startSeconds) return timeSeconds >= endSeconds ? 1 : 0;
  return montageClamp01(
    (timeSeconds - startSeconds) / (endSeconds - startSeconds),
  );
}

export function montageEaseOutQuint(value: number): number {
  const progress = montageClamp01(value);
  return 1 - (1 - progress) ** 5;
}

export function posterIndexAtTime(
  timeSeconds: number,
  posterCount: number,
): number {
  if (!Number.isInteger(posterCount) || posterCount <= 0) return 0;
  const index = Math.floor(Math.max(0, timeSeconds) / POSTER_INTERVAL_SECONDS);
  return Math.min(posterCount - 1, index);
}

export function posterFlashPulse(
  timeSeconds: number,
  posterCount: number,
): number {
  let pulse = 0;
  for (let index = 1; index < posterCount; index += 1) {
    const cut = index * POSTER_INTERVAL_SECONDS;
    const phase = montageRange(timeSeconds, cut - 0.045, cut + 0.055);
    const wave = phase <= 0 || phase >= 1
      ? 0
      : Math.sin(phase * Math.PI) ** 6;
    pulse = Math.max(pulse, wave);
  }
  return pulse;
}

export function hitchcockFovAtProgress(progress: number): number {
  const normalized = montageClamp01(progress);
  const distance = DOLLY_START_DISTANCE
    + (DOLLY_END_DISTANCE - DOLLY_START_DISTANCE) * normalized;
  const halfStartFov = DOLLY_START_FOV * Math.PI / 360;
  return Math.atan(
    DOLLY_START_DISTANCE * Math.tan(halfStartFov) / distance,
  ) * 360 / Math.PI;
}

function createMotionBlurMaterial(texture: Texture): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      image: { value: texture },
      blurAmount: { value: 0 },
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
      uniform float blurAmount;
      varying vec2 vUv;

      vec4 sampleImage(float offset) {
        vec2 velocity = vec2(blurAmount, blurAmount * 0.1);
        return texture2D(image, clamp(vUv + velocity * offset, 0.0, 1.0));
      }

      void main() {
        vec4 color = sampleImage(0.0) * 0.22;
        color += (sampleImage(-1.0) + sampleImage(1.0)) * 0.18;
        color += (sampleImage(-2.0) + sampleImage(2.0)) * 0.13;
        color += (sampleImage(-3.0) + sampleImage(3.0)) * 0.08;
        gl_FragColor = color;
      }
    `,
    toneMapped: false,
  });
}

function createPoster(
  texture: Texture,
  geometry: PlaneGeometry,
  materials: Set<Material>,
): PosterRig {
  const group = new Group();
  const material = createMotionBlurMaterial(texture);
  materials.add(material);
  group.add(new Mesh(geometry, material));
  group.visible = false;
  return { group, material };
}

function PosterMontageScene({
  textureUrls,
  props,
}: {
  readonly textureUrls: readonly string[];
  readonly props: CinematicPageFlip3DProps;
}) {
  const rigRef = useRef<MontageRig | null>(null);

  return (
    <FourierCanvas
      ariaLabel="连续希区柯克退镜海报蒙太奇"
      style={{ width: "100%", height: "100%", background: props.background }}
      onCreate={async ({ renderer, scene, camera: sceneCamera }) => {
        renderer.setClearColor(new Color(props.background), 1);
        renderer.toneMapping = ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.05;
        sceneCamera.position.set(0, 0, DOLLY_START_DISTANCE);
        sceneCamera.lookAt(0, 0, 0);

        const textures = await Promise.all(
          textureUrls.map((url) => new TextureLoader().loadAsync(url)),
        );
        const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        for (const texture of textures) {
          texture.colorSpace = SRGBColorSpace;
          texture.anisotropy = anisotropy;
        }

        const geometries = new Set<BufferGeometry>();
        const materials = new Set<Material>();
        const posterGeometry = new PlaneGeometry(
          POSTER_WIDTH,
          POSTER_HEIGHT,
          1,
          1,
        );
        const backgroundGeometry = new PlaneGeometry(22, 13, 1, 1);
        const depthGeometry = new PlaneGeometry(2.7, 14, 1, 1);
        const flashGeometry = new PlaneGeometry(18, 11, 1, 1);
        geometries.add(posterGeometry);
        geometries.add(backgroundGeometry);
        geometries.add(depthGeometry);
        geometries.add(flashGeometry);

        const root = new Group();
        const posters = textures.map((texture) => {
          const poster = createPoster(texture, posterGeometry, materials);
          root.add(poster.group);
          return poster;
        });

        const backgroundMaterial = new MeshBasicMaterial({
          color: new Color(props.background),
          toneMapped: false,
        });
        materials.add(backgroundMaterial);
        const background = new Mesh(backgroundGeometry, backgroundMaterial);
        background.position.z = -4.6;

        const depthField = new Group();
        for (let index = 0; index < 5; index += 1) {
          const color = new Color(props.background).offsetHSL(
            0,
            0,
            0.028 + index * 0.008,
          );
          const material = new MeshBasicMaterial({ color, toneMapped: false });
          materials.add(material);
          const panel = new Mesh(depthGeometry, material);
          panel.position.set(-7 + index * 3.5, (index % 2) * 0.5 - 0.25, -2.4 - index * 0.32);
          panel.rotation.z = -0.17;
          depthField.add(panel);
        }

        const flashMaterial = new MeshBasicMaterial({
          color: new Color(props.flashColor),
          transparent: true,
          opacity: 0,
          blending: AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        });
        materials.add(flashMaterial);
        const flash = new Mesh(flashGeometry, flashMaterial);
        flash.position.z = 3.4;
        flash.visible = false;
        flash.renderOrder = 100;

        scene.add(background, depthField, root, flash);
        rigRef.current = { root, posters, flash, flashMaterial, depthField };

        return () => {
          scene.remove(background, depthField, root, flash);
          for (const geometry of geometries) geometry.dispose();
          for (const material of materials) material.dispose();
          for (const texture of textures) texture.dispose();
          rigRef.current = null;
        };
      }}
      onFrame={({ timeSeconds, progress, camera: sceneCamera }) => {
        const rig = rigRef.current;
        if (rig === null) return;

        const activeIndex = posterIndexAtTime(timeSeconds, rig.posters.length);
        const activeStart = activeIndex * POSTER_INTERVAL_SECONDS;
        const settle = montageEaseOutQuint(montageRange(
          timeSeconds,
          activeStart,
          activeStart + POSTER_SETTLE_SECONDS,
        ));
        const pulse = posterFlashPulse(timeSeconds, rig.posters.length);

        for (let index = 0; index < rig.posters.length; index += 1) {
          const poster = rig.posters[index]!;
          poster.group.visible = index === activeIndex;
          poster.group.position.x = (1 - settle) * 0.28;
          poster.group.position.z = (1 - settle) * 0.1;
          poster.group.scale.setScalar(0.985 + settle * 0.015);
          poster.material.uniforms.blurAmount!.value = index === activeIndex
            ? (1 - settle) * 0.034 + pulse * 0.018
            : 0;
        }

        rig.root.position.x = -progress * 0.18;
        rig.root.position.y = progress * 0.035;
        rig.depthField.position.x = progress * 0.42;
        rig.flash.visible = pulse > 0.001;
        rig.flashMaterial.opacity = pulse * props.flashIntensity * 0.74;

        const distance = DOLLY_START_DISTANCE
          + (DOLLY_END_DISTANCE - DOLLY_START_DISTANCE) * progress;
        sceneCamera.position.set(progress * 0.34, -progress * 0.07, distance);
        sceneCamera.lookAt(progress * 0.11, -progress * 0.025, 0);
        if (sceneCamera instanceof PerspectiveCamera) {
          sceneCamera.fov = hitchcockFovAtProgress(progress);
          sceneCamera.updateProjectionMatrix();
        }
      }}
    />
  );
}

function CinematicPageFlipScene({ props }: { props: CinematicPageFlip3DProps }) {
  const { width, height } = useFourierContext();
  const posters = [
    props.poster1,
    props.poster2,
    props.poster3,
    props.poster4,
    props.poster5,
    props.poster6,
    props.poster7,
    props.poster8,
    props.poster9,
    props.poster10,
    props.poster11,
  ];

  return (
    <div style={{
      position: "relative",
      width,
      height,
      overflow: "hidden",
      background: props.background,
    }}>
      <Universe camera={camera} overscan={0.35}>
        <World
          id="depth-background"
          x={0}
          y={0}
          width={5_200}
          height={3_000}
          zIndex={-10}
          cull="never"
        >
          <div style={{
            width: "100%",
            height: "100%",
            background: [
              "radial-gradient(circle at 52% 48%, #ffffff0d 0, transparent 36%)",
              "repeating-linear-gradient(116deg, transparent 0 110px, #ffffff08 112px 114px)",
              `linear-gradient(135deg, ${props.background}, #171310 48%, ${props.background})`,
            ].join(","),
          }} />
        </World>
        <World
          id="poster-montage"
          x={0}
          y={0}
          width={1920}
          height={1080}
          zIndex={2}
          cull="never"
        >
          <div style={{
            position: "relative",
            width: "100%",
            height: "100%",
            overflow: "hidden",
            background: props.background,
          }}>
            <PosterMontageScene textureUrls={posters} props={props} />
            <div style={{
              position: "absolute",
              inset: 0,
              background: "radial-gradient(circle at 48% 48%, transparent 48%, #0009 100%)",
              pointerEvents: "none",
            }} />
          </div>
        </World>
      </Universe>
    </div>
  );
}

export const CinematicPageFlip3D = defineReact({
  name: "CinematicPageFlip3D",
  schema: cinematicPageFlip3DSchema,
  component({ props }) {
    return <CinematicPageFlipScene props={props} />;
  },
  designPreview() {
    return {
      props: {},
      composition: { width: 1920, height: 1080, durationSeconds: 5 },
      player: { background: "#090706", loop: false },
    };
  },
});

export default CinematicPageFlip3D;
