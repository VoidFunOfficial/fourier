import {
  defineReact,
  useFourierContext,
} from "@fourier-video/sdk";

const BACKGROUND = "#17281f";
const GRID = "#314838";
const GRID_SPACING = 111.6;
const GRID_OFFSET_X = 11.4;
const GRID_OFFSET_Y = 19.2;

function SceneEightBackgroundContinuationLayer() {
  const { width, height } = useFourierContext();
  const verticalLines = Array.from(
    { length: Math.ceil(width / GRID_SPACING) + 1 },
    (_, index) => GRID_OFFSET_X + index * GRID_SPACING,
  );
  const horizontalLines = Array.from(
    { length: Math.ceil(height / GRID_SPACING) + 1 },
    (_, index) => GRID_OFFSET_Y + index * GRID_SPACING,
  );

  return (
    <div
      aria-hidden="true"
      style={{ position: "relative", width, height, overflow: "hidden", background: BACKGROUND }}
    >
      {verticalLines.map((left) => (
        <span
          key={`v-${left}`}
          style={{ position: "absolute", left, top: 0, width: 1, height, background: GRID, opacity: 0.56 }}
        />
      ))}
      {horizontalLines.map((top) => (
        <span
          key={`h-${top}`}
          style={{ position: "absolute", left: 0, top, width, height: 1, background: GRID, opacity: 0.56 }}
        />
      ))}
    </div>
  );
}

export default defineReact({
  name: "SceneEightBackgroundContinuation",
  schema: {},
  static: true,
  component() {
    return <SceneEightBackgroundContinuationLayer />;
  },
  designPreview() {
    return {
      props: {},
      composition: { width: 1920, height: 1080, durationSeconds: 0 },
      player: { background: BACKGROUND },
    };
  },
});
