import {
  FourierMotion,
  createFourierPrng,
  defineMotion,
  defineSchema,
  field,
  loadFont,
  motion,
  useFourierContext,
  useId,
  useMemo,
  type FourierMotionTarget,
  type InferFields,
  type ReactNode,
} from "@fourier-video/sdk/motion";
import handwritingFontUrl from "../assets/Beuty Rush.otf";

const handwritingFont = loadFont(handwritingFontUrl);

export const handWritingTextMotionSchema = defineSchema({
  fontSize: field.number({
    label: "Font size",
    description: "Handwritten text size in pixels.",
    min: 16,
    max: 240,
    default: 96,
  }),
  fontWeight: field.number({
    label: "Font weight",
    description: "CSS weight supported by the font.",
    min: 100,
    max: 900,
    integer: true,
    default: 400,
  }),
  letterSpacing: field.number({
    label: "Letter spacing",
    description: "Pixel spacing between glyphs.",
    min: -12,
    max: 40,
    default: 1,
  }),
  lineGap: field.number({
    label: "Line gap",
    description: "Gap between lines in em units.",
    min: 0,
    max: 1,
    default: 0.12,
  }),
  inkColor: field.color({
    label: "Ink color",
    description: "Ink color applied after the alpha threshold.",
    default: "#171411",
  }),
  bulge: field.number({
    label: "Bulge jitter",
    description: "Independent turbulent edge displacement for every glyph.",
    min: 0,
    max: 6,
    default: 2.2,
  }),
  evolutionSpeed: field.number({
    label: "Evolution speed",
    description: "Noise-field evolution cycles per second for every glyph.",
    min: 0.2,
    max: 6,
    default: 1.4,
  }),
  fastBoxBlur: field.number({
    label: "Fast Box Blur",
    description: "Fast softening radius before the alpha threshold.",
    min: 0,
    max: 4,
    default: 1.15,
  }),
  alphaThreshold: field.number({
    label: "Threshold Alpha",
    description: "Threshold that hardens the softened ink alpha.",
    min: 0.05,
    max: 0.95,
    default: 0.42,
  }),
  bevelWidth: field.number({
    label: "Bevel width",
    description: "Soft edge width of the perspective alpha bevel.",
    min: 0.1,
    max: 4,
    default: 0.85,
  }),
  bevelDepth: field.number({
    label: "Bevel depth",
    description: "Depth of the alpha height field used by the highlight.",
    min: 0,
    max: 12,
    default: 3.2,
  }),
  highlightStrength: field.number({
    label: "Highlight strength",
    description: "Specular highlight strength composited over the ink.",
    min: 0,
    max: 2,
    default: 0.46,
  }),
  highlightColor: field.color({
    label: "Highlight color",
    description: "Reflection color for wet or raised ink.",
    default: "#fff3d6",
  }),
  highlightAngle: field.number({
    label: "Highlight angle",
    description: "Horizontal incidence angle of the highlight in degrees.",
    min: -180,
    max: 180,
    default: -38,
  }),
});

export type HandWritingTextMotionProps = InferFields<
  typeof handWritingTextMotionSchema
>;

interface WritingWindow {
  readonly start: number;
  readonly end: number;
}

function writingWindow(lineIndex: number, lineCount: number): WritingWindow {
  const count = Math.max(1, Math.floor(lineCount));
  const index = Math.min(count - 1, Math.max(0, Math.floor(lineIndex)));
  const segment = 0.72 / count;
  return {
    start: 0.06 + segment * index,
    end: 0.06 + segment * (index + 1),
  };
}

function characterWritingWindow(
  lineIndex: number,
  lineCount: number,
  characterIndex: number,
  characterCount: number,
): WritingWindow {
  const line = writingWindow(lineIndex, lineCount);
  const count = Math.max(1, Math.floor(characterCount));
  const index = Math.min(count - 1, Math.max(0, Math.floor(characterIndex)));
  const characterDuration = (line.end - line.start) / count;
  const start = line.start + characterDuration * index;
  return {
    start,
    end: Math.min(line.end, start + characterDuration * 1.7),
  };
}

