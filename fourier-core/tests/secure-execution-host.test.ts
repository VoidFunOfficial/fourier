import { describe, expect, test } from "bun:test";
import { BoundedWorkerRunner } from "../src/bounded-worker-runner.ts";
import { SecureExecutionHost } from "../src/secure-execution-host.ts";

describe("secure execution", () => {
  test("BoundedWorkerRunner enforces timeout and queue saturation", async () => {
    const runner = new BoundedWorkerRunner({ concurrency: 1, maxQueued: 0, timeoutMs: 25 });
    const running = runner.run(() => new Promise(() => {}));
    await expect(runner.run(async () => true)).rejects.toMatchObject({ code: "SECURE_EXECUTION_LIMIT" });
    await expect(running).rejects.toMatchObject({ code: "SECURE_EXECUTION_TIMEOUT" });
  });

  test("Dedicated Worker cannot reach network or nested execution APIs", async () => {
    const value = await new SecureExecutionHost().execute({
      profile: "artifact-inspect",
      workerJavascript: `globalThis.onmessage = () => globalThis.postMessage(JSON.stringify({
        revision: 1,
        profile: "artifact-inspect",
        ok: true,
        value: {
          fetch: typeof globalThis.fetch,
          websocket: typeof globalThis.WebSocket,
          worker: typeof globalThis.Worker,
          wasm: typeof globalThis.WebAssembly,
        },
      }));`,
      input: {},
    });
    expect(value).toEqual({
      fetch: "undefined",
      websocket: "undefined",
      worker: "undefined",
      wasm: "undefined",
    });
  }, 10_000);

  test("computed host globals remain absent and malformed wire is rejected", async () => {
    const value = await new SecureExecutionHost().execute({
      profile: "artifact-inspect",
      workerJavascript: `globalThis.onmessage = () => globalThis.postMessage(JSON.stringify({
        revision: 1,
        profile: "artifact-inspect",
        ok: true,
        value: {
          process: typeof globalThis["pro" + "cess"],
          bun: typeof globalThis["B" + "un"],
          require: typeof globalThis["requ" + "ire"],
          home: globalThis["pro" + "cess"]?.env?.HOME,
        },
      }));`,
      input: {},
    });
    expect(value).toEqual({ process: "undefined", bun: "undefined", require: "undefined" });

    await expect(new SecureExecutionHost().execute({
      profile: "artifact-inspect",
      workerJavascript: `globalThis.onmessage = () => globalThis.postMessage("not-json");`,
      input: {},
    })).rejects.toMatchObject({ code: "SECURE_EXECUTION_PROTOCOL_INVALID" });
  }, 10_000);

  test("wire output hard limit is enforced", async () => {
    await expect(new SecureExecutionHost().execute({
      profile: "artifact-inspect",
      workerJavascript: `globalThis.onmessage = () => globalThis.postMessage(JSON.stringify({
        revision: 1,
        profile: "artifact-inspect",
        ok: true,
        value: "x".repeat(4 * 1024 * 1024),
      }));`,
      input: {},
    })).rejects.toMatchObject({ code: "SECURE_EXECUTION_LIMIT" });
  }, 10_000);

  test("main page can terminate a synchronously stuck Dedicated Worker", async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new Error("cancel evaluator")), 100);
    await expect(new SecureExecutionHost().execute({
      profile: "artifact-inspect",
      workerJavascript: "while (true) {}",
      input: {},
      signal: controller.signal,
    })).rejects.toMatchObject({ code: "ARTIFACT_EXECUTION_FAILED" });
  }, 10_000);
});
