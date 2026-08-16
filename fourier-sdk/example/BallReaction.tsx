import {
  FourierMotion,
  defineReact,
  defineSchema,
  field,
  loadFont,
  motion,
  useFourierContext,
  type CSSProperties,
  type FourierMotionTarget,
  type InferFields,
} from "@fourier-video/sdk";
import creatorGeniusFontUrl from "../placeholder/fonts/Creator Genius.ttf";

const creatorGeniusFont = loadFont(creatorGeniusFontUrl);

export const ballReactionSchema = defineSchema({
  ballSize: field.number({
    label: "小球尺寸",
    min: 40,
    max: 110,
    integer: true,
    default: 68,
  }),
  edgeColor: field.color({ label: "蓝色描边", default: "#2697ff" }),
  glow: field.number({
    label: "蓝光强度",
    min: 4,
    max: 34,
    integer: true,
    default: 18,
  }),
  collisionEnergy: field.number({
    label: "碰撞强度",
    min: 0.45,
    max: 1.4,
    default: 1,
  }),
});

export type BallReactionProps = InferFields<typeof ballReactionSchema>;

const COLUMN_COUNT = 5;
const ROW_COUNT = 4;
const BALL_COUNT = COLUMN_COUNT * ROW_COUNT;
const HERO_BALL_INDEX = 7;
const VECTOR_BALL_RADIUS = 50;

export const BALL_REACTION_SYMBOLS = [
  "F", "O", "U", "Re", "Er",
  "H", "He", "Li", "Be", "B",
  "C", "N", "Ne", "Na", "Mg",
  "Al", "Si", "P", "S", "Cl",
] as const;

function gridPosition(index: number, width: number, height: number): { x: number; y: number } {
  const column = index % COLUMN_COUNT;
  const row = Math.floor(index / COLUMN_COUNT);
  const columnGap = Math.min(width * 0.108, height * 0.19);
  const rowGap = Math.min(height * 0.15, width * 0.085);
  return {
    x: (column - (COLUMN_COUNT - 1) / 2) * columnGap,
    y: (row - (ROW_COUNT - 1) / 2) * rowGap,
  };
}

function collisionOffset(index: number, phase: number, amount: number): { x: number; y: number } {
  const horizontal = Math.sin((index + 1) * 2.17 + phase * 4.31);
  const vertical = Math.cos((index + 1) * 3.03 + phase * 5.07);
  return { x: horizontal * amount, y: vertical * amount * 0.82 };
}

/** Deterministic 20-ball choreography, shared by preview, tests, and production renders. */
export function ballReactionFrames(
  index: number,
  width: number,
  height: number,
  ballSize: number,
  collisionEnergy = 1,
): readonly FourierMotionTarget[] {
  const safeIndex = Math.max(0, Math.min(BALL_COUNT - 1, Math.floor(index)));
  const column = safeIndex % COLUMN_COUNT;
  const row = Math.floor(safeIndex / COLUMN_COUNT);
  const grid = gridPosition(safeIndex, width, height);
  const appearAt = 0.035 + column * 0.048 + row * 0.004;
  const collisionAmount = ballSize * 0.55 * collisionEnergy;
  const frames: FourierMotionTarget[] = [
    { x: grid.x, y: grid.y, scale: 0.18, scaleX: 0.72, scaleY: 0.72, opacity: 0, offset: 0 },
    { x: grid.x, y: grid.y, scale: 0.18, scaleX: 0.72, scaleY: 0.72, opacity: 0, offset: appearAt },
    { x: grid.x, y: grid.y, scale: 1.14, scaleX: 1, scaleY: 1, opacity: 1, offset: appearAt + 0.03 },
    { x: grid.x, y: grid.y, scale: 1, scaleX: 1, scaleY: 1, opacity: 1, offset: appearAt + 0.066 },
    { x: grid.x, y: grid.y, scale: 1, scaleX: 1, scaleY: 1, opacity: 1, offset: 0.315 },
  ];

  const collisionOffsets = [0.35, 0.385, 0.42, 0.455, 0.49, 0.525, 0.56] as const;
  collisionOffsets.forEach((offset, phase) => {
    const hit = collisionOffset(safeIndex, phase, collisionAmount);
    const squash = phase % 2 === 0 ? 0.84 : 1.16;
    frames.push({
      x: grid.x + hit.x,
      y: grid.y + hit.y,
      scale: 1,
      scaleX: squash,
      scaleY: 2 - squash,
      opacity: 1,
      offset,
    });
  });

  frames.push(
    { x: grid.x, y: grid.y, scale: 1, scaleX: 1, scaleY: 1, opacity: 1, offset: 0.59 },
    { x: grid.x * 0.72, y: grid.y * 0.72, scale: 1.04, scaleX: 1, scaleY: 1, opacity: 1, offset: 0.625 },
    { x: grid.x * 0.32, y: grid.y * 0.32, scale: 0.96, scaleX: 1, scaleY: 1, opacity: 1, offset: 0.675 },
    { x: 0, y: 0, scale: 0.82, scaleX: 1, scaleY: 1, opacity: 1, offset: 0.72 },
  );

  frames.push(
    {
      x: 0,
      y: 0,
      scale: safeIndex === HERO_BALL_INDEX ? 1 : 0.42,
      scaleX: 1,
      scaleY: 1,
      opacity: 0,
      offset: 0.75,
    },
    {
      x: 0,
      y: 0,
      scale: safeIndex === HERO_BALL_INDEX ? 1 : 0.42,
      scaleX: 1,
      scaleY: 1,
      opacity: 0,
      offset: 1,
    },
  );

  return frames;
}

