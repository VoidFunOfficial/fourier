import {
  Audio,
  Canvas,
  defineProject,
  Project,
  Scene,
  Timeline,
} from "@fourier-video/sdk/project";

/** Root advertisement timeline. Each scene owns its private composition. */
export default defineProject(
  <Project
    id="fourier-ad-main"
    version="1.0"
    audioSampleRate={48_000}
  >
    <Canvas
      width={1920}
      height={1080}
      fps={30}
      background="#000000"
      colorSpace="sRGB"
    />

    <Timeline>
      <Scene id="scene-1" at="0f" src="scenes/scene1" audio={false} />
      <Scene id="scene-3" after="scene-1" src="scenes/scene3" />
      <Scene id="scene-4" after="scene-3" src="scenes/scene4" />
      <Scene id="scene-5" after="scene-4" src="scenes/scene5" />
      <Scene id="scene-6" after="scene-5" src="scenes/scene6" />
      <Scene id="scene-7" after="scene-6" src="scenes/scene7" />
      <Scene id="scene-8" after="scene-7" src="scenes/scene8" />
      <Scene id="scene-9" after="scene-8" src="scenes/scene9" />
      <Scene id="scene-10" after="scene-9" src="scenes/scene10" />

      {/* Continuous music bed. The source includes its own entrance and exit fades. */}
      <Audio
        id="background-music"
        at="151f"
        duration="1915f"
        src="sfx/bgm_master.wav"
        sourceIn="0f"
        volume={0.46}
      />

      {/* Scene 3: prompt reveal, focus, and send. */}
      <Audio id="prompt-panel-reveal" at="154f" duration="60f" src="sfx/intro_sfx.mp3" sourceIn="0f" volume={0.62} />
      <Audio id="prompt-input-click" at="210f" duration="10f" src="sfx/click_sfx.mp3" sourceIn="0f" volume={0.45} />
      <Audio id="prompt-send-snap" at="308f" duration="18f" src="sfx/snap_finger.mp3" sourceIn="0f" volume={0.32} />

      {/* Scene 4: four-agent split. */}
      <Audio id="agent-split-reveal" at="438f" duration="60f" src="sfx/magic_sfx.mp3" sourceIn="0f" volume={0.42} />

      {/* Scene 5: travel into Fourier World and SDK example cards. */}
      <Audio id="search-agent-travel" at="482f" duration="36f" src="sfx/wind_sfx.mp3" sourceIn="0f" volume={0.22} />
      <Audio id="world-open-click-one" at="530f" duration="10f" src="sfx/click_sfx.mp3" sourceIn="0f" volume={0.42} />
      <Audio id="world-open-click-two" at="541f" duration="10f" src="sfx/click_sfx.mp3" sourceIn="0f" volume={0.48} />
      <Audio id="sdk-card-entrance" at="611f" duration="13f" src="sfx/woosh.mp3" sourceIn="0f" volume={0.56} />

      {/* Scene 6: search, selection, effect handoff, and mail impact. */}
      <Audio id="search-input-click" at="759f" duration="10f" src="sfx/click_sfx.mp3" sourceIn="0f" volume={0.42} />
      <Audio id="search-submit-click" at="815f" duration="10f" src="sfx/click_sfx.mp3" sourceIn="0f" volume={0.5} />
      <Audio id="effect-selected-one" at="857f" duration="18f" src="sfx/kacha.mp3" sourceIn="0f" volume={0.22} />
      <Audio id="effect-selected-two" at="869f" duration="18f" src="sfx/snap_finger.mp3" sourceIn="0f" volume={0.3} />
      <Audio id="effect-selected-three" at="881f" duration="11f" src="sfx/correct_sfx.mp3" sourceIn="0f" volume={0.46} />
      <Audio id="effect-fling" at="883f" duration="13f" src="sfx/woosh.mp3" sourceIn="0f" volume={0.58} />
      <Audio id="mail-form-reveal" at="917f" duration="30f" src="sfx/magic_sfx.mp3" sourceIn="0f" volume={0.3} />
      <Audio id="mail-impact" at="939f" duration="12f" src="sfx/alarm_sfx.mp3" sourceIn="0f" volume={0.65} />

      {/* Scene 7: Script Agent travel, document creation, and launch. */}
      <Audio id="script-agent-travel" at="951f" duration="36f" src="sfx/wind_sfx.mp3" sourceIn="0f" volume={0.2} />
      <Audio id="document-open-reveal" at="1009f" duration="60f" src="sfx/intro_sfx.mp3" sourceIn="0f" volume={0.42} />
      <Audio id="document-collapse" at="1251f" duration="30f" src="sfx/shua_sfx.mp3" sourceIn="0f" volume={0.22} />
      <Audio id="document-launch" at="1317f" duration="13f" src="sfx/woosh.mp3" sourceIn="0f" volume={0.62} />

      {/* Scene 8: handoff catches, poster merge, and poster kick. */}
      <Audio id="mail-catch" at="1377f" duration="18f" src="sfx/kacha.mp3" sourceIn="0f" volume={0.2} />
      <Audio id="document-catch" at="1395f" duration="18f" src="sfx/snap_finger.mp3" sourceIn="0f" volume={0.3} />
      <Audio id="poster-merge-reveal" at="1414f" duration="60f" src="sfx/magic_sfx.mp3" sourceIn="0f" volume={0.42} />
      <Audio id="poster-kick" at="1488f" duration="13f" src="sfx/woosh.mp3" sourceIn="0f" volume={0.68} />

      {/* Scene 9: revised poster lock and accelerating montage. */}
      <Audio id="review-complete" at="1685f" duration="11f" src="sfx/correct_sfx.mp3" sourceIn="0f" volume={0.42} />
      <Audio id="montage-swipe-one" at="1730f" duration="12f" src="sfx/woosh.mp3" sourceIn="0f" volume={0.42} rate={0.94} />
      <Audio id="montage-swipe-two" at="1742f" duration="10f" src="sfx/woosh.mp3" sourceIn="0f" volume={0.44} rate={1} />
      <Audio id="montage-swipe-three" at="1752f" duration="9f" src="sfx/woosh.mp3" sourceIn="0f" volume={0.46} rate={1.07} />
      <Audio id="montage-swipe-four" at="1761f" duration="8f" src="sfx/woosh.mp3" sourceIn="0f" volume={0.48} rate={1.15} />
      <Audio id="montage-swipe-five" at="1769f" duration="7f" src="sfx/woosh.mp3" sourceIn="0f" volume={0.5} rate={1.24} />
      <Audio id="montage-swipe-six" at="1776f" duration="5f" src="sfx/woosh.mp3" sourceIn="0f" volume={0.52} rate={1.34} />
      <Audio id="montage-swipe-seven" at="1781f" duration="5f" src="sfx/woosh.mp3" sourceIn="0f" volume={0.54} rate={1.45} />
      <Audio id="montage-swipe-eight" at="1786f" duration="4f" src="sfx/woosh.mp3" sourceIn="0f" volume={0.56} rate={1.58} />
      <Audio id="montage-swipe-nine" at="1790f" duration="8f" src="sfx/woosh.mp3" sourceIn="0f" volume={0.58} rate={1.72} />
      <Audio id="final-poster-lock" at="1794f" duration="18f" src="sfx/snap_finger.mp3" sourceIn="0f" volume={0.36} />

      {/* Scene 10: final color wipe and title reveal. */}
      <Audio id="final-color-wipe" at="1826f" duration="30f" src="sfx/shua_sfx.mp3" sourceIn="0f" volume={0.34} />
      <Audio id="final-title-reveal" at="1870f" duration="75f" src="sfx/intro_sfx.mp3" sourceIn="0f" volume={0.56} />
    </Timeline>
  </Project>,
);