export function handwritingRevealFrames(
  lineIndex: number,
  lineCount: number,
): readonly FourierMotionTarget[] {
  const { start, end } = writingWindow(lineIndex, lineCount);
  const hidden = "inset(-48% 108% -48% -8%)";
  const revealed = "inset(-48% -8% -48% -8%)";
  return [
    { clipPath: hidden, offset: 0 },
    { clipPath: hidden, offset: start },
    { clipPath: revealed, offset: end },
    { clipPath: revealed, offset: 1 },
  ];
}

function settledBulgeFrame(offset: number): FourierMotionTarget {
  return {
    x: 0,
    y: 0,
    rotate: 0,
    scaleX: 1,
    scaleY: 1,
    offset,
  };
}

export function handwritingBulgeFrames(
  lineIndex: number,
  lineCount: number,
  characterIndex: number,
  characterCount: number,
  seed: number | string,
  strength: number,
): readonly FourierMotionTarget[] {
  const { start, end } = characterWritingWindow(
    lineIndex,
    lineCount,
    characterIndex,
    characterCount,
  );
  const amount = Math.max(0, Math.min(6, strength));
  const random = createFourierPrng(
    `${seed}:HandWritingTextMotion:${lineIndex}:${lineCount}:${characterIndex}:${characterCount}:${amount}`,
  );
  const activeFrames = Array.from({ length: 4 }, (_, index): FourierMotionTarget => {
    const phase = (index + 1) / 5;
    return {
      x: Number(((random() * 2 - 1) * amount * 0.09).toFixed(3)),
      y: Number(((random() * 2 - 1) * amount * 0.08).toFixed(3)),
      rotate: Number(((random() * 2 - 1) * amount * 0.026).toFixed(3)),
      scaleX: Number((1 + (random() * 2 - 1) * amount * 0.0014).toFixed(4)),
      scaleY: Number((1 + (random() * 2 - 1) * amount * 0.0018).toFixed(4)),
      offset: start + (end - start) * phase,
      easing: "steps(1,end)",
    };
  });
  return [
    settledBulgeFrame(0),
    settledBulgeFrame(start),
    ...activeFrames,
    settledBulgeFrame(end),
    settledBulgeFrame(1),
  ];
}

export function alphaThresholdTable(threshold: number, steps = 32): string {
  const count = Math.max(2, Math.floor(steps));
  const cutoff = Math.max(0, Math.min(1, threshold));
  return Array.from({ length: count }, (_, index) =>
    index / (count - 1) < cutoff ? "0" : "1"
  ).join(" ");
}

export interface TurbulentBulgeEvolution {
  readonly baseFrequencyValues: string;
  readonly seedValues: string;
  readonly durationSeconds: number;
}

export function turbulentBulgeEvolution(
  seed: number,
  speed: number,
): TurbulentBulgeEvolution {
  const random = createFourierPrng(`HandWritingTurbulentBulge:${seed}`);
  const frequencies = Array.from({ length: 4 }, () => {
    const x = 0.009 + random() * 0.003;
    const y = 0.046 + random() * 0.012;
    return `${x.toFixed(4)} ${y.toFixed(4)}`;
  });
  frequencies.push(frequencies[0]!);
  const normalizedSpeed = Math.max(0.2, Math.min(6, speed));
  const characterPhase = 0.88 + random() * 0.24;
  const seedStep = 1 + Math.floor(random() * 7);
  return {
    baseFrequencyValues: frequencies.join(";"),
    seedValues: [seed, seed + seedStep, seed + seedStep * 2, seed + seedStep * 3, seed]
      .join(";"),
    durationSeconds: Number((characterPhase / normalizedSpeed).toFixed(4)),
  };
}

