import {
  defineReact,
  defineSchema,
  field,
  useFourierContext,
  type InferFields,
  type ReactNode,
} from "@fourier-video/sdk/react";
import placeholderIconUrl from "../placeholder/pic/human.png";
import placeholderImageUrl from "../placeholder/pic/4.png";

export const windows7WindowSchema = defineSchema({
  title: field.node({ label: "标题节点", description: "字符串、图片或组合 React 节点。" }),
  icon: field.node({ label: "标题栏图标" }),
  content: field.node({ label: "窗口内容", description: "图片或复杂 React 节点树。" }),
  windowWidth: field.number({ min: 260, default: 760 }),
  windowHeight: field.number({ min: 180, default: 430 }),
  active: field.boolean({ default: true }),
});

export type Windows7WindowProps = InferFields<typeof windows7WindowSchema>;

function ControlButton({
  kind,
}: {
  kind: "minimize" | "maximize" | "close";
}): ReactNode {
  const isClose = kind === "close";
  return (
    <div
      style={{
        position: "relative",
        width: isClose ? 48 : 30,
        height: 24,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        borderLeft: "1px solid rgba(255,255,255,0.42)",
        borderBottom: "1px solid rgba(5,32,70,0.72)",
        background: isClose
          ? "linear-gradient(to bottom, #ee9a91 0%, #c54437 48%, #8e1d15 52%, #df6659 100%)"
          : "linear-gradient(to bottom, rgba(255,255,255,0.72) 0%, rgba(116,174,218,0.52) 48%, rgba(31,93,145,0.64) 52%, rgba(119,184,229,0.5) 100%)",
      }}
    >
      {kind === "minimize" ? (
        <div
          style={{
            width: 10,
            height: 2,
            display: "flex",
            marginTop: 7,
            background: "#f5fbff",
            boxShadow: "0 1px 0 rgba(0,29,61,0.9)",
          }}
        />
      ) : null}
      {kind === "maximize" ? (
        <div
          style={{
            width: 10,
            height: 9,
            display: "flex",
            border: "2px solid #f5fbff",
            boxShadow: "0 1px 0 rgba(0,29,61,0.8)",
          }}
        />
      ) : null}
      {kind === "close" ? (
        <div
          style={{
            position: "relative",
            width: 14,
            height: 14,
            display: "flex",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 6,
              top: 0,
              width: 2,
              height: 15,
              display: "flex",
              borderRadius: 1,
              background: "#ffffff",
              transform: "rotate(45deg)",
              boxShadow: "0 0 1px #3c0603",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 6,
              top: 0,
              width: 2,
              height: 15,
              display: "flex",
              borderRadius: 1,
              background: "#ffffff",
              transform: "rotate(-45deg)",
              boxShadow: "0 0 1px #3c0603",
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

export const Windows7Window = defineReact({
  name: "Windows7AeroWindow",
  schema: windows7WindowSchema,
  static: true,
  component({ props }) {
    const context = useFourierContext();
    const width = Math.min(Math.max(260, props.windowWidth), context.width);
    const height = Math.min(Math.max(180, props.windowHeight), context.height);
    const glassTop = props.active
      ? "rgba(204,238,255,0.92)"
      : "rgba(221,229,234,0.86)";
    const glassBottom = props.active
      ? "rgba(58,135,190,0.82)"
      : "rgba(105,127,143,0.75)";

    return (
      <div
        style={{
          width: context.width,
          height: context.height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "transparent",
        }}
      >
        <div
          style={{
            position: "relative",
            width,
            height,
            display: "flex",
            flexDirection: "column",
            padding: 7,
            border: "1px solid rgba(2,35,70,0.92)",
            borderRadius: 9,
            overflow: "hidden",
            background: `linear-gradient(135deg, ${glassTop} 0%, rgba(123,190,231,0.72) 42%, ${glassBottom} 100%)`,
            boxShadow:
              "0 16px 42px rgba(0,18,39,0.48), inset 0 1px 0 rgba(255,255,255,0.92), inset 0 0 0 1px rgba(122,204,246,0.66)",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 18,
              top: -25,
              width: Math.round(width * 0.62),
              height: 86,
              display: "flex",
              borderRadius: 60,
              background:
                "radial-gradient(ellipse at center, rgba(255,255,255,0.82) 0%, rgba(255,255,255,0.16) 58%, rgba(255,255,255,0) 75%)",
            }}
          />

          <div
            style={{
              position: "relative",
              height: 34,
              width: "100%",
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              paddingLeft: 8,
              paddingRight: 112,
            }}
          >
            <div
              style={{
                width: 20,
                height: 20,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginRight: 8,
                overflow: "hidden",
                borderRadius: 3,
                boxShadow: "0 1px 2px rgba(0,24,50,0.72)",
              }}
            >
              {props.icon}
            </div>
            <div
              style={{
                minWidth: 0,
                height: 24,
                display: "flex",
                alignItems: "center",
                color: "#07192a",
                textShadow: "0 1px 0 rgba(255,255,255,0.95)",
                overflow: "hidden",
              }}
            >
              {props.title}
            </div>
          </div>

          <div
            style={{
              position: "absolute",
              right: 7,
              top: 0,
              height: 25,
              display: "flex",
              flexDirection: "row",
              overflow: "hidden",
              borderBottomLeftRadius: 6,
              borderBottomRightRadius: 6,
              borderRight: "1px solid rgba(255,255,255,0.38)",
              boxShadow: "0 1px 3px rgba(0,28,55,0.48)",
            }}
          >
            <ControlButton kind="minimize" />
            <ControlButton kind="maximize" />
            <ControlButton kind="close" />
          </div>

          <div
            style={{
              position: "relative",
              flex: 1,
              width: "100%",
              display: "flex",
              overflow: "hidden",
              border: "1px solid rgba(0,24,48,0.96)",
              background: "#f4f7fa",
              boxShadow:
                "0 0 0 1px rgba(255,255,255,0.78), inset 0 0 0 1px rgba(164,194,215,0.5)",
            }}
          >
            {props.content}
          </div>
        </div>
      </div>
    );
  },
  designPreview() {
    const image = (
      <img
        src={placeholderImageUrl}
        width={746}
        height={378}
        style={{ width: 746, height: 378, objectFit: "cover" }}
      />
    );
    const icon = (
      <div style={{ width: 20, height: 20, display: "flex", padding: 2, background: "linear-gradient(135deg, #ffffff 0%, #84d7ff 100%)" }}>
        <img src={placeholderIconUrl} width={16} height={16} style={{ width: 16, height: 16, objectFit: "contain" }} />
      </div>
    );
    const title = (
      <div style={{ width: 158, height: 18, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ width: 148, height: 7, display: "flex", borderRadius: 4, background: "rgba(6,31,55,0.86)" }} />
        <div style={{ width: 86, height: 3, display: "flex", marginTop: 3, borderRadius: 2, background: "rgba(7,42,70,0.48)" }} />
      </div>
    );
    return {
      props: { title, icon, content: image },
      composition: { width: 960, height: 540, durationSeconds: 0 },
      player: { background: "checkerboard" as const, loop: false },
      seed: 7,
    };
  },
});

export default Windows7Window;
