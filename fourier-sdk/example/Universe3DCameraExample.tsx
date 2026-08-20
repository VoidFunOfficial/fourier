import { createFourierPrng, defineReact } from "@fourier-video/sdk/react";
import {
  FourierMotion,
  motion,
  type FourierMotionTarget,
} from "@fourier-video/sdk/motion";
import {
  Universe3D,
  World3D,
  defineCamera3D,
} from "@fourier-video/sdk/universe-3d";

const turnRandom = createFourierPrng("universe-3d-camera-example:rear-turns");
const offsetRandom = createFourierPrng("universe-3d-camera-example:offsets");
const radii = [760, 1_500, 2_300, 3_100] as const;
const cameraYaws = [0];
const rearTurns = [-1, 1, -1] as const;

for (let index = 1; index < radii.length; index += 1) {
  const direction = rearTurns[index - 1]!;
  // These are all large rear turns. Alternating around 158/192 degrees keeps
  // successive rear targets offset without letting target 2 and 4 share a ray.
  const rearAngle = index === 2
    ? 190 + turnRandom() * 4
    : 154 + turnRandom() * 6;
  cameraYaws.push(cameraYaws[index - 1]! + direction * rearAngle);
}

const placements = Object.freeze(radii.map((radius, index) => {
  const ry = cameraYaws[index]!;
  const radians = ry * Math.PI / 180;
  const verticalDirection = index % 2 === 0 ? -1 : 1;
  const y = index === 0
    ? -72
    : verticalDirection * (72 + offsetRandom() * 72);
  return Object.freeze({
    x: -Math.sin(radians) * radius,
    y,
    z: -Math.cos(radians) * radius,
    rx: Math.atan2(y, radius) * 180 / Math.PI,
    ry,
    rz: 0,
  });
}));

const aims = placements.map(({ rx, ry, rz }) => Object.freeze({ rx, ry, rz }));

function passTarget(
  previous: (typeof aims)[number],
  target: (typeof aims)[number],
) {
  return Object.freeze({
    rx: target.rx + (target.rx - previous.rx) * 0.08,
    ry: target.ry + (target.ry - previous.ry) * 0.08,
    rz: 0,
  });
}

const camera = defineCamera3D({
  fov: 48,
  initial: { x: 0, y: 0, z: 0, ...aims[0]! },
  moves: [
    // x/y/z never move. Each rotation turns about 170 degrees toward what was
    // behind the camera, passes it, then rebounds onto the next card.
    { at: "98f", duration: "62f", to: passTarget(aims[0]!, aims[1]!), ease: "ease-in-out" },
    { at: "160f", duration: "18f", to: aims[1]!, ease: "ease-out" },
    { at: "274f", duration: "62f", to: passTarget(aims[1]!, aims[2]!), ease: "ease-in-out" },
    { at: "336f", duration: "18f", to: aims[2]!, ease: "ease-out" },
    { at: "450f", duration: "62f", to: passTarget(aims[2]!, aims[3]!), ease: "ease-in-out" },
    { at: "512f", duration: "18f", to: aims[3]!, ease: "ease-out" },
  ],
});

const cards = [
  {
    id: "this-is",
    text: "This is ",
    ...placements[0]!,
    ...aims[0]!,
    scale: 1,
    reveal: 8 / 720,
    hide: 84 / 720,
    color: "#6fc8ff",
    fill: "#173c5b",
  },
  {
    id: "fourier",
    text: "Fourier",
    ...placements[1]!,
    ...aims[1]!,
    scale: 1.38,
    reveal: 184 / 720,
    hide: 260 / 720,
    color: "#8b7dff",
    fill: "#2c236c",
  },
  {
    id: "camera",
    text: "3D-Camera",
    ...placements[2]!,
    ...aims[2]!,
    scale: 1.78,
    reveal: 360 / 720,
    hide: 436 / 720,
    color: "#5fffe0",
    fill: "#124b46",
  },
  {
    id: "example",
    text: "Example",
    ...placements[3]!,
    ...aims[3]!,
    scale: 2.19,
    reveal: 536 / 720,
    hide: null,
    color: "#ffbd6b",
    fill: "#633916",
  },
] as const;

