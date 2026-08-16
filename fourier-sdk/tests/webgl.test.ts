import { describe, expect, test } from "bun:test";
import { SdkError } from "../src/errors.ts";
import {
  FOURIER_FULLSCREEN_VERTEX_SHADER,
  defineFourierShader,
  glsl,
} from "../src/webgl.ts";

describe("Fourier WebGL shader interface", () => {
  test("creates a frozen full-screen definition with typed uniforms", () => {
    const shader = defineFourierShader({
      name: "Gradient",
      fragmentShader: glsl`
        out vec4 fragColor;
        uniform float uGain;
        uniform vec3 uTint;
        void main() { fragColor = vec4(uTint * uGain, 1.0); }
      `,
      uniforms: {
        uGain: "float",
        uTint: "vec3",
      },
    });

    expect(shader.vertexShader).toBe(FOURIER_FULLSCREEN_VERTEX_SHADER);
    expect(shader.blend).toBe("replace");
    expect(shader.uniforms).toEqual({ uGain: "float", uTint: "vec3" });
    expect(Object.isFrozen(shader)).toBe(true);
    expect(Object.isFrozen(shader.uniforms)).toBe(true);
  });

  test("supports constant GLSL composition and rejects non-finite interpolation", () => {
    const octaves = 6;
    expect(glsl`const int OCTAVES = ${octaves};`).toBe(
      "const int OCTAVES = 6;",
    );
    expect(glsl("void main() {}")).toBe("void main() {}");
    expect(() => glsl`const float broken = ${Number.NaN};`).toThrow(SdkError);
  });

  test("reserves Fourier built-ins and validates shader definitions", () => {
    expect(() => defineFourierShader({ fragmentShader: "   " })).toThrow(
      "fragmentShader 必须是非空 GLSL",
    );
    expect(() => defineFourierShader({
      fragmentShader: "void main() {}",
      uniforms: { uFourierTime: "float" },
    })).toThrow("保留命名空间");
    expect(() => defineFourierShader({
      fragmentShader: "void main() {}",
      uniforms: { uMode: "sampler2D" as never },
    })).toThrow("类型无效");
    expect(() => defineFourierShader({
      fragmentShader: "void main() {}",
      clearColor: [0, 0, Number.POSITIVE_INFINITY, 1],
    })).toThrow("clearColor 必须是 4 个有限 number");
  });
});
