# Mac mini M6 — Fourier film

75 seconds · 1920 × 1080 · 60 fps · 20 independent scenes, 2–5 seconds each. Designed stereo sound effects; no BGM. Silver product cinematography, hand-drawn functional diagrams, flat animated artwork and restrained Apple-style typography.

The film is composed with the local Fourier SDK. The product model now comes directly from Apple’s public Mac mini AR USDZ. Blender imports its 74 meshes and original textures, then converts them to glTF without remeshing or decimation. The 50,084 source vertices, official port cavities, bottom grille and Apple mark are retained. `FourierCanvas` renders this model with absolute-time cameras and studio lighting. Binary data is split into lossless JSON chunks for the SDK source-size limit. Native `FourierMotion` drives the graphic motion. Each scene can be previewed and rendered independently; the root orders scenes and attaches the authored SFX master. The small motion source snapshots in `components/reused` keep the project within Fourier's standalone source boundary.

- Video: `output/Mac-mini-M6-1080p60-v4.mp4` (same bytes as `output/Mac-mini-M6-1080p60.mp4`)
- Editable project: `main.tsx`, `scenes/*`, `templates/ending/scenes/*`
- Blender source: `assets/model/mac-mini-official.blend`
- Rebuildable conversion: `scripts/import-official-model.py`
- Direction and polish: `STORYBOARD.md`
- Product facts, font and component provenance: `REFERENCE.md`
- Encoded-frame review and media checks: `review/`

Run from the workspace root:

```sh
python3 ad-apple/scripts/build-sfx.py
bun fourier-sdk/node_modules/typescript/bin/tsc -p ad-apple/tsconfig.json
bun fourier-render-engine/src/cli.ts validate ad-apple/main.tsx > ad-apple/review/project-validation.json
bun ad-apple/scripts/check.ts
bun ad-apple/scripts/preview.ts 06
bun fourier-render-engine/src/cli.ts render ad-apple/main.tsx --output ad-apple/output/Mac-mini-M6-1080p60.mp4 --overwrite --crf 17 --preset medium --dom-pages 1 --frame-concurrency 1
python3 ad-apple/scripts/verify-media.py
```

Blender regeneration and font subsetting:

```sh
blender --background --python ad-apple/scripts/import-official-model.py
python3 ad-apple/scripts/subset-fonts.py
```

Font subsetting reads the installed Apple San Francisco font and the existing Fourier-ad Heiti collection. It writes small local WOFF subsets; adding copy requires rerunning the script. Runtime assets do not make network requests. Local Chromium and Blender require a host environment in which their native sandbox and graphics services can start.

The two supplied YouTube pages were identified, but playback and transcript retrieval were unavailable in this session. The film is an original interpretation of the requested direction and the verified Apple product content; it does not contain reference-film footage.

## Website material revision

The front/rear callouts now use 6 px round-ended leaders, about 64–77 px long. Dimension endpoints also use short, bold marks. The rear camera follows an exterior orbit instead of interpolating through the enclosure.

Official website images now supply the creative media strips, three display workflows and display hardware, thermal view, iPhone Mirroring and local-AI scene. A four-second ending montage switches Productivity → Creativity → STEM → Gaming → Coding using all ten official gallery images. The enclosure is a single unanimated image layer: its pixels remain identical across all five phases, while the desk, peripherals and applications switch.

The original first cut remains in `output/v1/`. Source URLs, original file hashes and all downloaded assets are retained in `assets/official/sources.json`. `review/official-model-conversion.json` records conversion integrity; `review/ending-product-lock.json` verifies the fixed ending product.

If Chromium context creation fails during a batch render, `python3 ad-apple/scripts/render-scenes.py` renders the same independent Scenes through the same Fourier engine in separate processes. It temporarily isolates one Scene in the root entrypoint, restores the full entrypoint in `finally`, and warms the normal render cache. Run the standard full-film render afterward to assemble the final 75-second output.

## Faster rhythm and handwriting revision

The main narrative is now 62 seconds (previously 72); the 3D camera timing is scaled with the revised scene durations. The five official workflows switch every 0.7 seconds with the Mac mini fixed. Two independent scenes follow: 29 independent SVG pen strokes write `ALL IN` / `MAC mini`, then the exact requested attribution appears: `this video` / `完全由 Fourier Harness + GPT6` / `独立完成`. Total: 75 seconds, 4500 frames.

The ending is composed by `templates/ending/main.tsx`; its three scenes remain independently editable and previewable. This keeps the root at 18 render-module declarations within the existing compiler queue. The original engine limits are unchanged. The SDK example snapshot and font are local; provenance is in `review/handwriting-source.json`.

The previous uploaded revision and its manifest/acceptance record are retained in `output/v2/`; previous editable source is archived in `review/v2-source-snapshot.zip`.

## Stroke writing and sound effects revision (v4)

`ALL IN MAC mini` now uses hand-authored pen centre-lines, following the SDK SVG path-drawing technique already used by `Stage.Draw`. Each of the 29 contacts has its own start/end frame, including separate A crossbars and i dots. The final dot completes at frame 238 of the five-second scene, leaving about one second of final hold. There is no text clipping mask or horizontal wipe. The earlier SDK handwriting example remains archived as v3 provenance.

`assets/handwriting/all-in-strokes.json` supplies both the visual and pen-foley timing. `sound/scene-cues.json` stores motion cues relative to each scene; `scripts/build-sfx.py` offsets them using `shots.ts`, edits the source recordings, synthesizes brief air/tick/body accents, pans and peak-normalizes a reproducible 48 kHz stereo master. A public SDK Audio node includes this WAV in the actual Fourier render. There are 144 discrete cues, including the 29 pen contacts; no BGM is loaded or generated.

The Mixkit Pen marker line WAV and authorized Fourier-ad effects are retained under `assets/audio/sources/`. The source ledger, crop regions, hashes and exact output sample timings are in `review/sfx-master.json`. Previous v3 video, manifest and acceptance are in `output/v3/`, and its source snapshot is `review/v3-source-snapshot.zip`.
