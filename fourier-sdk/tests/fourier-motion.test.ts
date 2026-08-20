import { describe, expect, test } from "bun:test";
import {
  SDK_ARTIFACT,
  FourierMotion,
  motion,
  useFourierRenderDriver,
} from "../src/index.ts";
import { CinematicDriftMotion } from "../example/CinematicDriftMotion.tsx";
import { ElegantEntranceMotion } from "../example/ElegantEntranceMotion.tsx";
import { StaggerTextMotion } from "../example/StaggerTextMotion.tsx";

describe("Fourier declarative Motion interface", () => {
  test("exports the render-driver readiness bridge for asset-derived Motion", () => {
    expect(typeof useFourierRenderDriver).toBe("function");
  });

  test("motion intrinsic elements are cached and available from the SDK", () => {
    expect(motion.div).toBe(motion.div);
    expect(motion.create("div")).toBe(motion.div);
    expect(motion.create("span")).toBe(motion.span);
    expect(motion.div.displayName).toBe("motion.div");
    expect(typeof FourierMotion).toBe("function");
  });

  test("common animation examples are ABI v1 Motion artifacts", () => {
    for (const artifact of [
      ElegantEntranceMotion,
      CinematicDriftMotion,
      StaggerTextMotion,
    ]) {
      expect(artifact[SDK_ARTIFACT]).toMatchObject({
        kind: "motion",
        renderer: "dom-timeline",
        sdkAbiVersion: 1.1,
      });
      expect(artifact[SDK_ARTIFACT].designPreview().composition.durationSeconds)
        .toBeGreaterThan(0);
    }
  });

  test("the stagger example exposes a dedicated text implementation", () => {
    const metadata = StaggerTextMotion[SDK_ARTIFACT];
    expect(metadata).toMatchObject({ supportsTextMotion: true });
    if (metadata.kind !== "motion" || !metadata.supportsTextMotion) {
      throw new Error("expected Text Motion support");
    }
    expect(typeof metadata.textComponent).toBe("function");
    expect(metadata.designPreview().subject).toBe("Move beautifully.");
  });
});
