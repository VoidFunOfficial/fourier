import { describe, expect, test } from "bun:test";
import { SDK_ARTIFACT } from "@fourier-video/sdk";
import { openArtifact } from "@fourier-video/sdk/testing";
import AuroraFlux, {
  AURORA_FLUX_DURATION_SECONDS,
  AURORA_FLUX_FLOW_SPEED,
  AURORA_FLUX_FRAGMENT_SHADER,
  AURORA_FLUX_PALETTE,
  AURORA_FLUX_REFERENCE_SEED,
  auroraFluxShader,
} from "./AuroraFlux.tsx";

describe("AuroraFlux", () => {
  test("逐项固定参考网页 AURORA 背景参数", () => {
    expect(AuroraFlux[SDK_ARTIFACT]).toMatchObject({
      kind: "react",
      name: "AuroraFluxBackground",
      schema: {
        flowSpeed: { defaultValue: AURORA_FLUX_FLOW_SPEED },
        seed: { defaultValue: AURORA_FLUX_REFERENCE_SEED },
        glassBlur: { defaultValue: 28 },
        glassOpacity: { defaultValue: 0.1 },
      },
    });
    expect(AuroraFlux[SDK_ARTIFACT]).not.toHaveProperty("static");
    expect(AURORA_FLUX_PALETTE).toEqual([
      [0.08, 0.88, 0.58],
      [0.18, 0.48, 1],
      [0.55, 0.25, 0.95],
    ]);
    expect(AuroraFlux[SDK_ARTIFACT].designPreview()).toMatchObject({
      props: {},
      composition: {
        width: 1920,
        height: 1080,
        durationSeconds: AURORA_FLUX_DURATION_SECONDS,
      },
    });
  });

  test("保持参考 shader 的五层 FBM 与域扭曲常量", () => {
    expect(auroraFluxShader.uniforms).toEqual({
      uFlowSpeed: "float",
      uReferenceSeed: "float",
      uHover: "float",
      uC1: "vec3",
      uC2: "vec3",
      uC3: "vec3",
    });
    expect(AURORA_FLUX_FRAGMENT_SHADER).toContain("for (int i = 0; i < 5; i++)");
    expect(AURORA_FLUX_FRAGMENT_SHADER).toContain("p + 2.2 * q");
    expect(AURORA_FLUX_FRAGMENT_SHADER).toContain("fbm(p + 2.4 * r)");
    expect(AURORA_FLUX_FRAGMENT_SHADER).toContain("smoothstep(0.30, 0.80");
    expect(AURORA_FLUX_FRAGMENT_SHADER).toContain("vec3 base = vec3(0.985)");
  });
});

const describeDom = Bun.env.RUN_DOM_TESTS === "1" ? describe : describe.skip;

describeDom("AuroraFlux DOM render", () => {
  test("全屏背景由 Fourier 绝对时间乱序确定性采样", async () => {
    const fixture = await openArtifact(new URL("./AuroraFlux.tsx", import.meta.url).pathname);
    try {
      expect(fixture.isStatic).toBe(false);
      const start = await fixture.renderFrame({ frame: 0 });
      const middle = await fixture.renderFrame({ frame: 240 });
      const end = await fixture.renderFrame({ frame: 479 });
      expect(middle.sha256).not.toBe(start.sha256);
      expect(end.sha256).not.toBe(middle.sha256);
      await fixture.assertDeterministic({ frames: [479, 0, 240, 120, 360] });
    } finally {
      await fixture.close();
    }
  }, 50_000);
});