const decorationRandom = createFourierPrng("universe-3d-camera-example:decorations");
const decorationOffsets = [
  { yaw: -18, pitch: 23, kind: "ring" },
  { yaw: 22, pitch: -21, kind: "dash" },
  { yaw: -29, pitch: -27, kind: "spark" },
] as const;

const decorations = Object.freeze(aims.flatMap((aim, groupIndex) =>
  decorationOffsets.map((offset, decorationIndex) => {
    const radius = 4_600 + decorationRandom() * 900;
    const ry = aim.ry + offset.yaw + (decorationRandom() - 0.5) * 3;
    const rx = aim.rx + offset.pitch + (decorationRandom() - 0.5) * 3;
    const yawRadians = ry * Math.PI / 180;
    const pitchRadians = rx * Math.PI / 180;
    const horizontalRadius = Math.cos(pitchRadians) * radius;
    return Object.freeze({
      id: `fixed-decoration-${groupIndex}-${decorationIndex}`,
      kind: offset.kind,
      x: -Math.sin(yawRadians) * horizontalRadius,
      y: Math.sin(pitchRadians) * radius,
      z: -Math.cos(yawRadians) * horizontalRadius,
      rx,
      ry,
      rz: 0,
      width: offset.kind === "dash" ? 280 : offset.kind === "ring" ? 150 : 76,
      height: offset.kind === "dash" ? 26 : offset.kind === "ring" ? 150 : 76,
      rotation: (decorationRandom() - 0.5) * 80,
      color: cards[groupIndex]!.color,
    });
  })
));

function cardFrames(
  reveal: number,
  hide: number | null,
): readonly FourierMotionTarget[] {
  const entrance: FourierMotionTarget[] = [
    { visibility: "hidden", opacity: 0, scale: 0.7, filter: "blur(24px)", offset: 0 },
    { visibility: "hidden", opacity: 0, scale: 0.7, filter: "blur(24px)", offset: reveal },
    { visibility: "visible", opacity: 0, scale: 0.7, filter: "blur(24px)", offset: reveal },
    { visibility: "visible", opacity: 1, scale: 1.075, filter: "blur(0px)", offset: reveal + 0.045 },
    { visibility: "visible", opacity: 1, scale: 0.982, filter: "blur(0px)", offset: reveal + 0.068 },
    { visibility: "visible", opacity: 1, scale: 1, filter: "blur(0px)", offset: reveal + 0.088 },
  ];
  if (hide === null) {
    return [...entrance, { visibility: "visible", opacity: 1, scale: 1, filter: "blur(0px)", offset: 1 }];
  }
  return [
    ...entrance,
    { visibility: "visible", opacity: 1, scale: 1, filter: "blur(0px)", offset: hide },
    { visibility: "visible", opacity: 0, scale: 0.92, filter: "blur(16px)", offset: hide + 10 / 720 },
    { visibility: "hidden", opacity: 0, scale: 0.92, filter: "blur(16px)", offset: hide + 10 / 720 },
    { visibility: "hidden", opacity: 0, scale: 0.92, filter: "blur(16px)", offset: 1 },
  ];
}

function glowFrames(reveal: number): readonly FourierMotionTarget[] {
  return [
    { opacity: 0, scale: 0.84, offset: 0 },
    { opacity: 0, scale: 0.84, offset: reveal },
    { opacity: 0.86, scale: 1.08, offset: reveal + 0.045 },
    { opacity: 0.46, scale: 0.99, offset: reveal + 0.075 },
    { opacity: 0.68, scale: 1.025, offset: reveal + 0.11 },
    { opacity: 0.42, scale: 1, offset: reveal + 0.15 },
    { opacity: 0.5, scale: 1.01, offset: 1 },
  ];
}

function sweepFrames(reveal: number): readonly FourierMotionTarget[] {
  return [
    { x: -180, opacity: 0, offset: 0 },
    { x: -180, opacity: 0, offset: reveal },
    { x: -80, opacity: 0.08, offset: reveal + 0.018 },
    { x: 700, opacity: 0.2, offset: reveal + 0.075 },
    { x: 920, opacity: 0, offset: reveal + 0.11 },
    { x: 920, opacity: 0, offset: 1 },
  ];
}

