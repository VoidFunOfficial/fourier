# Work · Play — reference reconstruction

Reference: https://www.youtube.com/watch?v=QB7uqR3f_po

The supplied local `clone.mp4` is the visual and audio reference inspected for this reconstruction. The YouTube page did not return metadata in this environment; the local clip is the authoritative reference for every shot below. Its picture is 1280×720, 24 fps, 457 frames (19.0416667 seconds). Its AAC container extends slightly beyond the last picture. The master keeps the picture duration and original edit cadence, rendered at 1920×1080.

The reference has been inspected through full-resolution frames and quarter-second contact sheets under `reference/`. Source footage and reference frame sheets never enter the video project. All scenes are rebuilt with SDK React, SVG and FourierMotion. The supplied reference soundtrack is extracted to local PCM and trimmed to the last picture, preserving sync.

## Scene breakdown / director draft

| Scene | Frames, end exclusive | Visual purpose / movement |
|---|---:|---|
| 01-orbit | 0–76 | Eight creative-tool discs emerge from a defocused colour field, rotate in depth, turn edge-on, then resolve to a vertical tool stack. |
| 02-edit | 76–198 | The stack becomes four editing lanes. Lanes stretch right, the pointer trims and duplicates the teal effect, then a cube lane and red playhead demonstrate composition. |
| 03-export | 198–264 | Hard cut to charcoal. A white bar contracts, fills with the same colours, and the camera accelerates toward its rounded end and 100%. |
| 04-switch | 264–298 | The filled bar retracts into a dark glass capsule. Light sweeps through it, revealing an hourglass and four coloured dots. |
| 05-play | 298–351 | A game loadout emerges through a blue/teal halo and registration grid. Camera settles on the full screen, then pushes into Continue for a pointer click. |
| 06-playstation | 351–377 | White PlayStation mark on charcoal; restrained scale settling. |
| 07-work-play | 377–433 | Work and Play flank four coloured dots. The lockup gently recedes. |
| 08-credit | 433–457 | Tiny original author credit, yukaji, centered on charcoal. |

## Polish decisions

- Composition is measured in the reference's 1280×720 coordinate space and uniformly scaled by the stage.
- Keep the reference's unusually generous negative space; do not add headings, labels or explanatory copy.
- Reuse colour across discs, tracks, loading bar, skill meters and the final four-dot motif.
- Maintain track icon alignment and clipped right edges. The pointer travels to the actual trim edge and button.
- Use scene-local Motion keyframes only. The root only orders scenes and owns the soundtrack.
- Key acceptance moments: 1.25, 3.5, 5.25, 7.5, 9.5, 11.75, 13.5, 14.25, 15.75 and 18.5 seconds.

## Reuse and provenance

- Inspected Fourier World search; unavailable (`Was there a typo in the url or port?`). Continued with local components.
- `components/Gradient.tsx` adapts the exported blob-motion function from `fourier-styles/sonduckfilm/grainy-matte-gradient/GrainyMatteGradient.tsx`; no nested Motion root is copied.
- Inspected `ConnectionPointLoadingCard`, `TwoStageBlurTextReveal`, and the existing ad window/cursor components. Their visible chrome and text effects differ from the reference; the scene compositions use small reusable visual elements that match this clip.
- SF Pro subset is reused from `ad-apple/assets/fonts/SF-Pro-subset.woff` (Apple system font); Montserrat Medium from `fourier-ad/fonts`, retained as a local alternate.
- PlayStation logo and game-character silhouette are vector reconstructions of the supplied reference. They are reference brand/character content, not new Fourier branding. Original creator credit is retained.
- `assets/audio/reference-master.wav` derives from the user-supplied local clip; source soundtrack attribution/rights remain those of the reference. No remote resources are fetched during rendering.

This is a reconstruction, not a claim of a pixel-identical export of the original After Effects project. Verification records measured output properties and visual comparison separately.
