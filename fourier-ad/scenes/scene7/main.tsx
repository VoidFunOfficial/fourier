import {
  Canvas,
  defineProject,
  Motion,
  Project,
  ReactLayer,
  Text,
  Timeline,
  Transform,
  type TransformKeyframe,
} from "@fourier-video/sdk/project";

const SCENE_DURATION_FRAMES = 390;
const DOCUMENT_COMPLETE_FRAME = 300;
const DOCUMENT_MORPH_END_FRAME = 330;
const INK = "#28241f";
const ACCENT = "#b84e35";
const FONT = "assets/Montserrat-Medium.ttf";

interface CopyLine {
  readonly id: string;
  readonly content: string;
  readonly startFrame: number;
  readonly y: number;
  readonly height: number;
  readonly fontSize: number;
  readonly role: "title" | "body" | "subtitle" | "label";
  readonly color: string;
}

export const SCENE_SEVEN_LINES: readonly CopyLine[] = [
  {
    id: "title",
    content: "FOURIER PROJECT",
    startFrame: 72,
    y: 292,
    height: 70,
    fontSize: 46,
    role: "title",
    color: INK,
  },
  {
    id: "introduction",
    content: "Four subprojects form one creative production system.",
    startFrame: 91,
    y: 348,
    height: 42,
    fontSize: 23,
    role: "subtitle",
    color: "#746b61",
  },
  {
    id: "engine-heading",
    content: "01 / FOURIER_ENGINE",
    startFrame: 110,
    y: 433,
    height: 32,
    fontSize: 18,
    role: "label",
    color: ACCENT,
  },
  {
    id: "engine-copy",
    content: "Incremental rendering, atomic components, and precise local adjustment.",
    startFrame: 128,
    y: 470,
    height: 40,
    fontSize: 25,
    role: "body",
    color: INK,
  },
  {
    id: "sdk-heading",
    content: "02 / FOURIER_SDK",
    startFrame: 148,
    y: 555,
    height: 32,
    fontSize: 18,
    role: "label",
    color: ACCENT,
  },
  {
    id: "sdk-copy-one",
    content: "The Agent-facing entry point for 2D and 3D component development,",
    startFrame: 166,
    y: 592,
    height: 40,
    fontSize: 25,
    role: "body",
    color: INK,
  },
  {
    id: "sdk-copy-two",
    content: "motion design, and physics simulation—keeping development decoupled.",
    startFrame: 184,
    y: 626,
    height: 40,
    fontSize: 25,
    role: "body",
    color: INK,
  },
  {
    id: "tools-heading",
    content: "03 / FOURIER_TOOLS",
    startFrame: 204,
    y: 710,
    height: 32,
    fontSize: 18,
    role: "label",
    color: ACCENT,
  },
  {
    id: "tools-copy",
    content: "Extended capabilities for image processing, audio synthesis, and more.",
    startFrame: 222,
    y: 747,
    height: 40,
    fontSize: 25,
    role: "body",
    color: INK,
  },
  {
    id: "world-heading",
    content: "04 / FOURIER_WORLD",
    startFrame: 242,
    y: 831,
    height: 32,
    fontSize: 18,
    role: "label",
    color: ACCENT,
  },
  {
    id: "world-copy-one",
    content: "A shared platform for creators—and a resource library",
    startFrame: 260,
    y: 868,
    height: 40,
    fontSize: 25,
    role: "body",
    color: INK,
  },
  {
    id: "world-copy-two",
    content: "built for Agents.",
    startFrame: 276,
    y: 902,
    height: 40,
    fontSize: 25,
    role: "body",
    color: INK,
  },
] as const;

const DOCUMENT_RISE_POINTS = [
  { frame: 0, y: 760 },
  { frame: 43.5, y: 760 },
  { frame: 57, y: 682 },
  { frame: 60, y: 620 },
  { frame: 240.6, y: 14 },
  { frame: 252, y: -6 },
  { frame: 264, y: 0 },
  { frame: DOCUMENT_COMPLETE_FRAME, y: 0 },
] as const;

function documentOffsetAt(frame: number): number {
  const clamped = Math.min(DOCUMENT_COMPLETE_FRAME, Math.max(0, frame));
  for (let index = 1; index < DOCUMENT_RISE_POINTS.length; index += 1) {
    const previous = DOCUMENT_RISE_POINTS[index - 1]!;
    const next = DOCUMENT_RISE_POINTS[index]!;
    if (clamped <= next.frame) {
      const progress = (clamped - previous.frame) / (next.frame - previous.frame);
      return previous.y + (next.y - previous.y) * progress;
    }
  }
  return 0;
}

