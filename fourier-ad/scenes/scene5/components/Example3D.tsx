import "./Example3D.css";
import {
  ACESFilmicToneMapping,
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  FourierCanvas,
  GLTFLoader,
  Group,
  HemisphereLight,
  Mesh,
  Vector3,
  defineReact,
  defineSchema,
  field,
  useRef,
  type InferFields,
} from "@fourier-video/sdk/three";

export const example3DSchema = defineSchema({
  rotationTurns: field.number({
    min: -4,
    max: 4,
    default: 1,
    label: "Rotation turns",
  }),
  scale: field.number({
    min: 0.5,
    max: 1.5,
    default: 1,
    label: "Earth scale",
  }),
  background: field.color({ default: "#07111f", label: "Background" }),
});

type Example3DProps = InferFields<typeof example3DSchema>;

function earthModelDataUrl(): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue("--scene-five-earth-model")
    .trim();
  const match = /^url\(["']?(.*?)["']?\)$/.exec(value);
  if (match?.[1] === undefined || match[1] === "") {
    throw new Error("Example3D could not resolve its local Earth model");
  }
  return match[1];
}

function RotatingEarth({ props }: { props: Example3DProps }) {
  const earth = useRef<Group | null>(null);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        border: "2px solid #25242b",
        background: "transparent",
        color: "#25242b",
        fontFamily: "Inter, Arial, sans-serif",
      }}
    >
      <FourierCanvas
        ariaLabel="Rotating low-poly Earth"
        style={{ position: "absolute", inset: 0, background: "transparent" }}
        onCreate={async ({ renderer, scene, camera }) => {
        renderer.setClearColor(new Color(props.background), 0);
        renderer.toneMapping = ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.15;
        camera.position.set(0, 0.15, 5.2);
        camera.lookAt(0, 0, 0);

        scene.add(new AmbientLight(0x8aa6d8, 1.15));
        scene.add(new HemisphereLight(0xb9dcff, 0x15213d, 2.1));
        const keyLight = new DirectionalLight(0xffffff, 3.6);
        keyLight.position.set(3.5, 4, 5);
        scene.add(keyLight);
        const rimLight = new DirectionalLight(0x4f8cff, 2.4);
        rimLight.position.set(-4, 1, -3);
        scene.add(rimLight);

        const gltf = await new GLTFLoader().loadAsync(earthModelDataUrl());
        const model = gltf.scene;
        const bounds = new Box3().setFromObject(model);
        const center = bounds.getCenter(new Vector3());
        const size = bounds.getSize(new Vector3());
        const longestSide = Math.max(size.x, size.y, size.z);
        if (!Number.isFinite(longestSide) || longestSide <= 0) {
          throw new Error("Low Poly Earth GLB has no valid model bounds");
        }
        model.position.sub(center);
        model.scale.setScalar((3.15 * props.scale) / longestSide);

        const pivot = new Group();
        pivot.rotation.x = -0.12;
        pivot.add(model);
        scene.add(pivot);
        earth.current = pivot;

        return () => {
          scene.remove(pivot, keyLight, rimLight);
          model.traverse((object) => {
            if (!(object instanceof Mesh)) return;
            object.geometry.dispose();
            const materials = Array.isArray(object.material)
              ? object.material
              : [object.material];
            for (const material of materials) material.dispose();
          });
          earth.current = null;
        };
        }}
        onFrame={({ progress }) => {
          if (earth.current === null) return;
          earth.current.rotation.y = progress * props.rotationTurns * Math.PI * 2;
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 26,
          top: 24,
          color: "#6f5cff",
          fontSize: 13,
          fontWeight: 760,
          letterSpacing: ".14em",
          textTransform: "uppercase",
        }}
      >
        Example3D
      </div>
      <div
        style={{
          position: "absolute",
          left: 26,
          bottom: 25,
          fontSize: 24,
          fontWeight: 550,
          letterSpacing: "-.03em",
          color: "#25242b",
        }}
      >
        World in motion
      </div>
    </div>
  );
}

export const Example3D = defineReact({
  name: "Example3D",
  schema: example3DSchema,
  component({ props }) {
    return <RotatingEarth props={props} />;
  },
  designPreview() {
    return {
      props: {},
      composition: { width: 960, height: 540, durationSeconds: 6 },
      player: { background: "#020617", loop: true },
    };
  },
});

export default Example3D;