function HandWritingFilterDefinition({
  id,
  props,
  seed,
}: {
  id: string;
  props: HandWritingTextMotionProps;
  seed: number;
}): ReactNode {
  const evolution = turbulentBulgeEvolution(seed, props.evolutionSpeed);
  return (
    <filter
      id={id}
      x="-18%"
      y="-42%"
      width="136%"
      height="184%"
      colorInterpolationFilters="sRGB"
    >
      <feTurbulence
        data-handwriting-bulge=""
        type="fractalNoise"
        baseFrequency="0.011 0.052"
        numOctaves="2"
        seed={seed}
        result="bulgeNoise"
      >
        <animate
          data-turbulent-bulge-evolution="frequency"
          attributeName="baseFrequency"
          values={evolution.baseFrequencyValues}
          keyTimes="0;0.25;0.5;0.75;1"
          keySplines="0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1"
          calcMode="spline"
          dur={`${evolution.durationSeconds}s`}
          repeatCount="indefinite"
        />
        <animate
          data-turbulent-bulge-evolution="seed"
          attributeName="seed"
          values={evolution.seedValues}
          keyTimes="0;0.25;0.5;0.75;1"
          calcMode="discrete"
          dur={`${evolution.durationSeconds}s`}
          repeatCount="indefinite"
        />
      </feTurbulence>
      <feDisplacementMap
        in="SourceAlpha"
        in2="bulgeNoise"
        scale={props.bulge}
        xChannelSelector="R"
        yChannelSelector="G"
        result="bulgedAlpha"
      />
      <feGaussianBlur
        data-fast-box-blur=""
        in="bulgedAlpha"
        stdDeviation={props.fastBoxBlur}
        result="fastBoxBlurAlpha"
      />
      <feComponentTransfer
        data-cc-threshold-alpha=""
        in="fastBoxBlurAlpha"
        result="thresholdAlpha"
      >
        <feFuncA
          type="discrete"
          tableValues={alphaThresholdTable(props.alphaThreshold)}
        />
      </feComponentTransfer>
      <feFlood floodColor={props.inkColor} result="inkColor" />
      <feComposite
        in="inkColor"
        in2="thresholdAlpha"
        operator="in"
        result="handWrittenInk"
      />
      <feGaussianBlur
        data-perspective-bevel-alpha="height-map"
        in="thresholdAlpha"
        stdDeviation={props.bevelWidth}
        result="bevelHeightMap"
      />
      <feSpecularLighting
        data-perspective-bevel-alpha="highlight"
        in="bevelHeightMap"
        surfaceScale={props.bevelDepth}
        specularConstant={props.highlightStrength}
        specularExponent="18"
        lightingColor={props.highlightColor}
        result="bevelHighlight"
      >
        <feDistantLight azimuth={props.highlightAngle} elevation="42" />
      </feSpecularLighting>
      <feComposite
        data-perspective-bevel-alpha="alpha-mask"
        in="bevelHighlight"
        in2="thresholdAlpha"
        operator="in"
        result="bevelHighlightMasked"
      />
      <feBlend
        data-perspective-bevel-alpha="composite"
        in="handWrittenInk"
        in2="bevelHighlightMasked"
        mode="screen"
        result="perspectiveBevelInk"
      />
    </filter>
  );
}

