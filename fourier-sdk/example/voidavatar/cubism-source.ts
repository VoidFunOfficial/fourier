import source from "./cubism/voidavatar.moc3";
import { createAvatarMeshRig, createCubismAvatar, decodeAvatarMoc, type AvatarBackend } from "@fourier-video/sdk/avatar";
import { voidavatarDemoRig } from "./demo-rig.ts";
import { voidavatarNativeHeadMap } from "./native-head.ts";
import { createVoidavatarSleeveBackend } from "./sleeve-backend.ts";
import { createVoidavatarHairBackend } from "./hair-backend.ts";
import { createVoidavatarCatBackend } from "./cat-backend.ts";
import { createVoidavatarCatEyeBackend } from "./cat-eye-backend.ts";
import { createVoidavatarPaintedEyeBackend } from "./painted-eye-backend.ts";
import paintedEyes from "./art/cute-eyes-v2.png";
import paintedBrows from "./art/cute-brows-v2.png";
import { createVoidavatarHandPropsBackend } from "./hand-props-backend.ts";
import { voidavatarHandProps } from "./hand-props.ts";

/** The established export used by the Fourier eye, hair, cat, sleeve and prop backends. */
export const voidavatarHybridSource = Object.freeze({ ...source, parameterMap: voidavatarNativeHeadMap });

/** Prepared once by Avatar; all samples still use the shared Cubism/WebGL renderer. */
export async function createVoidBackend(): Promise<AvatarBackend> {
  const native = createCubismAvatar({ core: await source.createCore(), moc: decodeAvatarMoc(source.mocBase64),
    textures: source.textures, parameterMap: voidavatarNativeHeadMap });
  try {
    const sleeves = createVoidavatarSleeveBackend(native);
    const hair = createVoidavatarHairBackend(sleeves);
    const cat = createVoidavatarCatEyeBackend(createVoidavatarCatBackend(hair));
    const face = createVoidavatarPaintedEyeBackend(cat, paintedEyes, paintedBrows);
    const hands = createVoidavatarHandPropsBackend(face, voidavatarHandProps);
    return createAvatarMeshRig(hands, voidavatarDemoRig);
  }
  catch (error) { native.dispose(); throw error; }
}
