import { describe, expect, test } from "bun:test";
import {
  SCENE_SIX_TIMING,
  cameraTrackFrames,
  characterFrames,
  sceneSixResultTiming,
} from "./SceneSixBrowserOverlay.tsx";

describe("SceneSixBrowserOverlay timeline", () => {
  test("keeps camera tracking on the same clock as click and typing events", () => {
    const offsets = cameraTrackFrames().map((frame) => frame.offset);
    expect(offsets).toContain(SCENE_SIX_TIMING.inputClick);
    expect(offsets).toContain(SCENE_SIX_TIMING.typingStart);
    expect(offsets).toContain(SCENE_SIX_TIMING.typingEnd);
    expect(offsets).toContain(SCENE_SIX_TIMING.searchClick);
    expect(offsets).toContain(SCENE_SIX_TIMING.resultsReveal);

    const firstCharacter = characterFrames(0);
    const lastCharacter = characterFrames("适用于 AI 项目的动效".length - 1);
    expect(firstCharacter[1]?.offset).toBe(SCENE_SIX_TIMING.typingStart);
    expect(lastCharacter[2]?.offset).toBeLessThanOrEqual(SCENE_SIX_TIMING.typingEnd);
  });

  test("shows each result before its matching selection and check event", () => {
    for (let index = 0; index < 3; index += 1) {
      const timing = sceneSixResultTiming(index);
      expect(timing.reveal).toBe(
        SCENE_SIX_TIMING.resultsReveal + index * SCENE_SIX_TIMING.resultRevealStagger,
      );
      expect(timing.selectedAt).toBe(
        SCENE_SIX_TIMING.selectionStart + index * SCENE_SIX_TIMING.selectionStagger,
      );
      expect(timing.flingAt).toBe(
        SCENE_SIX_TIMING.flingStart + index * SCENE_SIX_TIMING.flingStagger,
      );
      expect(timing.reveal).toBeLessThan(timing.selectedAt);
      expect(timing.selectedAt).toBeLessThan(timing.flingAt);
    }
  });
});
