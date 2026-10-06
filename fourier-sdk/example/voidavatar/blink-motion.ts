export type BlinkEvent = Readonly<{
  subject: "girl" | "cat";
  start: number;
  closeSeconds: number;
  holdSeconds: number;
  openSeconds: number;
  rightDelaySeconds: number;
}>;

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Exact event times are exported so previews can inspect closed and reopening eyes. */
export function createBlinkEvents(duration: number): readonly BlinkEvent[] {
  if (!Number.isFinite(duration) || duration < 4 || duration > 1199) throw new Error("眨眼循环时长必须在 4–1199 秒内");
  const event = (subject: BlinkEvent["subject"], fraction: number, closeSeconds: number, holdSeconds: number, openSeconds: number, earliest = 0): BlinkEvent => {
    const rightDelaySeconds = subject === "cat" ? .012 : .010;
    const total = closeSeconds + holdSeconds + openSeconds + rightDelaySeconds;
    // Preserve complete eyelid movement even for a four-second preview. The final
    // event moves earlier, leaving at least 80 ms fully open before the seam.
    const start = Math.min(Math.max(duration * fraction, earliest), duration - total - .08);
    return Object.freeze({ subject, start, closeSeconds, holdSeconds, openSeconds, rightDelaySeconds });
  };
  const firstDouble = event("girl", .382, .075, .055, .120);
  const secondStart = firstDouble.start + firstDouble.closeSeconds + firstDouble.holdSeconds + firstDouble.openSeconds + firstDouble.rightDelaySeconds + .065;
  return Object.freeze([
    event("girl", .115, .080, .060, .150),
    firstDouble,
    event("girl", .409, .075, .065, .135, secondStart),
    event("girl", .705, .115, .095, .235),
    event("girl", .925, .080, .060, .150),
    event("cat", .205, .160, .160, .280),
    event("cat", .545, .120, .110, .240),
    event("cat", .825, .150, .150, .260),
  ].sort((a, b) => a.start - b.start));
}

function eyeOpen(events: readonly BlinkEvent[], time: number, right: boolean): number {
  let openness = 1;
  for (const event of events) {
    const local = time - event.start - (right ? event.rightDelaySeconds : 0);
    if (local < 0) continue;
    const closedUntil = event.closeSeconds + event.holdSeconds;
    const end = closedUntil + event.openSeconds;
    if (local < event.closeSeconds) openness = Math.min(openness, 1 - smooth(local / event.closeSeconds));
    else if (local < closedUntil) openness = 0;
    else if (local < end) openness = Math.min(openness, smooth((local - closedUntil) / event.openSeconds));
  }
  return openness;
}

/** Replace-blend eye openness, independent from the body movement intensity. */
export function createBlinkChannels(duration: number): Readonly<Record<string, (t: number) => number>> {
  const events = createBlinkEvents(duration);
  const girl = events.filter(event => event.subject === "girl");
  const cat = events.filter(event => event.subject === "cat");
  const sample = (subject: readonly BlinkEvent[], right: boolean) => (time: number) => {
    if (!Number.isFinite(time)) throw new Error("眨眼采样时间必须为有限数字");
    const wrapped = (time % duration + duration) % duration;
    return eyeOpen(subject, wrapped, right);
  };
  return Object.freeze({
    EyeOpenL: sample(girl, false),
    EyeOpenR: sample(girl, true),
    CatEyeOpenL: sample(cat, false),
    CatEyeOpenR: sample(cat, true),
  });
}
