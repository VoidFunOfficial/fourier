import { checkBrowserRuntime } from "../src/browser-check.ts";
import { RenderEngineError } from "../src/errors.ts";

try {
  console.log(JSON.stringify(await checkBrowserRuntime()));
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    code: error instanceof RenderEngineError ? error.code : "DOM_RUNTIME_UNAVAILABLE",
    message: error instanceof Error ? error.message : String(error),
    ...(error instanceof RenderEngineError && error.details !== undefined
      ? { details: error.details }
      : {}),
  }));
  process.exitCode = 1;
}
