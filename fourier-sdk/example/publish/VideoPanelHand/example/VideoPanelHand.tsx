import {
  FourierMotion,
  defineMotion,
  defineSchema,
  field,
  motion,
  useFourierContext,
  type FourierMotionTarget,
  type InferFields,
  type ReactNode,
} from "@fourier-video/sdk/motion";
import placeholderVideoUrl from "../placeholder/video/1.mp4";

export const videoPanelSchema = defineSchema({
  frameColor: field.color({ default: "#2c2925", label: "铅笔线颜色" }),
  strokeCount: field.number({ min: 3, max: 8, default: 6, label: "线条圈数" }),
  strokeWidth: field.number({ min: 0.5, max: 3, default: 1.25, label: "线条粗细" }),
  roughness: field.number({ min: 0, max: 1, default: 0.78, label: "手绘粗糙度" }),
  lineSpread: field.number({ min: 0.2, max: 4, default: 1.1, label: "线条疏密" }),
  frameGap: field.number({ min: 8, max: 24, default: 10, label: "线框与视频间距" }),
  breath: field.number({ min: 0, max: 1, default: 0.72, label: "呼吸幅度" }),
  cornerRadius: field.number({ min: 0, max: 60, default: 18, label: "视频圆角" }),
});

export type VideoPanelProps = InferFields<typeof videoPanelSchema>;

interface BorderPoint {
  readonly x: number;
  readonly y: number;
  readonly normalX: number;
  readonly normalY: number;
}

const SKETCH_PADDING = 20;

function stableNoise(index: number, seed: number): number {
  const value = Math.sin(index * 127.1 + seed * 311.7) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
}

function roundedRectanglePoints(
  width: number,
  height: number,
  requestedRadius: number,
): readonly BorderPoint[] {
  const radius = Math.max(0, Math.min(requestedRadius, width / 2, height / 2));
  const points: BorderPoint[] = [];
  const straightSteps = 18;
  const cornerSteps = 7;

  const line = (
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    normalX: number,
    normalY: number,
  ) => {
    for (let step = 0; step < straightSteps; step += 1) {
      const progress = step / straightSteps;
      points.push({
        x: startX + (endX - startX) * progress,
        y: startY + (endY - startY) * progress,
        normalX,
        normalY,
      });
    }
  };

  const corner = (
    centerX: number,
    centerY: number,
    startAngle: number,
  ) => {
    for (let step = 0; step < cornerSteps; step += 1) {
      const angle = startAngle + (Math.PI / 2) * (step / cornerSteps);
      const normalX = Math.cos(angle);
      const normalY = Math.sin(angle);
      points.push({
        x: centerX + normalX * radius,
        y: centerY + normalY * radius,
        normalX,
        normalY,
      });
    }
  };

  line(radius, 0, width - radius, 0, 0, -1);
  corner(width - radius, radius, -Math.PI / 2);
  line(width, radius, width, height - radius, 1, 0);
  corner(width - radius, height - radius, 0);
  line(width - radius, height, radius, height, 0, 1);
  corner(radius, height - radius, Math.PI / 2);
  line(0, height - radius, 0, radius, -1, 0);
  corner(radius, radius, Math.PI);

  return points;
}

/** A stable, closed pencil loop. Nearby loops intentionally cross each other. */
export function handDrawnBorderPath(
  width: number,
  height: number,
  radius: number,
  lineIndex: number,
  roughness: number,
  lineSpread = 1.1,
  frameGap = 10,
  redrawPass = 0,
): string {
  const points = roundedRectanglePoints(width, height, radius);
  const centerOffset = stableNoise(lineIndex, 2.31) * lineSpread * 0.72;
  const roughAmplitude = 0.45 + Math.max(0, Math.min(1, roughness)) * 2.45;
  const coordinates = points.map((point, pointIndex) => {
    const coarse = stableNoise(Math.floor(pointIndex / 4), lineIndex + 1.73);
    const fine = stableNoise(pointIndex, lineIndex + 8.19);
    const redrawAmplitude = redrawPass === 0 ? 0 : 0.5 + roughness * 1.45;
    const redrawNormal = stableNoise(
      Math.floor(pointIndex / 3),
      lineIndex + 31.7 + redrawPass * 7.9,
    ) * redrawAmplitude;
    const redrawTangent = stableNoise(
      pointIndex,
      lineIndex + 47.2 + redrawPass * 11.3,
    ) * redrawAmplitude * 0.42;
    const normalOffset = Math.max(0, frameGap) + centerOffset +
      roughAmplitude * (coarse * 0.7 + fine * 0.3) + redrawNormal;
    const tangentOffset = stableNoise(pointIndex, lineIndex + 19.4) * roughness * 0.38 +
      redrawTangent;
    const x = SKETCH_PADDING + point.x +
      point.normalX * normalOffset - point.normalY * tangentOffset;
    const y = SKETCH_PADDING + point.y +
      point.normalY * normalOffset + point.normalX * tangentOffset;
    return `${x.toFixed(2)} ${y.toFixed(2)}`;
  });
  return `M ${coordinates.join(" L ")} Z`;
}

const REDRAW_SEQUENCE_A = [0, 1, 2, 1] as const;
const REDRAW_SEQUENCE_B = [0, 2, 1, 2] as const;
const REDRAW_CYCLES = 8;