/** Radius is animated as an SVG geometry property, so the final ball is re-rasterized from vectors. */
export function ballReactionHeroFrames(
  width: number,
  height: number,
  ballSize: number,
  glowScale = 1,
): readonly FourierMotionTarget[] {
  const startRadius = ballSize * VECTOR_BALL_RADIUS / 120 * glowScale;
  const middleRadius = Math.min(width, height) * 0.31 * glowScale;
  const finalRadius = Math.hypot(width, height) * 1.25 * glowScale;
  return [
    { r: "0px", opacity: 0, offset: 0 } as FourierMotionTarget,
    { r: "0px", opacity: 0, offset: 0.705 } as FourierMotionTarget,
    { r: `${startRadius}px`, opacity: 1, offset: 0.72 } as FourierMotionTarget,
    { r: `${startRadius}px`, opacity: 1, offset: 0.755 } as FourierMotionTarget,
    { r: `${startRadius * 0.9}px`, opacity: 1, offset: 0.79 } as FourierMotionTarget,
    { r: `${startRadius * 1.32}px`, opacity: 1, offset: 0.835 } as FourierMotionTarget,
    { r: `${middleRadius}px`, opacity: 1, offset: 0.9 } as FourierMotionTarget,
    { r: `${finalRadius}px`, opacity: 1, offset: 0.945 } as FourierMotionTarget,
    { r: `${finalRadius}px`, opacity: 1, offset: 1 } as FourierMotionTarget,
  ];
}

function ballStyle(size: number, width: number, height: number): CSSProperties {
  return {
    position: "absolute",
    left: width / 2 - size / 2,
    top: height / 2 - size / 2,
    width: size,
    height: size,
    overflow: "visible",
    transformOrigin: "50% 50%",
    willChange: "transform, opacity",
  };
}

