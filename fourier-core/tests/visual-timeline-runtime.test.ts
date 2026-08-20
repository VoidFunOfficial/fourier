import { describe, expect, test } from "bun:test";
import {
  defaultDomPageCount,
  effectiveDomPageCount,
} from "../src/visual-timeline-runtime.ts";

describe("DOM page concurrency", () => {
  test("Linux headless 固定为单 page，即使调用方请求更高并发", () => {
    expect(defaultDomPageCount("linux", 32)).toBe(1);
    expect(effectiveDomPageCount(8, "linux")).toBe(1);
  });
});
