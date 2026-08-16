# Fourier Ad

English | [简体中文](./README.zh-CN.md)

**A complete advertisement that demonstrates how Fourier works.**

Fourier Ad is a TSX video project that can be passed directly to the Render Engine. It divides a long-form video into independent Scenes and coordinates visuals, background music, and sound effects on a root timeline. Its purpose is to exercise Fourier on a real composition rather than on isolated component demos.

## Why this ad uses Fourier

- **Long-form structure stays readable:** the root `main.tsx` owns Scene order and global audio, while each Scene owns its visual implementation.
- **Changes stay local:** copy, scenes, assets, and sound effects have explicit locations that an agent can identify and edit.
- **Timing is visible:** `at`, `after`, and frame-based durations express edit relationships without hidden editor state.
- **Components remain reusable:** Scenes can use SDK artifacts, Motion, and local visual assets instead of regenerating every effect for every video.
- **Delivery is verifiable:** the same project can be validated, inspected, and previewed before final rendering.

## Project layout

```text
fourier-ad/
├── main.tsx       # Root Project, Scene composition, and global audio timeline
├── scenes/        # Independent Scenes; each active Scene uses main.tsx
├── components/    # Reusable visual components local to the project
├── motions/       # Project-local Motion artifacts
├── pic/           # Image assets
├── fonts/         # Local fonts
├── sfx/           # Background music and sound effects
└── tsconfig.json  # TSX and type-checking configuration
```

The root project is `1920 × 1080` at `30 fps` with `48 kHz` audio. Scenes are chained with `after`, while music and action-specific sound effects are aligned on the global timeline.

## Validate and render

Install workspace dependencies and Chromium from the monorepo root:

```bash
bun install
bunx playwright install chromium
```

Then run:

```bash
# Validate declarations, assets, and timeline semantics
bun run fourier-render-engine/src/cli.ts validate fourier-ad/main.tsx

# Inspect the resolved project structure
bun run fourier-render-engine/src/cli.ts inspect fourier-ad/main.tsx

# Produce the video
bun run fourier-render-engine/src/cli.ts render fourier-ad/main.tsx \
  --output /tmp/fourier-ad.mp4 \
  --overwrite
```

A static design preview requires an explicit sample point and annotation range:

```bash
bun run fourier-render-engine/src/cli.ts preview fourier-ad/main.tsx \
  --output /tmp/fourier-ad-preview.png \
  --anchor 10s \
  --range-start 9s \
  --range-end 11s \
  --overwrite
```

## Continue authoring

1. Create or edit a Scene in `scenes/<name>/main.tsx`.
2. Keep images, fonts, video, and audio inside the project and reference them with relative paths.
3. Compose Scenes in the root `main.tsx` using `at`, `after`, or `with`.
4. Run `validate` and `inspect` before rendering to confirm timeline and asset behavior.
5. Render the final video; add `--ai` when an agent needs machine-readable progress and errors.

For project declarations and component authoring, see the [Render Engine](../fourier-render-engine/README.md) and [Fourier SDK](../fourier-sdk/README.md).

