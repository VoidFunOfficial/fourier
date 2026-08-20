# @fourier-video/core

`@fourier-video/core` is the shared integration module used by the Fourier SDK and Render Engine. It owns artifact protocol validation, artifact compilation, deterministic DOM timeline sampling, exact rational time, browser runtime control, and standalone artifact MP4 rendering.

The primary seam is `createArtifactHost({ resolveAuthorImport })`. Integrators provide an adapter that resolves author runtime imports from their own installation location:

```ts
import { createArtifactHost } from "@fourier-video/core";

const host = createArtifactHost({
  resolveAuthorImport: (specifier) => Bun.resolveSync(specifier, import.meta.dir),
});
```

Core deliberately has no package or static source dependency on `@fourier-video/sdk`. The SDK and Render Engine each own their adapter. Artifact authors should continue importing author-facing definitions, React, Motion, Three.js, Universe, and project declarations from `@fourier-video/sdk`; Core is a foundation package for SDK/render integration rather than the recommended authoring entry point.

## Public subpaths

- `@fourier-video/core`: host creation, the canonical `CoreError`, ABI constants, and integration types.
- `@fourier-video/core/artifact`: host and artifact compile/render types.
- `@fourier-video/core/timeline`: exact time utilities, `SampleClock`, DOM timeline runtime, and sampling types.
- `@fourier-video/core/protocol`: artifact symbol, ABI/schema constants, compatibility checks, and metadata wire types.

## Verification

```bash
bun run typecheck
bun test
bun run test:dom
bun run prepack
```
