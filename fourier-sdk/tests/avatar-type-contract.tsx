import { Avatar, defineAvatar, type AvatarAction, type CubismCore } from "../src/avatar.ts";
import moc from "../example/voidavatar/cubism/voidavatar.moc3";
void <Avatar model={moc} gesture="nod" />;
const model = defineAvatar({ version: 1, name: "typed", canvas: [100, 100], layers: [] });
void <Avatar model={moc} rig={model} gesture="wave" />;
// @ts-expect-error A mesh rig is validated model data, not a file URL.
void <Avatar model={moc} rig="demo-rig.json" />;
const action: AvatarAction = { at: 0, action: "point", target: "equation" };
void <Avatar model={model} targets={{ equation: [0.2, 0.3] }} actions={[action]} />;
// @ts-expect-error Speech must be prepared, raw text cannot infer timings during rendering.
void <Avatar model={model} speak="hello" />;
// @ts-expect-error Misspelled actions must fail at the author boundary.
const bad: AvatarAction = { at: 0, action: "nood" };
// @ts-expect-error Core is an actual provider, not an arbitrary URL.
const core: CubismCore = "https://example.test/core.js";
void bad; void core;
