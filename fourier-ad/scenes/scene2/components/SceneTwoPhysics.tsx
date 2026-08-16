import {
  FourierMotion,
  defineReact,
  loadFont,
  motion,
  type CSSProperties,
  type FourierMotionTarget,
} from "@fourier-video/sdk";
import {
  createPhy2dWorld,
  type Phy2dSoftBodySnapshot,
  type Phy2dWorldSnapshot,
} from "@fourier-video/sdk/phy2d";
import { Universe, World, defineCamera } from "@fourier-video/sdk/universe";
import beautyRushFontUrl from "../../../fonts/BlueScreenPersonalUseRegular.ttf";

const FPS = 30;
const DURATION_SECONDS = 9;
const DURATION_FRAMES = FPS * DURATION_SECONDS;
const WORLD_WIDTH = 7_000;
const WORLD_HEIGHT = 1_000;
const FLOOR_Y = 850;
const LETTER_RADIUS = 82;
const BALL_RADIUS = 46;
const BALL_RELEASE_FRAME = 72;
const beautyRushFont = loadFont(beautyRushFontUrl, { weight: 900 });
const WORD_CENTER_X = 1_010;
const INITIAL_CAMERA_Y = 610;
const INITIAL_CAMERA_ZOOM = 0.9;
const PUSH_START_FRAME = DURATION_FRAMES - FPS * 2;
const PUSH_END_FRAME = PUSH_START_FRAME + 38;

const LETTERS = [
  { glyph: "F", x: 440, release: 24 },
  { glyph: "o", x: 630, release: 29 },
  { glyph: "u", x: 820, release: 34 },
  { glyph: "r", x: 1_010, release: 39 },
  { glyph: "i", x: 1_200, release: 44 },
  { glyph: "e", x: 1_390, release: 49 },
  { glyph: "r", x: 1_580, release: 54 },
] as const;

