import { describe, expect, test } from "bun:test";
import { CoreError } from "@fourier-video/core";
import { VisualTimelineRuntime as CoreVisualTimelineRuntime } from "@fourier-video/core/timeline";
import { RenderEngineError, toErrorResponse } from "../src/errors.ts";
import { VisualTimelineRuntime } from "../src/visual-timeline-runtime.ts";

describe("Core compatibility facade", () => {
  test("RenderEngineError 是 CoreError 的同一构造器", () => {
    expect(RenderEngineError).toBe(CoreError);
    const error = new RenderEngineError("COMPATIBILITY_TEST", "compatibility", {
      source: "core",
    });
    expect(error).toBeInstanceOf(CoreError);
    expect(error.name).toBe("RenderEngineError");
    expect(toErrorResponse(error)).toEqual({
      error: {
        code: "COMPATIBILITY_TEST",
        message: "compatibility",
        details: { source: "core" },
      },
    });
  });

  test("旧 VisualTimelineRuntime 使用 Core runtime 实现", async () => {
    const runtime = new VisualTimelineRuntime({ maximumDomPages: 1 });
    expect(runtime).toBeInstanceOf(CoreVisualTimelineRuntime);
    await runtime.close();
  });
});
