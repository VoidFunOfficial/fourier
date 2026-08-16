import { defineReact } from "@fourier-video/sdk";
import { Universe, World, defineCamera } from "@fourier-video/sdk/universe";

const camera = defineCamera({
  width: 1920,
  height: 1080,
  initial: { x: 1_300, y: 520, zoom: 0.48, rotation: 0 },
  moves: [
    {
      at: "60f",
      duration: "90f",
      to: { kind: "fit", target: "backend", fit: "contain", padding: 220 },
      path: {
        kind: "bezier",
        control1: { x: 500, y: 100 },
        control2: { x: 720, y: 220 },
      },
      ease: "ease-in-out",
    },
    {
      at: "180f",
      duration: "90f",
      to: { kind: "fit", target: "render", fit: "contain", padding: 220 },
      path: { kind: "curve", points: [{ x: 1_100, y: 760 }] },
      ease: "ease-in-out",
    },
    {
      at: "300f",
      duration: "90f",
      to: { kind: "fit", target: "cache", fit: "contain", padding: 220 },
      path: { kind: "arc", center: { x: 1_700, y: 430 }, direction: "clockwise" },
      ease: "ease-in-out",
    },
    {
      at: "420f",
      duration: "60f",
      to: { kind: "fit", target: "gpu", fit: "contain", padding: 220 },
      ease: "ease-out",
    },
  ],
});

const modules = [
  { id: "backend", title: "Backend", detail: "Project compiler", x: 300, y: 260, color: "#22c55e" },
  { id: "render", title: "Render Engine", detail: "DOM timeline", x: 1_050, y: 720, color: "#38bdf8" },
  { id: "cache", title: "Visual Cache", detail: "Deterministic frames", x: 1_850, y: 260, color: "#a78bfa" },
  { id: "gpu", title: "GPU Worker", detail: "FFmpeg output", x: 2_650, y: 760, color: "#fb7185" },
] as const;

function ArchitectureDiagram() {
  return (
    <Universe camera={camera} overscan={0.3}>
      <World id="connections" x={1_475} y={510} width={2_750} height={800} zIndex={0} cull="never">
        <svg width="100%" height="100%" viewBox="0 0 2750 800" fill="none">
          <path d="M200 150 C550 150 520 610 850 610 S1290 150 1650 150 S2110 650 2450 650"
            stroke="#334155" strokeWidth="18" strokeLinecap="round" strokeDasharray="26 28" />
        </svg>
      </World>
      {modules.map((module) => (
        <World
          key={module.id}
          id={module.id}
          x={module.x}
          y={module.y}
          width={520}
          height={300}
          zIndex={1}
        >
          <article style={{
            width: "100%",
            height: "100%",
            padding: 42,
            borderRadius: 36,
            color: "#f8fafc",
            background: "linear-gradient(145deg, #111827, #0f172a)",
            border: `8px solid ${module.color}`,
            boxShadow: `0 28px 80px ${module.color}33`,
            fontFamily: "Inter, Arial, sans-serif",
          }}>
            <div style={{ color: module.color, fontSize: 26, fontWeight: 800, letterSpacing: 4 }}>
              FOURIER
            </div>
            <h2 style={{ margin: "22px 0 12px", fontSize: 56, lineHeight: 1 }}>{module.title}</h2>
            <p style={{ margin: 0, color: "#94a3b8", fontSize: 30 }}>{module.detail}</p>
          </article>
        </World>
      ))}
    </Universe>
  );
}

export const UniverseArchitecture = defineReact({
  name: "UniverseArchitecture",
  schema: {},
  component() { return <ArchitectureDiagram />; },
  designPreview() {
    return {
      props: {},
      composition: { width: 1920, height: 1080, durationSeconds: 8 },
      player: { background: "#020617", loop: true },
    };
  },
});

export default UniverseArchitecture;
