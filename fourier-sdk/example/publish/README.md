# Fourier World publish packages

Each child directory is a standalone Fourier World package with its own `package.json`, source entry, and local dependencies. From the SDK repository, validate or publish one component with:

```bash
bun run src/cli.ts publish ./example/publish/ColorRotation --dry-run
bun run src/cli.ts publish ./example/publish/ColorRotation
```

With the packaged CLI installed, use `fourier-sdk publish` instead:

```bash
fourier-sdk login --email author@example.com
fourier-sdk publish ./example/publish/ColorRotation
```

To publish every package in this directory after reviewing its metadata:

```bash
for manifest in ./example/publish/*/package.json; do
  fourier-sdk publish "$(dirname "$manifest")"
done
```

`FourierGallery3D` and `CinematicPageFlip3D` are intentionally not included.
