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

const shader = Bun.spawn(
  ["bun", "test", "--max-concurrency=1", "example/ChannelShader.test.ts"],
  {
    cwd: new URL("..", import.meta.url).pathname,
    env: { ...process.env, RUN_DOM_TESTS: "1" },
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  },
);
if (await shader.exited !== 0) process.exit(1);

// Match the per-case process isolation used above for browser/render fixtures.
// Reusing one process across Avatar cases can stall the Chromium evaluator.
const avatarPatterns = ["voidavatar 默认", "source 模式", "mesh 和透明 mask", "最新 MOC3", "model3"] as const;
for (const pattern of avatarPatterns) {
  const avatar = Bun.spawn(
    ["bun", "test", "--max-concurrency=1", "tests/avatar-dom.test.ts", "--test-name-pattern", pattern],
    {
      cwd: new URL("..", import.meta.url).pathname,
      env: { ...process.env, RUN_DOM_TESTS: "1" },
      stdin: "inherit", stdout: "inherit", stderr: "inherit",
    },
  );
  const exitCode = await avatar.exited;
  if (exitCode !== 0) process.exit(exitCode);
}

process.exit(0);