function VectorBall({
  index,
  edgeColor,
  glow,
}: {
  index: number;
  edgeColor: string;
  glow: number;
}) {
  const glowId = `ball-reaction-glow-${index}`;
  const bodyId = `ball-reaction-body-${index}`;
  const glowOpacity = Math.min(0.72, 0.2 + glow / 70);

  return (
    <>
      <defs>
        <radialGradient id={glowId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={edgeColor} stopOpacity={glowOpacity} />
          <stop offset="58%" stopColor={edgeColor} stopOpacity={glowOpacity * 0.42} />
          <stop offset="100%" stopColor={edgeColor} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={bodyId} cx="40%" cy="34%" r="67%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="62%" stopColor="#ffffff" />
          <stop offset="86%" stopColor="#f0f8ff" />
          <stop offset="100%" stopColor="#d5ebff" />
        </radialGradient>
      </defs>
      <circle cx="60" cy="60" r="59" fill={`url(#${glowId})`} />
      <circle
        cx="60"
        cy="60"
        r={VECTOR_BALL_RADIUS}
        fill={`url(#${bodyId})`}
        stroke={edgeColor}
        strokeWidth="3"
        vectorEffect="non-scaling-stroke"
      />
      <ellipse cx="46" cy="39" rx="13" ry="7" fill="#ffffff" fillOpacity="0.92" />
      <text
        x="60"
        y="63"
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#0a3b67"
        fontFamily={creatorGeniusFont}
        fontSize={BALL_REACTION_SYMBOLS[index]!.length === 1 ? 32 : 27}
        fontWeight="650"
        letterSpacing="-0.8"
      >
        {BALL_REACTION_SYMBOLS[index]}
      </text>
    </>
  );
}

function VectorHeroBall({
  width,
  height,
  ballSize,
  edgeColor,
  glow,
}: {
  width: number;
  height: number;
  ballSize: number;
  edgeColor: string;
  glow: number;
}) {
  const glowOpacity = Math.min(0.68, 0.18 + glow / 72);
  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      shapeRendering="geometricPrecision"
      style={{ position: "absolute", inset: 0, zIndex: 50, overflow: "hidden" }}
    >
      <defs>
        <radialGradient id="ball-reaction-hero-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={edgeColor} stopOpacity={glowOpacity} />
          <stop offset="62%" stopColor={edgeColor} stopOpacity={glowOpacity * 0.36} />
          <stop offset="100%" stopColor={edgeColor} stopOpacity="0" />
        </radialGradient>
        <radialGradient id="ball-reaction-hero-body" cx="40%" cy="34%" r="67%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="62%" stopColor="#ffffff" />
          <stop offset="86%" stopColor="#f0f8ff" />
          <stop offset="100%" stopColor="#d5ebff" />
        </radialGradient>
      </defs>
      <motion.circle
        cx={width / 2}
        cy={height / 2}
        animate={ballReactionHeroFrames(width, height, ballSize, 1.32)}
        transition={{ ease: [0.58, 0, 0.18, 1] }}
        fill="url(#ball-reaction-hero-glow)"
      />
      <motion.circle
        cx={width / 2}
        cy={height / 2}
        animate={ballReactionHeroFrames(width, height, ballSize)}
        transition={{ ease: [0.58, 0, 0.18, 1] }}
        fill="url(#ball-reaction-hero-body)"
        stroke={edgeColor}
        strokeWidth="3"
      />
    </svg>
  );
}

function BallReactionLayer({ props }: { props: BallReactionProps }) {
  const { width, height } = useFourierContext();

  return (
    <FourierMotion>
      <div
        aria-label="Blue and white balls colliding and merging"
        style={{
          position: "relative",
          width,
          height,
          overflow: "hidden",
          background: "#000000",
          pointerEvents: "none",
        }}
      >
        {Array.from({ length: BALL_COUNT }, (_, index) => (
          <motion.svg
            key={index}
            aria-hidden="true"
            viewBox="0 0 120 120"
            shapeRendering="geometricPrecision"
            animate={ballReactionFrames(
              index,
              width,
              height,
              props.ballSize,
              props.collisionEnergy,
            )}
            transition={{ ease: [0.32, 0, 0.2, 1] }}
            style={{
              ...ballStyle(props.ballSize, width, height),
              zIndex: index === HERO_BALL_INDEX ? 20 : 10 + index,
            }}
          >
            <VectorBall
              index={index}
              edgeColor={props.edgeColor}
              glow={props.glow}
            />
          </motion.svg>
        ))}

        <VectorHeroBall
          width={width}
          height={height}
          ballSize={props.ballSize}
          edgeColor={props.edgeColor}
          glow={props.glow}
        />

        <motion.div
          aria-hidden="true"
          animate={[
            { opacity: 0, offset: 0 },
            { opacity: 0, offset: 0.955 },
            { opacity: 1, offset: 0.985 },
            { opacity: 1, offset: 1 },
          ]}
          transition={{ ease: [0.65, 0, 0.35, 1] }}
          style={{ position: "absolute", inset: 0, zIndex: 100, background: "#ffffff" }}
        />
      </div>
    </FourierMotion>
  );
}

export const BallReaction = defineReact({
  name: "BallReaction",
  schema: ballReactionSchema,
  component({ props }) {
    return <BallReactionLayer props={props} />;
  },
  designPreview() {
    return {
      props: {},
      composition: { width: 960, height: 540, durationSeconds: 6 },
      player: { background: "#000000", loop: true },
    };
  },
});

export default BallReaction;
