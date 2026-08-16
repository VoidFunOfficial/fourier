import { panelBackground } from "./palette";

interface TimeValue {
  source: string;
  frames: number;
  seconds: number;
}

interface RenderContext {
  frame: number;
  localFrame: number;
  fps: number;
  timeSeconds: number;
  localTimeSeconds: number;
  width: number;
  height: number;
  seed: number;
}

interface Props {
  title: string;
  value: number;
  showTrend: boolean;
  accent: string;
  delay: TimeValue;
  renderContext: RenderContext;
}

export default function FullCoveragePanel({
  title,
  value,
  showTrend,
  accent,
  delay,
  renderContext,
}: Props) {
  const active = renderContext.localFrame >= delay.frames;
  const percentage = Math.round(value * 100);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "10px",
        borderRadius: "10px",
        background: panelBackground(accent, active),
        color: "#FFFFFF",
        fontFamily: "RenderEngineFallback",
      }}
    >
      <div style={{ display: "flex", fontSize: "13px" }}>{title}</div>
      <div style={{ display: "flex", fontSize: "25px", fontWeight: 700 }}>
        {percentage}%
      </div>
      {showTrend && (
        <div style={{ display: "flex", fontSize: "10px", opacity: 0.86 }}>
          frame {renderContext.localFrame} / seed {renderContext.seed % 1000}
        </div>
      )}
    </div>
  );
}
