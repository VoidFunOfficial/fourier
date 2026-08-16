import { describe, expect, test } from "bun:test";
import { SdkError, loadFont } from "../src/index.ts";

describe("loadFont", () => {
  test("为相同字体生成稳定 family，并区分 source 和 descriptors", () => {
    const first = loadFont("data:font/ttf;base64,AA==");
    expect(first).toMatch(/^FourierFont-[a-z0-9]+$/);
    expect(loadFont("data:font/ttf;base64,AA==")).toBe(first);
    expect(loadFont("data:font/otf;base64,AA==")).not.toBe(first);
    expect(loadFont("data:font/ttf;base64,AA==", { weight: 700 })).not.toBe(first);
    expect(loadFont("data:font/ttf;base64,AA==", { style: "italic" })).not.toBe(first);
  });

  test("拒绝空 source 和无效 descriptors", () => {
    for (const call of [
      () => loadFont(""),
      () => loadFont("https://example.com/font.ttf"),
      () => loadFont("//example.com/font.otf"),
      () => loadFont("font.ttf", { weight: 0 }),
      () => loadFont("font.ttf", { weight: 400.5 }),
      () => loadFont("font.ttf", { style: "slanted" as never }),
    ]) {
      expect(call).toThrow(SdkError);
    }
    try {
      loadFont("https://example.com/font.ttf");
    } catch (error) {
      expect((error as SdkError).code).toBe("INVALID_FONT_SOURCE");
    }
    try {
      loadFont("font.ttf", { weight: 0 });
    } catch (error) {
      expect((error as SdkError).code).toBe("INVALID_FONT_OPTIONS");
    }
  });
});