function beamFrames(reveal: number): readonly FourierMotionTarget[] {
  return [
    { opacity: 0, scaleX: 0, offset: 0 },
    { opacity: 0, scaleX: 0, offset: reveal },
    { opacity: 0.9, scaleX: 0.08, offset: reveal + 0.015 },
    { opacity: 0.72, scaleX: 1, offset: reveal + 0.07 },
    { opacity: 0, scaleX: 1, offset: reveal + 0.11 },
    { opacity: 0, scaleX: 1, offset: 1 },
  ];
}

function characterFrames(
  index: number,
  count: number,
  reveal: number,
): readonly FourierMotionTarget[] {
  const center = (count - 1) / 2;
  const distance = Math.abs(index - center);
  const distanceRatio = distance / Math.max(1, center);
  const side = index < center ? -1 : index > center ? 1 : 0;
  const initialX = (center - index) * 54;
  const expand = reveal + 0.038 + distanceRatio * 0.012;
  const overshoot = reveal + 0.06 + distanceRatio * 0.015;
  const settle = reveal + 0.082 + distanceRatio * 0.018;
  return [
    {
      opacity: 0,
      x: initialX,
      scaleX: 0.18,
      rotateY: side * -16,
      filter: "blur(18px)",
      offset: 0,
    },
    {
      opacity: 0,
      x: initialX,
      scaleX: 0.18,
      rotateY: side * -16,
      filter: "blur(18px)",
      offset: reveal + distanceRatio * 0.012,
    },
    {
      opacity: 1,
      x: initialX * 0.075,
      scaleX: 1.055,
      rotateY: 0,
      filter: "blur(1px)",
      offset: expand,
    },
    {
      opacity: 1,
      x: side * 5,
      scaleX: 0.988,
      rotateY: 0,
      filter: "blur(0px)",
      offset: overshoot,
    },
    { opacity: 1, x: 0, scaleX: 1, rotateY: 0, filter: "blur(0px)", offset: settle },
    { opacity: 1, x: 0, scaleX: 1, rotateY: 0, filter: "blur(0px)", offset: 1 },
  ];
}

function Expand2LRLightCard(props: (typeof cards)[number]) {
  const characters = Array.from(props.text);
  return (
    <motion.div
      data-effect-expand2lr=""
      data-effect-light-effect-card=""
      animate={cardFrames(props.reveal, props.hide)}
      transition={{ ease: "linear", fill: "both" }}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        display: "grid",
        placeItems: "center",
        transformOrigin: "50% 50%",
        willChange: "transform, opacity, filter",
      }}
    >
      <motion.div
        aria-hidden="true"
        animate={glowFrames(props.reveal)}
        transition={{ ease: "linear", fill: "both" }}
        style={{
          position: "absolute",
          inset: 18,
          borderRadius: 72,
          background: props.color,
          filter: "blur(58px)",
          mixBlendMode: "screen",
          transformOrigin: "50% 50%",
          willChange: "transform, opacity",
        }}
      />

      <div
        style={{
          position: "relative",
          width: "calc(100% - 36px)",
          height: "calc(100% - 44px)",
          display: "grid",
          placeItems: "center",
          overflow: "hidden",
          border: `2px solid ${props.color}66`,
          borderRadius: 58,
          background: `linear-gradient(145deg, ${props.fill}f2, #06080dec)`,
          boxShadow: `0 24px 72px #000b, inset 0 1px 0 #ffffff24, 0 0 24px ${props.color}66`,
          isolation: "isolate",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(180deg, #ffffff16 0%, transparent 46%, #00000020 100%)",
          }}
        />
        <motion.div
          aria-hidden="true"
          animate={sweepFrames(props.reveal)}
          transition={{ ease: "linear", fill: "both" }}
          style={{
            position: "absolute",
            top: "-45%",
            bottom: "-45%",
            left: "-32%",
            width: "23%",
            rotate: "11deg",
            background: "linear-gradient(90deg, transparent, #ffffffb8, transparent)",
            filter: "blur(14px)",
            willChange: "transform, opacity",
          }}
        />

        <div
          aria-label={props.text.trim()}
          style={{
            position: "relative",
            zIndex: 1,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            color: "#f7fbff",
            fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
            fontSize: props.text.length > 8 ? 150 : 174,
            fontWeight: 760,
            lineHeight: 1,
            letterSpacing: "-0.045em",
            whiteSpace: "pre",
            textShadow: `0 0 18px ${props.color}aa`,
          }}
        >
          {characters.map((character, index) => (
            <motion.span
              key={`${index}:${character}`}
              animate={characterFrames(index, characters.length, props.reveal)}
              transition={{ ease: "linear", fill: "both" }}
              style={{
                display: "inline-grid",
                placeItems: "center",
                minWidth: character === " " ? "0.34em" : "0.58em",
                transformOrigin: "50% 55%",
                willChange: "transform, opacity, filter",
              }}
            >
              {character === " " ? "\u00a0" : character}
            </motion.span>
          ))}
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              left: "4%",
              right: "4%",
              bottom: -20,
              height: 2,
              pointerEvents: "none",
            }}
          >
            <motion.span
              animate={beamFrames(props.reveal)}
              transition={{ ease: "linear", fill: "both" }}
              style={{
                position: "absolute",
                top: 0,
                right: "50%",
                width: "50%",
                height: "100%",
                borderRadius: 999,
                background: `linear-gradient(90deg, transparent, ${props.color})`,
                boxShadow: `0 0 14px ${props.color}`,
                transformOrigin: "100% 50%",
              }}
            />
            <motion.span
              animate={beamFrames(props.reveal)}
              transition={{ ease: "linear", fill: "both" }}
              style={{
                position: "absolute",
                top: 0,
                left: "50%",
                width: "50%",
                height: "100%",
                borderRadius: 999,
                background: `linear-gradient(90deg, ${props.color}, transparent)`,
                boxShadow: `0 0 14px ${props.color}`,
                transformOrigin: "0% 50%",
              }}
            />
          </span>
        </div>
      </div>
    </motion.div>
  );
}

