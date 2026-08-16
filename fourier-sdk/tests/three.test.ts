import { describe, expect, test } from "bun:test";
import { TextureLoader as ThreeTextureLoader } from "three";
import {
  FourierTextureLoader,
  TextureLoader,
  resolveFourierTextureSource,
} from "../src/three.ts";

describe("Fourier TextureLoader", () => {
  test("replaces the Three export with a compatible Fourier loader", () => {
    expect(TextureLoader).toBe(FourierTextureLoader);
    expect(new TextureLoader()).toBeInstanceOf(ThreeTextureLoader);
  });

  test("accepts bundled strings, URL objects, and image-like sources", () => {
    expect(resolveFourierTextureSource("poster.png")).toBe("poster.png");
    expect(resolveFourierTextureSource(new URL("https://example.test/poster.png")))
      .toBe("https://example.test/poster.png");
    expect(resolveFourierTextureSource({ src: "data:image/png;base64,AA==" }))
      .toBe("data:image/png;base64,AA==");
    expect(() => resolveFourierTextureSource("   ")).toThrow("图片地址不能为空");
  });
});