function lineFloatAndDropFrames(startFrame: number): readonly TransformKeyframe[] {
  const duration = DOCUMENT_MORPH_END_FRAME - startFrame;
  const frameToOffset = (frame: number) => (frame - startFrame) / duration;
  const frame = (absoluteFrame: number, lift: number, opacity: number): TransformKeyframe => ({
    offset: frameToOffset(absoluteFrame),
    translateX: 0,
    translateY: documentOffsetAt(absoluteFrame) + lift,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    opacity,
  });

  const settleFrame = Math.min(DOCUMENT_MORPH_END_FRAME, startFrame + 20);
  const trackingFrames = [180, 220, 241, 252, 264, DOCUMENT_COMPLETE_FRAME, DOCUMENT_MORPH_END_FRAME]
    .filter((absoluteFrame) => absoluteFrame > settleFrame);

  return [
    frame(startFrame, 14, 0),
    frame(Math.min(DOCUMENT_MORPH_END_FRAME, startFrame + 4), -18, 0.72),
    frame(Math.min(DOCUMENT_MORPH_END_FRAME, startFrame + 9), -24, 1),
    frame(Math.min(DOCUMENT_MORPH_END_FRAME, startFrame + 15), 9, 1),
    frame(settleFrame, 0, 1),
    ...trackingFrames.map((absoluteFrame) => frame(absoluteFrame, 0, 1)),
  ];
}

function lineCollapseFrames(lineY: number): readonly TransformKeyframe[] {
  const targetY = 540 - lineY;
  return [
    { offset: 0, translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
    { offset: 0.2, translateX: 0, translateY: -6, scaleX: 1.02, scaleY: 0.96, rotation: 0, opacity: 1 },
    { offset: 0.58, translateX: 0, translateY: targetY * 0.78, scaleX: 0.44, scaleY: 0.18, rotation: 0, opacity: 0.82 },
    { offset: 0.82, translateX: 0, translateY: targetY, scaleX: 0.12, scaleY: 0.08, rotation: 0, opacity: 0.22 },
    { offset: 1, translateX: 0, translateY: targetY, scaleX: 0.05, scaleY: 0.05, rotation: 0, opacity: 0 },
  ];
}

function slidingLightProps(line: CopyLine) {
  return {
    textColor: line.color,
    lightColor: "#d96843",
    fontSize: line.fontSize,
    letterSpacing: line.role === "label" ? 1.5 : 0.05,
    lineGap: 0.08,
    barWidth: 98,
    trailLength: line.role === "title" ? 34 : 24,
    barOpacity: 0.11,
    startVisible: 10,
    barHeight: 1.18,
    edgeSoftness: 18,
    glowRadius: 8,
  } as const;
}

/** Scene 7: Script Agent opens a document and writes the Fourier project overview. */
export default defineProject(
  <Project
    id="fourier-ad-scene-7"
    version="1.0"
    audioSampleRate={48_000}
    duration="390f"
  >
    <Canvas
      width={1920}
      height={1080}
      fps={30}
      background="#000000"
      colorSpace="sRGB"
    />

    <Timeline>
      <ReactLayer
        id="script-agent-document-world"
        at="0f"
        duration="390f"
        preview
        component="components/SceneSevenScriptDocument.tsx"
        x={960}
        y={540}
        width={1920}
        height={1080}
        layer={10}
      />

      {SCENE_SEVEN_LINES.map((line, index) => {
        const durationFrames = DOCUMENT_MORPH_END_FRAME - line.startFrame;
        return (
          <Text
            key={line.id}
            id={`fourier-project-${line.id}`}
            at={`${line.startFrame}f`}
            duration={`${durationFrames}f`}
            preview
            role={line.role}
            content={line.content}
            x={960}
            y={line.y}
            width={1260}
            height={line.height}
            layer={30 + index}
            font={FONT}
            fontSize={line.fontSize}
            lineHeight={1.08}
            color={line.color}
            align="left"
            verticalAlign="center"
            overflow="clip"
          >
            <Motion
              id={`sliding-light-${line.id}`}
              at="0f"
              duration="22f"
              fill="both"
              component="SlidingLightMotion.tsx"
              props={slidingLightProps(line)}
            />
            <Transform
              id={`float-drop-${line.id}`}
              at="0f"
              duration={`${durationFrames}f`}
              fill="both"
              easing="linear"
              keyframes={lineFloatAndDropFrames(line.startFrame)}
            />
            <Transform
              id={`collapse-${line.id}`}
              at={`${DOCUMENT_COMPLETE_FRAME - line.startFrame}f`}
              duration={`${DOCUMENT_MORPH_END_FRAME - DOCUMENT_COMPLETE_FRAME}f`}
              fill="forwards"
              easing="cubic-bezier(.4,0,.2,1)"
              keyframes={lineCollapseFrames(line.y)}
            />
          </Text>
        );
      })}

      <ReactLayer
        id="document-icon-launch"
        at="300f"
        duration="90f"
        preview
        component="components/SceneSevenDocumentLaunch.tsx"
        x={960}
        y={540}
        width={1920}
        height={1080}
        layer={100}
      />
    </Timeline>
  </Project>,
);
