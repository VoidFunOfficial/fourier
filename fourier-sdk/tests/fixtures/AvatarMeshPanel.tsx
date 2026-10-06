import { Avatar, defineAvatar, defineReact, defineSchema } from "@fourier-video/sdk/avatar";
const texture = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#00aaff"/></svg>');
const mask = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><circle cx="32" cy="32" r="24" fill="white"/></svg>');
const model = defineAvatar({ version: 1, name: "mesh-mask", canvas: [64, 64], layers: [
  { id: "mask", texture: mask, size: [64, 64], maskOnly: true },
  { id: "face", texture, masks: ["mask"], mesh: { vertices: [0, 0, 64, 0, 64, 64, 0, 64], uvs: [0, 0, 1, 0, 1, 1, 0, 1], indices: [0, 1, 2, 0, 2, 3], blendShapes: { HeadYaw: [0, 0, -24, 0, 0, 0, 24, 0] } } },
], motions: { turn: { duration: 2, tracks: [{ parameter: "HeadYaw", keys: [{ t: 0, value: -1 }, { t: 2, value: 1 }] }] } } });
export default defineReact({ name: "AvatarMeshPanel", schema: defineSchema({}),
  component() { return <Avatar model={model} idle={false} actions={[{ at: 0, action: "motion", name: "turn", duration: 2 }]} />; },
  designPreview() { return { props: {}, composition: { width: 128, height: 128, durationSeconds: 2 } }; },
});
