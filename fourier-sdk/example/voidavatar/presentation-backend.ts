import type { AvatarBackend } from "@fourier-video/sdk/avatar";
import { createVoidBackend } from "./cubism-source.ts";

/** Shared 1080p framing for the text-free reels, including optional cat close-up. */
export async function createPresentationBackend(): Promise<AvatarBackend> {
  const backend = await createVoidBackend();
  return { canvas: [1920, 1080], textures: backend.textures,
    sample(parameters) {
      const zoom = parameters.DemoZoom ?? 1, x = parameters.DemoX ?? 0, y = parameters.DemoY ?? 0;
      const focus = parameters.DemoCatFocus ?? 0;
      return backend.sample(parameters).map(drawable => {
        const vertices = new Float32Array(drawable.vertices.length);
        for (let i = 0; i < vertices.length; i += 2) {
          vertices[i] = (drawable.vertices[i]! * .6 + 510) * zoom + x;
          vertices[i + 1] = (drawable.vertices[i + 1]! * .6 + 70) * zoom + y;
        }
        return { ...drawable, vertices, opacity: drawable.opacity * (drawable.id.startsWith("Cat") ? 1 : 1 - focus) };
      });
    }, dispose() { backend.dispose(); } };
}
