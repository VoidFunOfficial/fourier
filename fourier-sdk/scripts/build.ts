const result = await Bun.build({
  entrypoints: [
    "./src/index.ts",
    "./src/preview.ts",
    "./src/testing.ts",
    "./src/search.ts",
    "./src/react.ts",
    "./src/motion.ts",
    "./src/three.ts",
    "./src/universe.ts",
    "./src/phy2d.ts",
    "./src/schema.ts",
    "./src/project.ts",
    "./src/design-preview.ts",
    "./src/react-runtime.ts",
    "./src/jsx-runtime.ts",
    "./src/jsx-dev-runtime.ts",
    "./src/cli.ts",
  ],
  root: "./src",
  outdir: "./dist",
  target: "bun",
  format: "esm",
  splitting: false,
  sourcemap: "external",
  external: [
    "react",
    "react/jsx-runtime",
    "react/jsx-dev-runtime",
    "three",
    "three/addons/loaders/GLTFLoader.js",
    "@fourier-video/render-engine",
    "@fourier-video/render-engine/artifact",
  ],
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

export {};