/** Continuous low-frame-rate redraw loop across the complete host timeline. */
export function handDrawnRedrawFrames(
  lineIndex: number,
  redrawPass: number,
  baseOpacity: number,
): readonly FourierMotionTarget[] {
  const pass = Math.max(0, Math.min(2, Math.round(redrawPass)));
  const opacity = Math.max(0, Math.min(1, baseOpacity));
  const sequence = lineIndex % 2 === 0 ? REDRAW_SEQUENCE_A : REDRAW_SEQUENCE_B;
  const stageCount = REDRAW_CYCLES * sequence.length;
  const frames: FourierMotionTarget[] = [];
  for (let stage = 0; stage <= stageCount; stage += 1) {
    const activePass = sequence[stage % sequence.length]!;
    const offset = stage === 0
      ? 0
      : stage === stageCount
        ? 1
        : stage / stageCount + stableNoise(stage, lineIndex + 83.4) * 0.004;
    frames.push({
      opacity: activePass === pass ? opacity : 0,
      offset,
      easing: "steps(1, end)",
    });
  }
  return frames;
}

function VideoPanelLayer({
  children,
  props,
}: {
  children: ReactNode;
  props: VideoPanelProps;
}): ReactNode {
  const { width, height } = useFourierContext();
  const margin = Math.max(28, Math.min(72, Math.min(width, height) * 0.075));
  const panelWidth = Math.max(1, width - margin * 2);
  const panelHeight = Math.max(1, height - margin * 2);
  const radius = Math.min(props.cornerRadius, panelWidth / 2, panelHeight / 2);
  const strokeCount = Math.max(3, Math.min(8, Math.round(props.strokeCount)));
  const breathScale = props.breath * 0.0018;
  const breathOpacity = props.breath * 0.035;
  const paths = Array.from({ length: strokeCount }, (_, index) =>
    Array.from({ length: 3 }, (_, redrawPass) =>
      handDrawnBorderPath(
        panelWidth,
        panelHeight,
        radius,
        index,
        props.roughness,
        props.lineSpread,
        props.frameGap,
        redrawPass,
      )
    )
  );

  return (
    <FourierMotion>
      <div
        data-video-panel="hand-drawn"
        style={{
          position: "relative",
          width,
          height,
          display: "grid",
          placeItems: "center",
          overflow: "hidden",
          background: "transparent",
        }}
      >
        <div
          style={{
            position: "relative",
            width: panelWidth,
            height: panelHeight,
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              overflow: "hidden",
              borderRadius: radius,
              background: "#171614",
            }}
          >
            {children}
          </div>

          <motion.svg
            aria-hidden="true"
            viewBox={`0 0 ${panelWidth + SKETCH_PADDING * 2} ${panelHeight + SKETCH_PADDING * 2}`}
            preserveAspectRatio="none"
            animate={[
              { scaleX: 1, scaleY: 1, opacity: 0.95, offset: 0 },
              {
                scaleX: 1 + breathScale,
                scaleY: 1 + breathScale * 0.72,
                opacity: 0.95 + breathOpacity,
                offset: 0.25,
              },
              { scaleX: 1, scaleY: 1, opacity: 0.95, offset: 0.5 },
              {
                scaleX: 1 + breathScale * 0.82,
                scaleY: 1 + breathScale * 0.64,
                opacity: 0.95 + breathOpacity * 0.82,
                offset: 0.75,
              },
              { scaleX: 1, scaleY: 1, opacity: 0.95, offset: 1 },
            ]}
            transition={{ ease: [0.37, 0, 0.63, 1], fill: "both" }}
            style={{
              position: "absolute",
              inset: -SKETCH_PADDING,
              width: panelWidth + SKETCH_PADDING * 2,
              height: panelHeight + SKETCH_PADDING * 2,
              overflow: "visible",
              pointerEvents: "none",
              transformOrigin: "50% 50%",
              willChange: "transform, opacity",
            }}
          >
            {paths.flatMap((redrawPaths, index) => {
              const baseOpacity = Math.max(0.38, 0.82 - index * 0.055);
              return redrawPaths.map((path, redrawPass) => (
                <motion.path
                  key={`${index}-${redrawPass}`}
                  d={path}
                  fill="none"
                  stroke={props.frameColor}
                  strokeWidth={props.strokeWidth}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={index % 3 === 2 ? "52 1.6 21 0.8" : undefined}
                  vectorEffect="non-scaling-stroke"
                  animate={handDrawnRedrawFrames(index, redrawPass, baseOpacity)}
                  transition={{ ease: "linear", fill: "both" }}
                  style={{
                    mixBlendMode: "multiply",
                    willChange: "opacity",
                  }}
                />
              ));
            })}
          </motion.svg>
        </div>
      </div>
    </FourierMotion>
  );
}

export const VideoPanelHand = defineMotion({
  name: "VideoPanelHand",
  schema: videoPanelSchema,
  supportsTextMotion: false,
  component({ subject, props }) {
    return <VideoPanelLayer props={props}>{subject}</VideoPanelLayer>;
  },
  preview() {
    return { representativeProgress: 0.24, priority: "primary" };
  },
  designPreview() {
    return {
      props: {},
      subject: (
        <video
          src={placeholderVideoUrl}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          style={{
            width: "100%",
            height: "100%",
            display: "block",
            objectFit: "cover",
          }}
        />
      ),
      composition: { width: 960, height: 540, durationSeconds: 4 },
      player: { background: "#e6dfd3", loop: true },
    };
  },
});

export default VideoPanelHand;
