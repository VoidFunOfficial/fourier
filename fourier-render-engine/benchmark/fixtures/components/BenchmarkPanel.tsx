interface TimeValue {
  frames: number;
}

interface RenderContext {
  localFrame: number;
  fps: number;
  width: number;
  height: number;
  seed: number;
}

interface BenchmarkPanelProps {
  title: string;
  value: number;
  showGrid: boolean;
  accent: string;
  delay: TimeValue;
  renderContext: RenderContext;
}

export default function BenchmarkPanel({
  title,
  value,
  showGrid,
  accent,
  delay,
  renderContext,
}: BenchmarkPanelProps) {
  const active = renderContext.localFrame >= delay.frames;
  const progress =
    (renderContext.localFrame + 1) /
    Math.max(1, Math.round(renderContext.fps * 0.8));
  const barWidth = `${Math.min(100, Math.max(8, progress * 100))}%`;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "7%",
        borderRadius: "8%",
        background: active ? "#0F172AEF" : "#111827D8",
        color: "#FFFFFF",
        fontFamily: "RenderEngineFallback",
        border: `3px solid ${accent}`,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: Math.max(16, Math.round(renderContext.height * 0.09)),
        }}
      >
        <span>{title}</span>
        <span>{Math.round(value * 100)}%</span>
      </div>
      {showGrid && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: Math.max(4, Math.round(renderContext.height * 0.025)),
            opacity: 0.8,
          }}
        >
          {[0.34, 0.57, 0.76].map((width, index) => (
            <div
              key={index}
              style={{
                display: "flex",
                width: `${width * 100}%`,
                height: Math.max(4, Math.round(renderContext.height * 0.018)),
                background: accent,
              }}
            />
          ))}
        </div>
      )}
      <div
        style={{
          display: "flex",
          width: "100%",
          height: Math.max(10, Math.round(renderContext.height * 0.05)),
          background: "#334155",
          borderRadius: 999,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            width: barWidth,
            height: "100%",
            background: accent,
          }}
        />
      </div>
      <div
        style={{
          display: "flex",
          fontSize: Math.max(10, Math.round(renderContext.height * 0.045)),
          opacity: 0.7,
        }}
      >
        frame {renderContext.localFrame} · seed {renderContext.seed % 10000}
      </div>
    </div>
  );
}