function FixedDecoration(props: (typeof decorations)[number]) {
  const common = {
    width: "100%",
    height: "100%",
    opacity: 0.28,
    transform: `rotate(${props.rotation}deg)`,
    filter: `drop-shadow(0 0 16px ${props.color}88)`,
  } as const;

  if (props.kind === "ring") {
    return (
      <div
        aria-hidden="true"
        data-fixed-decoration="ring"
        style={{
          ...common,
          border: `3px solid ${props.color}8a`,
          borderRadius: "50%",
          boxShadow: `inset 0 0 22px ${props.color}30`,
        }}
      />
    );
  }
  if (props.kind === "dash") {
    return (
      <div
        aria-hidden="true"
        data-fixed-decoration="dash"
        style={{
          ...common,
          borderRadius: 999,
          background: `linear-gradient(90deg, transparent, ${props.color}cc, transparent)`,
        }}
      />
    );
  }
  return (
    <div
      aria-hidden="true"
      data-fixed-decoration="spark"
      style={{
        ...common,
        border: `2px solid ${props.color}9a`,
        background: `${props.color}20`,
        boxShadow: `inset 0 0 18px ${props.color}44`,
      }}
    />
  );
}

function CameraExampleScene() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: "#000",
      }}
    >
      <FourierMotion>
        <Universe3D camera={camera}>
          {decorations.map((decoration) => (
            <World3D
              key={decoration.id}
              id={decoration.id}
              x={decoration.x}
              y={decoration.y}
              z={decoration.z}
              rx={decoration.rx}
              ry={decoration.ry}
              rz={decoration.rz}
              width={decoration.width}
              height={decoration.height}
            >
              <FixedDecoration {...decoration} />
            </World3D>
          ))}
          {cards.map((card) => (
            <World3D
              key={card.id}
              id={card.id}
              x={card.x}
              y={card.y}
              z={card.z}
              rx={card.rx}
              ry={card.ry}
              rz={card.rz}
              scale={card.scale}
              width={1_160}
              height={420}
            >
              <Expand2LRLightCard {...card} />
            </World3D>
          ))}
        </Universe3D>
      </FourierMotion>
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          boxShadow: "inset 0 0 180px 64px #000",
        }}
      />
    </div>
  );
}

export const Universe3DCameraExample = defineReact({
  name: "Universe3DCameraExample",
  schema: {},
  component() {
    return <CameraExampleScene />;
  },
  designPreview() {
    return {
      props: {},
      composition: { width: 1920, height: 1080, durationSeconds: 12 },
      player: { background: "#000000", loop: true },
    };
  },
});

export default Universe3DCameraExample;
