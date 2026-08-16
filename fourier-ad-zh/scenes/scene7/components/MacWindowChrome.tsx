export const MAC_WINDOW_RADIUS = 28;
export const MAC_WINDOW_BORDER = "1px solid rgba(37,36,43,.18)";
export const MAC_WINDOW_SHADOW = "0 34px 86px rgba(17,19,24,.3), 0 3px 12px rgba(17,19,24,.16)";

const TRAFFIC_LIGHTS = ["#ff5f57", "#febc2e", "#28c840"] as const;

export function MacDocumentTitlebar({ title, fontFamily }: { title: string; fontFamily: string }) {
  return (
    <div
      style={{
        position: "relative",
        height: 86,
        display: "flex",
        alignItems: "center",
        padding: "0 30px",
        color: "#3f3d42",
        background: "#e9e7e2",
        borderBottom: "1px solid rgba(37,36,43,.14)",
        fontFamily,
      }}
    >
      <div aria-hidden="true" style={{ display: "flex", flex: "0 0 auto", gap: 10 }}>
        {TRAFFIC_LIGHTS.map((color) => (
          <span key={color} style={{ width: 16, height: 16, borderRadius: "50%", background: color, boxShadow: "inset 0 0 0 1px rgba(37,36,43,.14)" }} />
        ))}
      </div>
      <div
        style={{
          position: "absolute",
          left: 150,
          right: 150,
          overflow: "hidden",
          textAlign: "center",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          fontSize: 17,
          fontWeight: 650,
          letterSpacing: ".01em",
          pointerEvents: "none",
        }}
      >
        {title}
      </div>
    </div>
  );
}
