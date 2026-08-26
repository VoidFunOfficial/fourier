import { describe, expect, test } from "bun:test";
import { SDK_ARTIFACT } from "@fourier-video/sdk";
import { openArtifact } from "@fourier-video/sdk/testing";
import ChannelShader, { channelShader } from "./ChannelShader.tsx";

describe("ChannelShader", () => {
  test("声明可复用输入纹理和 typed uniform", () => {
    expect(ChannelShader[SDK_ARTIFACT]).toMatchObject({
      kind: "shader",
      name: "ChannelShader",
      schema: { amount: { defaultValue: 1 } },
    });
    expect(channelShader.uniforms).toEqual({ amount: "float" });
    expect(channelShader.fragmentShader).toContain("texture(uFourierSource, vUv)");
  });
});

const describeDom = Bun.env.RUN_DOM_TESTS === "1" ? describe : describe.skip;

describeDom("ChannelShader DOM render", () => {
  test("独立预览读取输入纹理并保持乱序确定性", async () => {
    const fixture = await openArtifact(new URL("./ChannelShader.tsx", import.meta.url).pathname);
    try {
      expect(fixture.kind).toBe("shader");
      const frame = await fixture.renderFrame({ frame: 15 });
      expect(frame.png.byteLength).toBeGreaterThan(0);
      await fixture.assertDeterministic({ frames: [15, 0, 45, 15] });
    } finally {
      await fixture.close();
    }
  }, 30_000);
});
