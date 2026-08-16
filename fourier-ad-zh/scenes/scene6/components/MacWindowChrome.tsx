export const MAC_WINDOW_RADIUS = 28;
export const MAC_WINDOW_BORDER = "1px solid rgba(37,36,43,.18)";
export const MAC_WINDOW_SHADOW = "0 34px 86px rgba(17,19,24,.3), 0 3px 12px rgba(17,19,24,.16)";

const TRAFFIC_LIGHTS = ["#ff5f57", "#febc2e", "#28c840"] as const;

function MacTrafficLights() {
  return (
    <div aria-hidden="true" style={{ display: "flex", flex: "0 0 auto", gap: 9 }}>
      {TRAFFIC_LIGHTS.map((color) => (
        <span key={color} style={{ width: 15, height: 15, borderRadius: "50%", background: color, boxShadow: "inset 0 0 0 1px rgba(37,36,43,.14)" }} />
      ))}
    </div>
  );
}

export function MacBrowserToolbar({ url, height = 118, accent = "#4eaaa3" }: { url: string; height?: number; accent?: string }) {
  return (
    <div
      style={{
        position: "relative",
        height,
        display: "flex",
        alignItems: "center",
        gap: 22,
        padding: "0 30px",
        color: "#3f3d42",
        background: "#e9e7e2",
        borderBottom: "1px solid rgba(37,36,43,.14)",
        fontFamily: "Inter, Arial, sans-serif",
      }}
    >
      <MacTrafficLights />
      <div aria-hidden="true" style={{ display: "flex", gap: 12, color: "#77747b", fontSize: 25, lineHeight: 1 }}><span>‹</span><span>›</span></div>
      <div
        style={{
          flex: 1,
          height: 46,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          borderRadius: 12,
          color: "#3f3d42",
          background: "#f8f7f4",
          border: "1px solid rgba(37,36,43,.13)",
          boxShadow: "inset 0 1px 2px rgba(37,36,43,.05)",
          fontSize: 16,
          fontWeight: 600,
          letterSpacing: ".005em",
        }}
      >
        <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: accent }} />
        {url}
      </div>
      <div aria-hidden="true" style={{ width: 30, color: "#77747b", fontSize: 22, textAlign: "right" }}>⋯</div>
    </div>
  );
}
