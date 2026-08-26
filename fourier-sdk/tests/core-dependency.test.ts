import { describe, expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import {
  SDK_ABI_VERSION as CORE_SDK_ABI_VERSION,
  SDK_ARTIFACT as CORE_SDK_ARTIFACT,
  SDK_ARTIFACT_SYMBOL_KEY as CORE_SDK_ARTIFACT_SYMBOL_KEY,
} from "@fourier-video/core/protocol";
import {
  SDK_ABI_VERSION,
  SDK_ARTIFACT,
  SDK_ARTIFACT_SYMBOL_KEY,
} from "../src/index.ts";

describe("SDK Core dependency", () => {
  test("旧 SDK 协议常量 re-export Core identity", () => {
    expect(SDK_ABI_VERSION).toBe(CORE_SDK_ABI_VERSION);
    expect(SDK_ARTIFACT).toBe(CORE_SDK_ARTIFACT);
    expect(SDK_ARTIFACT_SYMBOL_KEY).toBe(CORE_SDK_ARTIFACT_SYMBOL_KEY);
  });

});
