const result = await Bun.build({
  entrypoints: [
    "./src/index.ts",
    "./src/artifact.ts",
    "./src/timeline.ts",
    "./src/protocol.ts",
  ],
  root: "./src",
  outdir: "./dist",
  target: "bun",
  format: "esm",
  splitting: true,
  sourcemap: "external",
  external: [
    "playwright",
    "react",
    "react-dom",
    "react-dom/client",
  ],
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

export {};
