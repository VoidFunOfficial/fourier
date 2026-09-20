# Final acceptance — 2026-09-05 — website material revision

Delivered `output/Mac-mini-M6-1080p60.mp4` through the local Fourier SDK and real Fourier Render Engine. The final assembly log is `review/render-v2-delivery.jsonl`.

- Video: H.264 / yuv420p, 1920 × 1080, 60 fps, exactly 4800 video frames and 80.000 seconds. File size: 24,401,599 bytes.
- SHA-256: `7cad7a218a71c28696f9e14008f8edb26db66556c1dc32adfcd60015f193ea65`; matches the adjacent engine manifest.
- Audio: no authored audio. The engine's AAC track measures -91.0 dB maximum, with 80.000 seconds of continuous silence at the -80 dB detector threshold.
- Decode: complete FFmpeg decode passed without errors. Probe and audio evidence are in `media-verification.json` and `audio-verification.log`.
- Structure: 18 independent scenes, each 2–8 seconds, without timeline gaps or overlaps. Full-project IR validation, `scripts/check.ts`, TypeScript and `git diff --check` passed. All 18 independently rendered scene files also passed duration, frame-count, resolution, frame-rate and manifest-hash verification in `revision-scene-render-check.json`.
- Official model: Apple's public Mac mini AR USDZ was imported in Blender and converted without remeshing or decimation. All 74 meshes, 50,084 source vertices, original normals, UVs and five texture images are retained. Export triangulates faces. Seven lossless runtime chunks reconstruct the exact glTF binary; source, GLB and binary hashes are in `official-model-conversion.json`.
- Callouts: front and rear leaders now use 6 px round-ended strokes, about 64–77 px long. Footprint dimensions use short, bold endpoint marks. The rear camera follows an exterior orbit. Final encoded checks confirm the footprint markers and thermal airflow overlays paint above their image/canvas layers.
- Website imagery: official creative screenshots, Studio Display hardware, thermal imagery, iPhone Mirroring, local AI and all ten workflow-gallery images appear in scenes 10, 14, 15, 16, 17 and 18. Original downloads and their URLs/hashes are retained in `assets/official/sources.json`.
- Ending: the final eight seconds switch Productivity → Creativity → STEM → Gaming → Coding, then hold Coding. A single unanimated product layer fixes the enclosure. Six uncompressed samples have identical product pixels (`ending-product-lock.json`). All six encoded samples have best matching displacement [0, 0], with mean pixel error at most 0.275 from compression (`ending-encoded-lock.json`).
- Visual review: all 18 representative encoded frames and all 17 handoffs were reviewed. The final changed footprint and thermal frames were checked again after the last assembly. The encoded 170 GB/s endpoint is stable at 37.35, 37.65 and 38.00 seconds; all five ending categories and the final hold were inspected. Review sheets: `storyboard-final.jpg`, `transitions-final.jpg`, `metric-hold-final.jpg`, `ending-final.jpg`.
- Flat-frame scan: the longest low-variance passage is 0.733 seconds around the dark chip-to-core cut at 16.467 seconds; other recorded passages are at most 0.2 seconds. This is a measured review result, not a claim that every frame has foreground detail.
- Fonts: all 87 Chinese characters used in scene source are present in the bundled Heiti subset; all five ending labels are covered by the San Francisco subset. See `font-verification.json`.

The editable Fourier project, official Blender file, GLB, original USDZ, official image sources, conversion scripts and renderer manifest are retained. The original first cut and its acceptance record remain in `output/v1/`.

The final render uses one DOM page and single-frame concurrency. Independent scene rendering warmed the normal Fourier render cache; the standard full-film engine command then assembled and encoded the delivery. The full root composition was restored. No claim of identical full-film hashes across different authored versions is made.

Product facts and qualifications are documented in `REFERENCE.md`. Reproduction commands are in `README.md`.
