const patterns = [
  "openArtifact",
  "Example3D",
  "VideoPanel",
  "Universe 通过",
  "Universe Camera Cut",
  "Universe3D",
  "倒序 keyframe",
] as const;

for (const pattern of patterns) {
  const child = Bun.spawn(
    [
      "bun",
      "test",
      "--max-concurrency=1",
      "tests/testing-dom.test.ts",
      "--test-name-pattern",
      pattern,
    ],
    {
      cwd: new URL("..", import.meta.url).pathname,
      env: { ...process.env, RUN_DOM_TESTS: "1" },
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    },
  );
  const exitCode = await child.exited;
  if (exitCode !== 0) process.exit(exitCode);
}

process.exit(0);
