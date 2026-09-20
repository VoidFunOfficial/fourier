# Final acceptance — 2026-09-04

Delivered `output/Mac-mini-M6-1080p60.mp4` from the real Fourier Render Engine. The final film includes the tightened exits in CPU, Neural Engine, unified memory, bandwidth, wireless and iPhone Mirroring scenes.

- Video: H.264 / yuv420p, 1920 × 1080, 60/1 fps, exactly 4800 video frames and 80.000 seconds. File size: 18,615,350 bytes.
- SHA-256: `76b1086fdc68ed53a7a5d413174674e8064bbd7503b1009cc50f5b1b33151825`; matches the adjacent engine manifest.
- Audio: no authored audio. The engine's AAC track measures -91.0 dB maximum with 80.000 seconds of continuous silence at the -80 dB detector threshold.
- Decode: complete FFmpeg decode passed without errors.
- Structure: project validation and `scripts/check.ts` passed; 18 independent scenes, each 4–5 seconds, without timeline gaps or overlaps. TypeScript and `git diff --check` passed.
- Visual review: all 18 representative encoded frames reviewed in `storyboard-final.jpg`, all 17 handoffs sampled before and after the cut in `transitions-final.jpg`, and the encoded 170 GB/s endpoint checked at 37.35, 37.65 and 38.00 seconds. The final product lockup remains on screen through the ending.
- Flat-frame scan: the longest low-variance passage is 0.733 seconds around the dark chip-to-core cut at 16.467 seconds; other recorded passages are at most 0.2 seconds. This is a measured review result, not a claim that every frame has foreground detail.
- Determinism: all scenes underwent representative-frame, end-frame, earlier-frame and return-to-representative hash checks during development. The final embedded glTF also passed that check. The tightened 07, 09, 13 and 16 scenes were additionally rendered independently before final assembly. No claim of identical full-film hashes across different authored versions is made.
- Fonts: all 80 Chinese characters used in scene source are present in the bundled subsets. Latin typography and the Apple mark use the local San Francisco subset; Chinese uses the Fourier-ad Heiti SC subset.

The original Blender file, GLB and self-contained glTF JSON are retained. The JSON form keeps the model compatible with this renderer version's dependency scanner, which otherwise attempts to parse `.glb` as source. The last render uses a single DOM page and single-frame concurrency. Intermittent Chromium batch-capture failures were resolved by independently rendering affected scenes and then assembling their cache entries through the same engine.

Product claims and qualifications are recorded in `REFERENCE.md`. The supplied YouTube titles were identified, but playback and transcript access were unavailable; no frame-level reference-film reproduction is claimed. No reference-film footage appears in the delivered video.
