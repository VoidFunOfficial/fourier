# Final acceptance — 2026-09-05 — faster rhythm and handwritten ending

Delivered `output/Mac-mini-M6-1080p60.mp4` through the local Fourier SDK and Fourier Render Engine. `output/Mac-mini-M6-1080p60-v3.mp4` is a byte-identical versioned delivery copy. Render proof: `review/render-v3-delivery.jsonl`.

- Video: 75.000 seconds, 4500 frames, 1920 × 1080, 60 fps, H.264 / yuv420p. File size: 22,343,388 bytes.
- SHA-256: `8677545d7e5586882b9b5a8c1e204ce8821d1f8d9bcda570b9b791692d2631fe`; verified against the engine manifest and versioned delivery copy.
- Complete FFmpeg decode: PASS. Silent AAC: -91.0 dB maximum, 75.008 seconds of detected continuous silence. No authored audio.
- Rhythm: the main product narrative is 62 seconds, down from 72, about 16% faster. Revised scene lengths compress motion and transitions; scaled 3D time preserves matching camera endpoints.
- Ending: 62–66 s cycles Productivity → Creativity → STEM → Gaming → Coding at 0.7-second intervals. 66–71 s writes ALL IN / MAC mini. 71–75 s displays this video / 完全由 Fourier Harness + GPT6 / 独立完成.
- Gallery lock: six PNG samples have exactly identical product-region pixels. All six encoded samples match at displacement [0, 0]; maximum mean pixel error is 0.247 from compression. Evidence: `ending-product-lock.json`, `ending-encoded-lock.json`.
- Handwriting: reused the SDK HandWritingTextMotion example and Beuty Rush font, with local font import, a named component export and a linear reveal envelope. Seven encoded samples verify progressive writing and the complete final hold. The ink pixels grow from 0 to 62,955; the last two complete samples agree. Evidence: `handwriting-source.json`, `handwriting-encoded.json`, `handwriting-final.jpg`.
- Source checks: full IR validation, `scripts/check.ts`, TypeScript and `git diff --check` passed. There are 20 independent visual scenes, each 2–5 seconds, without gaps or overlaps; the last three are composed by an SDK Template. This keeps the root within the existing compilation queue without changing SDK/Core/engine limits.
- Independent renders: all 20 files passed resolution, frame rate, duration, frame count and engine-manifest hash checks in `revision-scene-render-check.json`.
- Visual inspection: all 20 representative encoded frames, 19 cuts sampled on both sides, all five gallery categories, seven handwriting samples and the final attribution were reviewed. The 170 GB/s endpoint is stable at 31.35, 31.65 and 32.00 seconds.
- Font coverage: all 80 Chinese characters found in visual-scene source, all gallery/credit Latin text and every handwritten character are present in the bundled fonts. See `font-verification.json`.
- Model and website materials: the official 74-mesh / 50,084-source-vertex Mac mini model, original textures, 6 px short leaders and approved website imagery remain in use. Model conversion and asset provenance remain in `official-model-conversion.json` and `assets/official/sources.json`.
- Flat-frame scan: longest low-variance interval is 0.667 seconds at the dark chip cut around 12.533 seconds. The handwrite begins after a 0.467-second measured low-variance interval; remaining such intervals are at most 0.133 seconds. See `flat-frame-analysis.json`.

All new ending scenes passed unordered seek checks. A batched preview hit a Chromium context timeout at the credit scene; an isolated credit preview then passed. Every production scene and the complete final film rendered successfully. No claim of identical film hashes across different authored revisions is made.

Earlier deliveries remain in `output/v1/` and `output/v2/`; the previous editable source snapshot is `review/v2-source-snapshot.zip`. Reproduction and source documentation are in `README.md`, `STORYBOARD.md` and `REFERENCE.md`.

The versioned v3 delivery was uploaded through the Mac Quark client. The upload-completed list visibly contains `Mac-mini-M6-1080p60-v3.mp4` (21.3 MB), alongside the previous revision. UI verification is recorded in `quark-upload-v3.json`.