interface BakedPhysics {
  readonly snapshots: readonly Phy2dWorldSnapshot[];
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function bakePhysics(): BakedPhysics {
  const world = createPhy2dWorld({
    width: WORLD_WIDTH,
    height: WORLD_HEIGHT,
    damping: 0.982,
    solverIterations: 9,
    wallPadding: 150,
  });

  for (const letter of LETTERS) {
    world.addSoftBody({
      center: { x: letter.x, y: 280 },
      radius: LETTER_RADIUS,
      particleCount: 20,
      phase: -Math.PI / 2,
      structuralStiffness: 0.91,
      bendingStiffness: 0.32,
      shapeStiffness: 0.035,
      pressureStiffness: 0.12,
    });
  }

  world.addSoftBody({
    center: { x: LETTERS[0].x, y: 170 },
    radius: BALL_RADIUS,
    particleCount: 18,
    phase: -Math.PI / 2,
    structuralStiffness: 0.88,
    bendingStiffness: 0.26,
    shapeStiffness: 0.025,
    pressureStiffness: 0.1,
  });

  const snapshots: Phy2dWorldSnapshot[] = [world.snapshot()];
  let hasLaunched = false;
  let launchTicks = 0;

  for (let frame = 0; frame < DURATION_FRAMES; frame += 1) {
    const before = world.snapshot();
    const fBody = before.bodies[0]!;
    const ball = before.bodies[LETTERS.length]!;

    if (
      !hasLaunched &&
      frame >= BALL_RELEASE_FRAME &&
      Math.hypot(ball.center.x - fBody.center.x, ball.center.y - fBody.center.y) < 138
    ) {
      hasLaunched = true;
      launchTicks = 6;
    }

    const letterAccelerations = LETTERS.map((letter) =>
      frame >= letter.release ? { x: 0, y: 1.18 } : { x: 0, y: 0 }
    );
    const ballAcceleration = frame < BALL_RELEASE_FRAME
      ? { x: 0, y: 0 }
      : launchTicks > 0
        ? { x: 7.4, y: -9.2 }
        : { x: 0.08, y: 0.72 };

    world.step({
      bodyAccelerations: [...letterAccelerations, ballAcceleration],
      collisionRelaxation: 0.5,
      targetAreaScale: 1,
      targetStructureScale: 1,
    });
    if (launchTicks > 0) launchTicks -= 1;
    snapshots.push(world.snapshot());
  }

  return Object.freeze({ snapshots: Object.freeze(snapshots) });
}

const PHYSICS = bakePhysics();
const BALL_INDEX = LETTERS.length;

function bodyBounds(body: Phy2dSoftBodySnapshot) {
  const xs = body.particles.map((particle) => particle.x);
  const ys = body.particles.map((particle) => particle.y);
  return {
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

function bodyRotation(body: Phy2dSoftBodySnapshot): number {
  const marker = body.particles[0]!;
  return Math.atan2(marker.y - body.center.y, marker.x - body.center.x) * 180 / Math.PI + 90;
}

function bodyTransform(
  body: Phy2dSoftBodySnapshot,
  radius: number,
  boxSize: number,
  opacity = 1,
  offset = 0,
): FourierMotionTarget {
  const bounds = bodyBounds(body);
  return {
    x: body.center.x - boxSize / 2,
    y: body.center.y - boxSize / 2,
    scaleX: clamp(bounds.width / (radius * 2), 0.56, 1.55),
    scaleY: clamp(bounds.height / (radius * 2), 0.56, 1.55),
    rotate: bodyRotation(body),
    opacity,
    offset,
  };
}

function letterFrames(index: number): readonly FourierMotionTarget[] {
  const release = LETTERS[index]!.release;
  return PHYSICS.snapshots.map((snapshot, frame) =>
    bodyTransform(
      snapshot.bodies[index]!,
      LETTER_RADIUS,
      190,
      frame < release ? 0 : 1,
      frame / DURATION_FRAMES,
    )
  );
}

function ballFrames(delayFrames = 0, ghost = false): readonly FourierMotionTarget[] {
  return PHYSICS.snapshots.map((snapshot, frame) => {
    const movingSourceFrame = Math.max(0, frame - delayFrames);
    const sourceFrame = frame >= PUSH_START_FRAME
      ? PUSH_START_FRAME
      : movingSourceFrame;
    const body = PHYSICS.snapshots[sourceFrame]!.bodies[BALL_INDEX]!;
    const previous = PHYSICS.snapshots[Math.max(0, sourceFrame - 1)]!.bodies[BALL_INDEX]!;
    const speed = Math.hypot(
      body.center.x - previous.center.x,
      body.center.y - previous.center.y,
    );
    const visible = frame >= BALL_RELEASE_FRAME - 12;
    const pushTrailFade = ghost
      ? clamp((PUSH_START_FRAME + 7 - frame) / 7, 0, 1)
      : 1;
    const opacity = !visible
      ? 0
      : ghost
        ? clamp((speed - 2) / 28, 0, 1) * Math.max(0.04, 0.3 - delayFrames * 0.018) * pushTrailFade
        : 1;
    return {
      ...bodyTransform(body, BALL_RADIUS, BALL_RADIUS * 2, opacity, frame / DURATION_FRAMES),
      filter: ghost
        ? `blur(${7 + delayFrames * 0.9}px)`
        : frame >= PUSH_START_FRAME
          ? "blur(0px)"
          : `blur(${clamp(speed * 0.045, 0, 2.2)}px)`,
    };
  });
}

const BALL_FRAMES = ballFrames();
const BLUR_TRAILS = [2, 4, 6, 8, 10, 13].map((delay) => ({
  delay,
  frames: ballFrames(delay, true),
}));

const camera = defineCamera({
  width: 1920,
  height: 1080,
  initial: {
    x: WORD_CENTER_X,
    y: INITIAL_CAMERA_Y,
    zoom: INITIAL_CAMERA_ZOOM,
    rotation: 0,
  },
  moves: PHYSICS.snapshots.slice(1).map((snapshot, index) => {
    const frame = index + 1;
    const ball = PHYSICS.snapshots[Math.min(frame, PUSH_START_FRAME)]!.bodies[BALL_INDEX]!;
    const trackingProgress = clamp(
      (frame - BALL_RELEASE_FRAME) / 18,
      0,
      1,
    );
    const pushProgress = clamp(
      (frame - PUSH_START_FRAME) / (PUSH_END_FRAME - PUSH_START_FRAME),
      0,
      1,
    );
    const pushEase = 1 - (1 - pushProgress) ** 4;
    const trackingZoom = INITIAL_CAMERA_ZOOM + trackingProgress * 0.12;
    return {
      at: `${frame - 1}f`,
      duration: "1f",
      to: {
        kind: "pose" as const,
        x: WORD_CENTER_X + (ball.center.x - WORD_CENTER_X) * trackingProgress,
        y: INITIAL_CAMERA_Y + (ball.center.y - INITIAL_CAMERA_Y) * trackingProgress,
        zoom: trackingZoom * (1 + pushEase * 88),
      },
      path: { kind: "linear" as const },
      ease: "linear" as const,
    };
  }),
});

const fullFrameStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
};

function SceneTwoWorld() {
  return (
    <div
      aria-label="Soft Fourier letters and a tracked blue bouncing ball"
      style={{ ...fullFrameStyle, overflow: "hidden", background: "#ffffff" }}
    >
      <FourierMotion>
        <Universe camera={camera} overscan={0.6}>
          <World
            id="physics-stage"
            x={WORLD_WIDTH / 2}
            y={WORLD_HEIGHT / 2}
            width={WORLD_WIDTH}
            height={WORLD_HEIGHT}
            zIndex={0}
            cull="never"
          >
            <div style={{ ...fullFrameStyle, background: "#ffffff" }} />

            <motion.div
              aria-hidden="true"
              animate={[
                { scaleX: 0, opacity: 1, offset: 0 },
                { scaleX: 0, opacity: 1, offset: 0.025 },
                { scaleX: 1.04, opacity: 1, offset: 0.105 },
                { scaleX: 1, opacity: 1, offset: 0.135 },
                { scaleX: 1, opacity: 1, offset: 1 },
              ]}
              transition={{ ease: [0.22, 1, 0.36, 1] }}
              style={{
                position: "absolute",
                left: 285,
                top: FLOOR_Y - 5,
                width: 1_500,
                height: 10,
                borderRadius: 999,
                background: "#101820",
                transformOrigin: "50% 50%",
              }}
            />

            {LETTERS.map((letter, index) => (
              <motion.span
                key={`${letter.glyph}-${index}`}
                aria-hidden="true"
                animate={letterFrames(index)}
                transition={{ ease: "linear" }}
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  width: 190,
                  height: 190,
                  display: "grid",
                  placeItems: "center",
                  color: "#101820",
                  fontFamily: beautyRushFont,
                  fontSize: 206,
                  fontWeight: 900,
                  WebkitTextStroke: "2px #101820",
                  lineHeight: 1,
                  transformOrigin: "50% 50%",
                  willChange: "transform, opacity",
                }}
              >
                {letter.glyph}
              </motion.span>
            ))}

            {BLUR_TRAILS.slice().reverse().map((trail) => (
              <motion.div
                key={trail.delay}
                aria-hidden="true"
                animate={trail.frames}
                transition={{ ease: "linear" }}
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  width: BALL_RADIUS * 2,
                  height: BALL_RADIUS * 2,
                  borderRadius: "46% 54% 49% 51% / 52% 45% 55% 48%",
                  background: "#2697ff",
                  transformOrigin: "50% 50%",
                  willChange: "transform, opacity, filter",
                }}
              />
            ))}

            <motion.div
              aria-label="Tracked blue soft ball"
              animate={BALL_FRAMES}
              transition={{ ease: "linear" }}
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: BALL_RADIUS * 2,
                height: BALL_RADIUS * 2,
                borderRadius: "46% 54% 49% 51% / 52% 45% 55% 48%",
                background: "radial-gradient(circle at 34% 28%, #bde7ff 0 8%, #2697ff 30%, #006ee6 78%, #004aa8 100%)",
                transformOrigin: "50% 50%",
                willChange: "transform, opacity, filter",
              }}
            />

          </World>
        </Universe>

      </FourierMotion>
    </div>
  );
}

export const SceneTwoPhysics = defineReact({
  name: "SceneTwoPhysics",
  schema: {},
  component() {
    return <SceneTwoWorld />;
  },
  designPreview() {
    return {
      props: {},
      composition: { width: 1920, height: 1080, durationSeconds: DURATION_SECONDS },
      player: { background: "#ffffff", loop: true },
    };
  },
});

export default SceneTwoPhysics;
