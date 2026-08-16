import {
  FourierMotion,
  defineReact,
  defineSchema,
  field,
  motion,
  useFourierContext,
  type CSSProperties,
  type FourierMotionTarget,
  type InferFields,
} from "@fourier-video/sdk";

export const CHOOSER_OUT_QUINT = "cubic-bezier(0.22, 1, 0.36, 1)";

export const verticalChooserSchema = defineSchema({
  item1: field.string({ label: "选项 1", default: "Observe" }),
  item2: field.string({ label: "选项 2", default: "Compose" }),
  item3: field.string({ label: "选项 3", default: "Resonate" }),
  item4: field.string({ label: "选项 4", default: "Amplify" }),
  item5: field.string({ label: "选项 5", default: "Render" }),
  item6: field.string({ label: "选项 6", default: "Deliver" }),
  item7: field.string({ label: "选项 7", default: "Archive" }),
  background: field.color({ label: "背景色", default: "#0a0b0e" }),
  pillColor: field.color({ label: "焦点药丸底色", default: "#202229" }),
  accent: field.color({ label: "选中色", default: "#d8ff72" }),
  focusHeight: field.number({
    label: "焦点药丸高度",
    min: 64,
    max: 104,
    integer: true,
    default: 82,
  }),
  fontFamily: field.string({
    label: "字体",
    description: "传入 CSS font-family；可使用已由工程加载的自定义字体。",
    default: "Inter, ui-sans-serif, system-ui, sans-serif",
  }),
});

export type VerticalChooserProps = InferFields<typeof verticalChooserSchema>;

interface ChooserTimelinePoint {
  readonly offset: number;
  readonly selectedIndex: number;
  readonly easing?: string;
}

/**
 * Six outQuint snaps with a real hold after every arrival. The final state
 * matches the first so a looping design preview has no discontinuity.
 */
export const CHOOSER_TIMELINE: readonly ChooserTimelinePoint[] = Object.freeze([
  { offset: 0, selectedIndex: 1 },
  { offset: 0.04, selectedIndex: 1, easing: CHOOSER_OUT_QUINT },
  { offset: 0.14, selectedIndex: 2 },
  { offset: 0.2, selectedIndex: 2, easing: CHOOSER_OUT_QUINT },
  { offset: 0.3, selectedIndex: 3 },
  { offset: 0.36, selectedIndex: 3, easing: CHOOSER_OUT_QUINT },
  { offset: 0.46, selectedIndex: 4 },
  { offset: 0.52, selectedIndex: 4, easing: CHOOSER_OUT_QUINT },
  { offset: 0.62, selectedIndex: 3 },
  { offset: 0.68, selectedIndex: 3, easing: CHOOSER_OUT_QUINT },
  { offset: 0.78, selectedIndex: 2 },
  { offset: 0.84, selectedIndex: 2, easing: CHOOSER_OUT_QUINT },
  { offset: 0.94, selectedIndex: 1 },
  { offset: 1, selectedIndex: 1 },
]);

const ARRIVAL_OFFSETS = [0.14, 0.3, 0.46, 0.62, 0.78, 0.94] as const;

export interface ChooserLayerStyle {
  readonly opacity: number;
  readonly fontSize: number;
  readonly grayscale: number;
  readonly brightness: number;
  readonly scale: number;
  readonly letterSpacing: number;
}

/** Distance-to-focus styling shared by every item keyframe. */
export function chooserLayer(
  distance: number,
  focusFontSize = 46,
): ChooserLayerStyle {
  const layer = Math.max(0, Math.floor(Math.abs(distance)));
  if (layer === 0) {
    return {
      opacity: 1,
      fontSize: focusFontSize,
      grayscale: 0,
      brightness: 1.12,
      scale: 1,
      letterSpacing: -1.8,
    };
  }
  if (layer === 1) {
    return {
      opacity: 0.44,
      fontSize: focusFontSize * 0.67,
      grayscale: 0.62,
      brightness: 0.78,
      scale: 0.96,
      letterSpacing: -0.5,
    };
  }
  if (layer === 2) {
    return {
      opacity: 0.17,
      fontSize: focusFontSize * 0.51,
      grayscale: 0.9,
      brightness: 0.62,
      scale: 0.92,
      letterSpacing: 0.2,
    };
  }
  return {
    opacity: 0.055,
    fontSize: focusFontSize * 0.43,
    grayscale: 1,
    brightness: 0.5,
    scale: 0.89,
    letterSpacing: 0.6,
  };
}

export function chooserTrackFrames(
  itemHeight: number,
): readonly FourierMotionTarget[] {
  return CHOOSER_TIMELINE.map((point) => ({
    y: -(point.selectedIndex * itemHeight + itemHeight / 2),
    offset: point.offset,
    ...(point.easing === undefined ? {} : { easing: point.easing }),
  }));
}

export function chooserItemFrames(
  itemIndex: number,
  focusFontSize = 46,
): readonly FourierMotionTarget[] {
  return CHOOSER_TIMELINE.map((point) => {
    const layer = chooserLayer(itemIndex - point.selectedIndex, focusFontSize);
    return {
      opacity: layer.opacity,
      fontSize: `${layer.fontSize}px`,
      filter: `grayscale(${layer.grayscale}) brightness(${layer.brightness})`,
      scale: layer.scale,
      letterSpacing: `${layer.letterSpacing}px`,
      offset: point.offset,
      ...(point.easing === undefined ? {} : { easing: point.easing }),
    };
  });
}

