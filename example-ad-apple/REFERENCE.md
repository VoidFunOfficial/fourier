# Source ledger — checked 2026-09-04

Primary product page: https://www.apple.com/mac-mini/
Technical specifications: https://www.apple.com/mac-mini/specs/

M6-specific claims used: 5 × 5-inch footprint; 12-core CPU (2 super / 4 performance / 6 efficiency); 12-core GPU; hardware ray tracing; dual 16-core Neural Engine; up to 32GB unified memory; up to 170GB/s memory bandwidth when configured with 24GB/32GB (16GB configuration: 153GB/s); hardware ProRes encode/decode; two front USB-C ports (USB 3, up to 10Gb/s), 3.5 mm jack; three rear Thunderbolt 4 ports, HDMI, 2.5Gb Ethernet; Wi-Fi 7 and Bluetooth 6; airflow through the foot; up to three external displays; iPhone Mirroring; creative and local AI workflows.

Do not mix in M5 Pro's Thunderbolt 5, 307GB/s, 64GB memory, or three 6K display claim. Multi-display wording intentionally omits a blanket resolution. No performance multipliers or release-date promises are used. Wireless availability depends on region. iPhone Mirroring availability depends on region and compatible software/devices; that qualification appears on screen.

Initial visual calibration:
- https://www.apple.com/v/mac-mini/ab/images/overview/welcome/welcome_hero__ckmy0qsqi8ia_large.jpg
- https://www.apple.com/v/mac-mini/ab/images/overview/design/ports_startframe__f0wr03ggmsii_large.png
- https://www.apple.com/v/mac-mini/ab/images/overview/design/design_pb__cxvqbmm5dfcm_large.jpg
- https://www.apple.com/v/mac-mini/ab/images/overview/performance/performance_chip_mx__gis8y0lp52eu_large.jpg

Requested film references:
- https://www.youtube.com/watch?v=-ueUb6PNwbs — “Design is how it works | Apple”; title verified by web source. Playback and transcript retrieval unavailable in this session.
- https://www.youtube.com/watch?v=66XwG1CLHuU — “Every product carbon neutral by 2030 | Apple”; title verified by web source. Playback/transcript unavailable. No carbon-neutral claim derived from this reference.

Current product asset: the official Apple Mac mini AR USDZ, imported and converted using Blender. Original reconstruction files remain as v1 source history, but the film now loads `assets/model/official.ts`. Geometry and textures are retained; studio lighting and rasterization depth bias are rendering choices. Internal chip/node visuals remain explanatory graphics, not die photography or literal transistor layouts.

Reuse audit: `fourier-ad` scene composition; `fourier-styles/benmarriott/analog-frame-jitter` exported jitter frames, `fourier-styles/benmarriott/morphing-corner-tile` exported corner morph frames, and `jakeinmotion/advanced-3d-headphone-array` absolute camera/light/disposal pattern. The two reusable source files are retained in components/reused so standalone Scene rendering stays within the project source boundary. Only named motion functions are imported; their full title layouts are not used. Product-specific model/camera/functional diagrams require original components. No compatible local Fourier World product model was present; nothing is published or installed remotely.

Fonts: local Apple SFNS.ttf for San Francisco and the Apple logo glyph; `fourier-ad/fonts/STHeiti.ttc` for Chinese. Apple font is copied for local reproducible rendering on this Mac, remains subject to Apple's terms and is not a font redistribution license. Marks remain their owners' property. This is an independently produced product film, not a claim of official Apple authorship.

## Official material integration — requested revision

- Official AR model: https://www.apple.com/105/media/us/mac-mini/2026/2140fd43-1461-420d-942c-6f254535a9a4/ar/mac-mini-silver.usdz
- Exact image URLs, bytes and original SHA-256s: `assets/official/sources.json`.
- Scene 10: `performance_screen_left`, `performance_screen_middle`, `performance_screen_right` from the official creative three-display composition.
- Scene 14: `performance_thermal`, the official underside/airflow visualization.
- Scene 15: `performance_hw_display` and the three official creative screen images.
- Scene 16: `mac_iphone_mirroring`, the official iPhone Mirroring illustration.
- Scene 17: `ai_agentic`, the official local-AI application-workflow image.
- Scene 18: both `performance_{productivity,creativity,stem,gaming,coding}_{1,2}` images for each official gallery category. Application content and pictured people/artwork are retained as published; no new application responses are fabricated.

The user explicitly requested incorporating the website material into this film. Original downloads remain intact; layout, framing and animated transitions are authored in Fourier. The fixed product layer in the ending reuses the exact Productivity photo registration, so switching workflows cannot move or morph the enclosure. This independently edited film does not imply official Apple authorship.

## User-requested final attribution and handwriting

The final attribution is user-specified copy: `this video` / `完全由 Fourier Harness + GPT6` / `独立完成`. It is a production credit, not an Apple product claim.

`components/reused/HandWritingTextMotion.tsx` is copied from the local SDK example with its `Beuty Rush.otf` font. Adaptations: project-local font path, named export of the existing `HandWritingText` component, and a linear reveal envelope that preserves literal writing-window offsets and removes the long blank lead-in. Its progressive reveal, deterministic glyph motion and SVG ink filter remain the example implementation. The source hash is recorded in `review/handwriting-source.json`. The complete final handwritten phrase is `ALL IN MAC mini`, arranged on two lines.

## v4 sound and stroke sources

- Actual pen recording: Mixkit, “Pen marker line”, sound 2998. Discovered on https://mixkit.co/free-sound-effects/office/ and downloaded from the page's public WAV link https://assets.mixkit.co/active_storage/sfx/2998/2998.wav on 2026-09-05. Mixkit Sound Effects Free License: https://mixkit.co/license/#sfxFree . The original WAV is retained, cropped to its active contact, filtered and retimed individually for each pen stroke.
- Reused with the user's explicit authorization: `fourier-ad/sfx/woosh.mp3`, `shua_sfx.mp3`, `wind_sfx.mp3`, `click_sfx.mp3`, `snap_finger.mp3`, `kacha.mp3`. No BGM, alarm, melodic magic or intro music asset is used.
- Original synthesized effects: short filtered-noise air passes and ticks, and rapidly decaying mechanical body impulses. These are discrete movement accents, not music.
- Hand lettering: custom SVG pen centre-lines for the exact phrase `ALL IN MAC mini`, with 29 independent pen contacts. Public FourierMotion animates normalized path dash offsets, reusing the existing Stage.Draw technique. A bars and i dots have separate drawing intervals. The SDK HandWritingTextMotion example remains the v3 style reference, but v4 no longer uses its rectangle reveal.

`review/sfx-master.json` records original hashes and the exact scene/frame-derived sound placements; the one shared stroke asset synchronizes the visual and acoustic pen lifts.