function HandWritingText({
  text,
  props,
}: {
  text: string;
  props: HandWritingTextMotionProps;
}): ReactNode {
  const { width, height, seed } = useFourierContext();
  const filterId = `handwriting-${useId().replaceAll(":", "")}`;
  const lines = text.split("\n");
  const characterLines = useMemo(
    () => lines.map((line) => line === "" ? ["\u00a0"] : Array.from(line)),
    [lines],
  );

  return (
    <FourierMotion>
      <div
        data-handwriting-text-motion={text}
        style={{
          position: "relative",
          width,
          height,
          display: "grid",
          placeItems: "center",
          overflow: "hidden",
          color: props.inkColor,
          background: "transparent",
          fontFamily: handwritingFont,
          fontSize: props.fontSize,
          fontWeight: props.fontWeight,
          letterSpacing: props.letterSpacing,
          lineHeight: 1,
          textAlign: "center",
          fontSynthesis: "none",
        }}
      >
        <svg
          aria-hidden="true"
          focusable="false"
          width="0"
          height="0"
          style={{ position: "absolute" }}
        >
          <defs>
            {characterLines.flatMap((characters, lineIndex) =>
              characters.map((_, characterIndex) => {
                const random = createFourierPrng(
                  `${seed}:HandWritingFilter:${text}:${lineIndex}:${characterIndex}`,
                );
                return (
                  <HandWritingFilterDefinition
                    key={`${lineIndex}:${characterIndex}`}
                    id={`${filterId}-${lineIndex}-${characterIndex}`}
                    props={props}
                    seed={1 + Math.floor(random() * 9_999)}
                  />
                );
              })
            )}
          </defs>
        </svg>
        <div
          style={{
            maxWidth: "94%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: `${props.lineGap}em`,
            padding: "0.3em 0.28em",
          }}
        >
          {characterLines.map((characters, lineIndex) => (
            <motion.span
              key={`${lineIndex}:${characters.join("")}`}
              data-handwriting-line={lineIndex}
              animate={handwritingRevealFrames(lineIndex, characterLines.length)}
              transition={{ ease: [0.42, 0, 0.22, 1], fill: "both" }}
              style={{
                position: "relative",
                display: "block",
                minHeight: "1em",
                whiteSpace: "pre",
                willChange: "clip-path",
              }}
            >
              {characters.map((character, characterIndex) => (
                <motion.span
                  key={`${characterIndex}:${character}`}
                  data-handwriting-character={characterIndex}
                  animate={handwritingBulgeFrames(
                    lineIndex,
                    characterLines.length,
                    characterIndex,
                    characters.length,
                    `${seed}:${text}`,
                    props.bulge,
                  )}
                  transition={{ ease: "linear", fill: "both" }}
                  style={{
                    display: "inline-block",
                    padding: "0.14em 0.08em",
                    margin: "-0.14em -0.08em",
                    color: props.inkColor,
                    filter: `url(#${filterId}-${lineIndex}-${characterIndex})`,
                    transformOrigin: "50% 58%",
                    willChange: "transform, filter",
                  }}
                >
                  {character === " " ? "\u00a0" : character}
                </motion.span>
              ))}
            </motion.span>
          ))}
        </div>
      </div>
    </FourierMotion>
  );
}

function HandWritingSubject({
  subject,
  props,
}: {
  subject: ReactNode;
  props: HandWritingTextMotionProps;
}): ReactNode {
  const { width, height, seed } = useFourierContext();
  return (
    <FourierMotion>
      <div
        style={{
          width,
          height,
          display: "grid",
          placeItems: "center",
          overflow: "hidden",
          background: "transparent",
        }}
      >
        <motion.div
          data-handwriting-subject=""
          animate={handwritingRevealFrames(0, 1)}
          transition={{ ease: [0.42, 0, 0.22, 1], fill: "both" }}
          style={{ width: "100%", height: "100%", display: "flex" }}
        >
          <motion.div
            animate={handwritingBulgeFrames(0, 1, 0, 1, seed, props.bulge)}
            transition={{ ease: "linear", fill: "both" }}
            style={{ width: "100%", height: "100%", display: "flex" }}
          >
            {subject}
          </motion.div>
        </motion.div>
      </div>
    </FourierMotion>
  );
}

export const HandWritingTextMotion = defineMotion({
  name: "HandWritingTextMotion",
  schema: handWritingTextMotionSchema,
  supportsTextMotion: true,
  component({ subject, props }) {
    return <HandWritingSubject subject={subject} props={props} />;
  },
  textComponent({ text, props }) {
    return <HandWritingText text={text} props={props} />;
  },
  preview() {
    return { representativeProgress: 0.58, priority: "primary" };
  },
  designPreview() {
    return {
      props: {},
      subject: "认真写下每一个想法。",
      composition: { width: 960, height: 300, durationSeconds: 4 },
      player: {
        background: "#f3eddf",
        loop: true,
      },
    };
  },
});

export default HandWritingTextMotion;