/** A 1.2% scaleY landing breath; the list itself remains still throughout. */
export function chooserPillFrames(): readonly FourierMotionTarget[] {
  const frames: FourierMotionTarget[] = [{ scaleY: 1, offset: 0 }];
  for (const arrival of ARRIVAL_OFFSETS) {
    frames.push(
      { scaleY: 1, offset: arrival, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
      { scaleY: 1.012, offset: arrival + 0.012 },
      { scaleY: 0.998, offset: arrival + 0.027 },
      { scaleY: 1, offset: arrival + 0.045 },
    );
  }
  frames.push({ scaleY: 1, offset: 1 });
  return frames;
}

function chooserItems(props: VerticalChooserProps): readonly string[] {
  return [
    props.item1,
    props.item2,
    props.item3,
    props.item4,
    props.item5,
    props.item6,
    props.item7,
  ];
}

function VerticalChooserLayer({ props }: { props: VerticalChooserProps }) {
  const { width, height } = useFourierContext();
  const items = chooserItems(props);
  const contentWidth = Math.max(1, Math.min(720, width - 48));
  const itemHeight = Math.min(props.focusHeight, Math.max(48, height * 0.22));
  const focusFontSize = Math.max(34, Math.min(48, itemHeight * 0.56));
  const pillRadius = Math.min(itemHeight / 2, 31);
  const edgeFadeHeight = Math.max(62, Math.min(118, height * 0.2));
  const rootStyle: CSSProperties = {
    position: "relative",
    width,
    height,
    overflow: "hidden",
    color: props.accent,
    background: props.background,
    fontFamily: props.fontFamily,
    isolation: "isolate",
  };

  return (
    <FourierMotion>
      <div
        aria-label="Vertical chooser"
        data-fourier-vertical-chooser=""
        style={rootStyle}
      >
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at 50% 48%, rgba(255,255,255,0.055), transparent 31%), linear-gradient(115deg, rgba(255,255,255,0.018), transparent 42%)",
          }}
        />

        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: (width - contentWidth) / 2,
            top: `calc(50% - ${itemHeight / 2}px)`,
            width: contentWidth,
            height: itemHeight,
            zIndex: 1,
          }}
        >
          <motion.div
            animate={chooserPillFrames()}
            transition={{ ease: "linear", fill: "both" }}
            style={{
              position: "absolute",
              inset: 0,
              overflow: "hidden",
              border: "1px solid rgba(255,255,255,0.16)",
              borderRadius: pillRadius,
              background: props.pillColor,
              boxShadow:
                "0 20px 70px rgba(0,0,0,0.38), inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.32)",
              transformOrigin: "50% 50%",
              willChange: "transform",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: "1px 14% auto",
                height: 1,
                background:
                  "linear-gradient(90deg, transparent, rgba(255,255,255,0.28), transparent)",
              }}
            />
          </motion.div>
        </div>

        <div
          role="list"
          aria-label="Chooser options"
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 2,
            overflow: "hidden",
            WebkitMaskImage:
              "linear-gradient(to bottom, transparent 7%, black 28%, black 72%, transparent 93%)",
            maskImage:
              "linear-gradient(to bottom, transparent 7%, black 28%, black 72%, transparent 93%)",
          }}
        >
          <motion.div
            animate={chooserTrackFrames(itemHeight)}
            transition={{ ease: "linear", fill: "both" }}
            style={{
              position: "absolute",
              top: "50%",
              left: (width - contentWidth) / 2,
              width: contentWidth,
              willChange: "transform",
            }}
          >
            {items.map((item, index) => (
              <div
                key={index}
                role="listitem"
                data-chooser-item={index + 1}
                style={{
                  position: "relative",
                  width: "100%",
                  height: itemHeight,
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <motion.div
                  animate={chooserItemFrames(index, focusFontSize)}
                  transition={{ ease: "linear", fill: "both" }}
                  style={{
                    position: "relative",
                    width: "100%",
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "center",
                    color: props.accent,
                    fontWeight: 720,
                    lineHeight: 1,
                    textAlign: "center",
                    whiteSpace: "nowrap",
                    transformOrigin: "50% 50%",
                    willChange: "transform, opacity, filter, font-size",
                  }}
                >
                  <span>{item}</span>
                </motion.div>
              </div>
            ))}
          </motion.div>
        </div>

        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 3,
            pointerEvents: "none",
            background: `linear-gradient(to bottom, ${props.background} 0, transparent ${edgeFadeHeight}px, transparent calc(100% - ${edgeFadeHeight}px), ${props.background} 100%)`,
          }}
        />

      </div>
    </FourierMotion>
  );
}

export const VerticalChooser = defineReact({
  name: "VerticalChooser",
  schema: verticalChooserSchema,
  component({ props }) {
    return <VerticalChooserLayer props={props} />;
  },
  designPreview() {
    return {
      props: {},
      composition: { width: 960, height: 540, durationSeconds: 6 },
      player: { background: "#0a0b0e", loop: true },
    };
  },
});

export default VerticalChooser;
