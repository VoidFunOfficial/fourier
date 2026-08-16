import {
  FourierMotion,
  defineMotion,
  defineSchema,
  field,
  useRef,
  type FourierVideoHandle,
  type InferFields,
} from "@fourier-video/sdk/motion";
import {
  AmbientLight,
  Color,
  DirectionalLight,
  ExtrudeGeometry,
  FourierCanvas,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Path,
  PlaneGeometry,
  Shape,
  type BufferGeometry,
  type Material,
} from "@fourier-video/sdk/three";

export const videoPanelSchema = defineSchema({
  yAngle: field.number({ min: -60, max: 60, default: 30, label: "Y 轴角度" }),
  xAngle: field.number({ min: -45, max: 45, default: 10, label: "X 轴角度" }),
  segmentDuration: field.number({
    min: 0.25,
    max: 5,
    default: 1.5,
    label: "单轴往返秒数",
  }),
  frameColor: field.color({ default: "#111827", label: "边框颜色" }),
});

export type VideoPanelProps = InferFields<typeof videoPanelSchema>;

function springStep(progress: number): number {
  const normalized = Math.min(1, Math.max(0, progress));
  if (normalized === 0) return 0;
  if (normalized === 1) return 1;
  return 1 - Math.exp(-6 * normalized) *
    (Math.cos(12 * normalized) + 0.5 * Math.sin(12 * normalized));
}

/** A deterministic spring-like excursion that starts and ends at zero. */
export function videoPanelSpringPulse(
  timeSeconds: number,
  startSeconds: number,
  durationSeconds: number,
  amplitude: number,
): number {
  const elapsed = timeSeconds - startSeconds;
  if (elapsed <= 0 || elapsed >= durationSeconds) return 0;
  const half = durationSeconds / 2;
  return elapsed <= half
    ? amplitude * springStep(elapsed / half)
    : amplitude * (1 - springStep((elapsed - half) / half));
}

function roundedRectangle(
  path: Shape | Path,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const right = x + width;
  const bottom = y + height;
  path.moveTo(x + radius, y);
  path.lineTo(right - radius, y);
  path.quadraticCurveTo(right, y, right, y + radius);
  path.lineTo(right, bottom - radius);
  path.quadraticCurveTo(right, bottom, right - radius, bottom);
  path.lineTo(x + radius, bottom);
  path.quadraticCurveTo(x, bottom, x, bottom - radius);
  path.lineTo(x, y + radius);
  path.quadraticCurveTo(x, y, x + radius, y);
}

function VideoPanelScene({
  video,
  props,
}: {
  video: Readonly<FourierVideoHandle>;
  props: VideoPanelProps;
}) {
  const panel = useRef<Group | null>(null);
  const surface = useRef<Mesh | null>(null);

  return (
    <FourierMotion>
      <FourierCanvas
        ariaLabel="FFmpeg composited 3D video panel"
        style={{ background: "transparent" }}
        videoSurface={{
          video,
          meshRef: surface,
          cornerRadiusRatio: 0.055,
        }}
        onCreate={({ renderer, scene, camera, width, height }) => {
          renderer.setClearColor(new Color(0x000000), 0);
          const aspect = width / height;
          const innerHeight = 3.2;
          const innerWidth = innerHeight * aspect;
          const shortEdge = Math.min(innerWidth, innerHeight);
          const border = shortEdge * 0.035;
          const cornerRadius = shortEdge * 0.055;
          const outerWidth = innerWidth + border * 2;
          const outerHeight = innerHeight + border * 2;

          const group = new Group();
          const videoGeometry = new PlaneGeometry(innerWidth, innerHeight);
          const videoMaterial = new MeshBasicMaterial({ color: 0x0b1020 });
          const videoMesh = new Mesh(videoGeometry, videoMaterial);
          videoMesh.position.z = 0.015;
          group.add(videoMesh);

          const frameShape = new Shape();
          roundedRectangle(
            frameShape,
            -outerWidth / 2,
            -outerHeight / 2,
            outerWidth,
            outerHeight,
            cornerRadius + border,
          );
          const hole = new Path();
          roundedRectangle(
            hole,
            -innerWidth / 2,
            -innerHeight / 2,
            innerWidth,
            innerHeight,
            cornerRadius,
          );
          frameShape.holes.push(hole);
          const frameGeometry = new ExtrudeGeometry(frameShape, {
            depth: shortEdge * 0.035,
            bevelEnabled: true,
            bevelSegments: 3,
            bevelSize: shortEdge * 0.008,
            bevelThickness: shortEdge * 0.006,
            curveSegments: 12,
          });
          frameGeometry.translate(0, 0, shortEdge * 0.01);
          const frameMaterial = new MeshStandardMaterial({
            color: new Color(props.frameColor),
            metalness: 0.18,
            roughness: 0.48,
          });
          group.add(new Mesh(frameGeometry, frameMaterial));

          const shadowGeometry = new PlaneGeometry(
            outerWidth * 1.035,
            outerHeight * 1.055,
          );
          const shadowMaterial = new MeshBasicMaterial({
            color: 0x000000,
            transparent: true,
            opacity: 0.18,
            depthWrite: false,
          });
          const shadow = new Mesh(shadowGeometry, shadowMaterial);
          shadow.position.set(0, -shortEdge * 0.035, -shortEdge * 0.08);
          group.add(shadow);

          scene.add(new AmbientLight(0xffffff, 1.8));
          const light = new DirectionalLight(0xffffff, 2.4);
          light.position.set(-3, 4, 6);
          scene.add(light, group);

          const fovRadians = (45 * Math.PI) / 180;
          const distance = (innerHeight / 2) / Math.tan(fovRadians / 2) / 0.86;
          camera.position.set(0, 0, distance);
          camera.lookAt(0, 0, 0);

          panel.current = group;
          surface.current = videoMesh;
          return () => {
            scene.remove(light, group);
            group.traverse((object) => {
              if (!(object instanceof Mesh)) return;
              (object.geometry as BufferGeometry).dispose();
              const materials = Array.isArray(object.material)
                ? object.material
                : [object.material];
              for (const material of materials as Material[]) material.dispose();
            });
            panel.current = null;
            surface.current = null;
          };
        }}
        onFrame={({ timeSeconds }) => {
          if (panel.current === null) return;
          const y = videoPanelSpringPulse(
            timeSeconds,
            0,
            props.segmentDuration,
            (props.yAngle * Math.PI) / 180,
          );
          const x = videoPanelSpringPulse(
            timeSeconds,
            props.segmentDuration,
            props.segmentDuration,
            (props.xAngle * Math.PI) / 180,
          );
          panel.current.rotation.set(x, y, 0);
        }}
      />
    </FourierMotion>
  );
}

export const VideoPanel = defineMotion({
  name: "VideoPanel",
  schema: videoPanelSchema,
  videoComposition: "ffmpeg",
  component({ video, props }) {
    return <VideoPanelScene video={video} props={props} />;
  },
  preview() {
    return { representativeProgress: 0.25, priority: "primary" };
  },
  designPreview() {
    return {
      props: {},
      composition: { width: 960, height: 540, durationSeconds: 5 },
      player: { background: "#030712", loop: true },
    };
  },
});

export default VideoPanel;
