const files = [
  "tests/dom-timeline.integration.test.ts",
  "tests/visual-timeline-runtime.dom.test.ts",
  "tests/visual-consumers.dom.test.tsx",
] as const;

for (const file of files) {
  const child = Bun.spawn(
    ["bun", "test", "--max-concurrency=1", file],
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

// Isolate Playwright's headed macOS driver lifetime from the invoking prepack process.
process.exit(0);
