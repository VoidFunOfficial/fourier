import { voidavatarExpressions } from "./expressions.ts";
import { defineAvatar, type AvatarBinding, type AvatarLayer, type AvatarPoint } from "@fourier-video/sdk/avatar";

function bind(parameter: string, property: AvatarBinding["property"], values: readonly (readonly [number, number])[], blend: AvatarBinding["blend"] = "add"): AvatarBinding {
  return { parameter, property, blend, keys: values.map(([t, value]) => ({ t, value })) };
}
function pivot(id: string, anchor: AvatarPoint, parent: string, bindings: readonly AvatarBinding[] = []): AvatarLayer {
  // Mesh vertices already use the original 1600 × 1600 Cubism canvas coordinates.
  return { id, parent, anchor, position: anchor, bindings };
}
function eye(side: "L" | "R", anchor: AvatarPoint): readonly AvatarLayer[] {
  const gaze = [
    bind("EyeX", "x", [[-1, -7], [1, 7]]), bind("EyeY", "y", [[-1, -5], [1, 5]]),
    bind("ExprGazeX", "x", [[-1, -12], [1, 12]]), bind("ExprGazeY", "y", [[-1, -8], [1, 8]]),
  ];
  return [
    pivot(`Eye${side}`, anchor, "head", gaze),
    pivot(`EyeHalf${side}`, anchor, "head", gaze),
    pivot(`EyeClosed${side}`, anchor, "head", gaze),
    // Brows follow the head/body, independently of eye gaze and blinking.
    pivot(`Brow${side}`, anchor, "head"),
  ];
}

/** Secondary motion only: head XYZ is already applied by the native Cubism export. */
export const voidavatarDemoRig = defineAvatar({
  version: 1, name: "voidavatar motion demo", canvas: [1600, 1600],
  parameters: {
    EyeArt: [0, 15, 0], BrowArt: [0, 15, 0],
    HandPropL: [0, 10, 0], HandPropR: [0, 10, 0],
    PropScale: [.5, 1.5, 1], PropAngle: [-45, 45, 0], PropOpacity: [0, 1, 1],
    BrowAngleL: [-1, 1, 0], BrowAngleR: [-1, 1, 0],
    ExprGazeX: [-1, 1, 0], ExprGazeY: [-1, 1, 0],
    BodyRoll: [-1, 1, 0], HairSide: [-1, 1, 0], SleeveFollow: [-1, 1, 0],
    BodyBounce: [-1, 1, 0], BodySquash: [-1, 1, 0],
    HairSway: [-1, 1, 0], HairFan: [0, 1, 0], HairCurl: [-1, 1, 0],
    CatBreath: [0, 1, 0], CatBounce: [-1, 1, 0], CatSquash: [-1, 1, 0],
    CatHeadTurn: [-1, 1, 0], CatHeadTilt: [-1, 1, 0],
    CatTailSwing: [-1, 1, 0], CatTailCurl: [-1, 1, 0],
    CatEarL: [-1, 1, 0], CatEarR: [-1, 1, 0],
    CatEyeOpenL: [0, 1, 1], CatEyeOpenR: [0, 1, 1],
  },
  expressions: voidavatarExpressions,
  layers: [
    { id: "body", position: [718, 1400], anchor: [718, 1400], bindings: [
      bind("Breath", "scaleY", [[0, 1], [1, 1.014]], "multiply"),
      // Bounce through the shared ankle pivot: the neck, sleeves and trousers
      // stay connected while the silhouette anticipates, stretches and settles.
      bind("BodyBounce", "scaleY", [[-1, .976], [0, 1], [1, 1.032]], "multiply"),
      bind("BodySquash", "scaleY", [[-1, 1.06], [0, 1], [1, .94]], "multiply"),
      bind("BodySquash", "scaleX", [[-1, .964], [0, 1], [1, 1.038]], "multiply"),
      bind("BodyYaw", "scaleX", [[-1, .975], [0, 1], [1, .975]], "multiply"),
      bind("BodyYaw", "x", [[-1, -10], [1, 10]]),
      bind("BodyPitch", "scaleY", [[-1, .98], [0, 1], [1, 1.018]], "multiply"),
      bind("BodyRoll", "rotation", [[-1, -5.5], [1, 5.5]]),
    ] },
    // Identity head node preserves common body motion without applying head XYZ twice.
    pivot("head", [718, 900], "body"),
    pivot("FaceSkin", [718, 900], "head"),
    // Root-pinned hair bending happens on native vertices in hair-backend.ts.
    // These identity nodes apply the same whole-body motion as the face.
    pivot("HairBack", [718, 430], "head"),
    pivot("HairFront", [718, 430], "head"),
    pivot("HairSideL", [440, 450], "head"),
    pivot("HairSideR", [1000, 450], "head"),
    pivot("Ahoge2", [710, 275], "head"),
    pivot("HairClip", [920, 520], "head"),
    ...eye("L", [588, 797]), ...eye("R", [838, 799]),
    pivot("HoodieTorso", [718, 1210], "body"),
    // The sleeve backend pins the visible shoulder seam and bends the sleeve
    // before this shared body transform; never rotate its attachment twice.
    pivot("SleeveL", [580, 927], "body"),
    pivot("SleeveR", [850, 927], "body"),
    // Prop geometry is already attached to the bent palm. Apply the same
    // body motion once, including the original-paint hand occlusion layer.
    pivot("HandPropL", [580, 927], "body"),
    pivot("HandPropR", [850, 927], "body"),
    pivot("HandGripL", [580, 927], "body"),
    pivot("HandGripR", [850, 927], "body"),
    pivot("Pants2", [718, 1400], "body"),
    // All three cat pieces share the paw-level pivot, including on a small hop.
    // The cat has its own rhythm instead of borrowing the girl's breathing.
    { id: "cat", anchor: [1035, 1503.5], position: [1035, 1503.5], bindings: [
      bind("CatBreath", "scaleY", [[0, 1], [1, 1.038]], "multiply"),
      bind("CatBreath", "scaleX", [[0, 1], [1, 1.012]], "multiply"),
      { parameter: "CatBounce", property: "y", keys: [{ t: -1, value: 0 }, { t: 0, value: 0, easing: "smooth" }, { t: 1, value: -26 }] },
      bind("CatSquash", "scaleY", [[-1, 1.075], [0, 1], [1, .91]], "multiply"),
      bind("CatSquash", "scaleX", [[-1, .965], [0, 1], [1, 1.06]], "multiply"),
      bind("CatHeadTurn", "rotation", [[-1, -2], [1, 2]]),
    ] },
    pivot("CatBody", [1035, 1503.5], "cat"),
    pivot("CatHead", [1030, 1426], "cat", [
      bind("CatHeadTilt", "rotation", [[-1, -12], [1, 12]]),
      bind("CatHeadTurn", "x", [[-1, -8], [1, 8]]),
      bind("CatHeadTurn", "scaleX", [[-1, .965], [0, 1], [1, .965]], "multiply"),
    ]),
    pivot("CatTail", [1128, 1480], "cat", [bind("CatTailSwing", "rotation", [[-1, -19], [1, 19]])]),
  ],
  physics: [
    { input: "HeadRoll", output: "HairFront", stiffness: 64, damping: 8.5, gain: -1.8 },
    { input: "HeadRoll", output: "HairBack", stiffness: 27, damping: 5.4, gain: -1.9 },
    { input: "HeadYaw", output: "HairSide", stiffness: 40, damping: 6.5, gain: -1.45 },
    { input: "BodyRoll", output: "SleeveFollow", stiffness: 28, damping: 5.8, gain: -1.45 },
  ],
});
