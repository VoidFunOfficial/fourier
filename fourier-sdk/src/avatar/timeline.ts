import { avatarFail, defineAvatar, finite, freeze, parameterRanges } from "./model.ts";
import { defineAvatarSpeech, sampleAvatarSpeech } from "./lipsync.ts";
import type { AvatarAction, AvatarBlend, AvatarCurve, AvatarExpression, AvatarGesture, AvatarModel, AvatarMotion, AvatarParameters, AvatarPoint, AvatarTarget, AvatarTimeline, AvatarTimelineOptions, AvatarTrack } from "./types.ts";

export const AVATAR_EXPRESSIONS: Readonly<Record<string, AvatarExpression>> = freeze({
  neutral: { parameters: {} }, happy: { parameters: { Smile: 0.8, MouthForm: 0.65, BrowL: 0.2, BrowR: 0.2 } },
  confident: { parameters: { Smile: 0.35, HeadPitch: 0.08, BrowL: 0.1, BrowR: 0.1 } },
  angry: { parameters: { BrowL: -0.8, BrowR: -0.8, MouthForm: -0.6 } },
  sad: { parameters: { BrowL: -0.3, BrowR: -0.3, HeadPitch: -0.2, MouthForm: -0.7 } },
  surprised: { parameters: { BrowL: 0.8, BrowR: 0.8, MouthOpen: 0.6, MouthForm: -0.4 } },
  thinking: { parameters: { EyeX: 0.3, EyeY: -0.3, HeadRoll: 0.12, BrowL: 0.25 } },
});
export function sampleAvatarCurve(curve: AvatarCurve, t: number): number {
  finite(t, "curve time");
  if (!curve.length) avatarFail("curve 不能为空");
  if (t <= curve[0]!.t) return curve[0]!.value;
  if (t >= curve.at(-1)!.t) return curve.at(-1)!.value;
  let lo = 1, hi = curve.length - 1;
  while (lo < hi) { const m = (lo + hi) >>> 1; if (curve[m]!.t < t) lo = m + 1; else hi = m; }
  const a = curve[lo - 1]!, b = curve[lo]!; let u = (t - a.t) / (b.t - a.t);
  if (a.easing === "step") u = t < b.t ? 0 : 1;
  else if (a.easing === "smooth") u = u * u * (3 - 2 * u);
  return a.value + (b.value - a.value) * u;
}
function track(parameter: string, values: readonly number[], duration: number, blend: AvatarBlend = "add"): AvatarTrack {
  return { parameter, blend, keys: values.map((value, i) => ({ t: i * duration / (values.length - 1), value, easing: "smooth" })) };
}
/** Cross-model semantic motion library; all amplitudes are normalized parameters. */
export function avatarMotion(name: AvatarGesture, duration = 1.6): AvatarMotion {
  const t = (p: string, v: readonly number[]) => track(p, v, duration);
  const motions: Record<AvatarGesture, readonly AvatarTrack[]> = {
    idle: [], nod: [t("HeadPitch", [0, -0.22, 0.12, 0])],
    shakeHead: [t("HeadYaw", [0, -0.32, 0.32, -0.2, 0])],
    wave: [t("ArmR", [0, 0.8, 0.8, 0.8, 0]), t("HandR", [0, -0.4, 0.7, -0.6, 0])],
    point: [t("ArmR", [0, 0.85, 0.85, 0]), t("HandR", [0, 0.42, 0.42, 0]), t("BodyYaw", [0, 0.12, 0.12, 0]), t("HeadYaw", [0, -0.08, -0.08, 0])],
    thinking: [t("HeadRoll", [0, 0.15, 0.15, 0]), t("ArmL", [0, 0.5, 0.5, 0]), t("EyeY", [0, -0.3, -0.3, 0])],
    explain: [t("ArmL", [0, 0.25, 0.1, 0.3, 0]), t("ArmR", [0, 0.1, 0.35, 0.15, 0]), t("HeadPitch", [0, 0.05, -0.1, 0.03, 0])],
    emphasize: [t("HeadPitch", [0, -0.18, 0.05, 0]), t("HandR", [0, 0.45, 0.1, 0]), t("BrowL", [0, 0.25, 0.1, 0]), t("BrowR", [0, 0.25, 0.1, 0])],
  };
  finite(duration, "duration"); if (duration <= 0 || !Object.hasOwn(motions, name)) avatarFail("动作名称或 duration 无效");
  return freeze({ duration, tracks: motions[name] });
}
function mix(target: Record<string, number>, source: AvatarParameters, mode: AvatarBlend, weight = 1): void {
  for (const [key, value] of Object.entries(source)) {
    const previous = target[key] ?? 0;
    target[key] = mode === "add" ? previous + value * weight : mode === "multiply" ? previous * (1 + (value - 1) * weight) : previous + (value - previous) * weight;
  }
}
export function mixAvatarParameters(base: AvatarParameters, layers: readonly { readonly parameters: AvatarParameters; readonly blend?: AvatarBlend; readonly weight?: number }[]): AvatarParameters {
  const result = { ...base };
  for (const [key, value] of Object.entries(base)) finite(value, key);
  for (const layer of layers) {
    const weight = finite(layer.weight ?? 1, "weight");
    if (weight < 0 || weight > 1) avatarFail("weight 必须在 [0,1] 范围内");
    for (const [key, value] of Object.entries(layer.parameters)) finite(value, key);
    mix(result, layer.parameters, layer.blend ?? "replace", weight);
  }
  return freeze(result);
}
function resolveTarget(target: AvatarTarget, options: AvatarTimelineOptions): AvatarPoint {
  const result = target === "camera" ? [0, 0] as const : typeof target === "string" ? options.targets?.[target] : target;
  if (result === undefined || result.length !== 2 || result.some(n => !Number.isFinite(n) || Math.abs(n) > 1)) avatarFail(`lookAt 需要 [-1,1] 目标坐标：${String(target)}`);
  return result;
}
function expressionFor(name: string, model: AvatarModel): AvatarExpression {
  const result = model.expressions && Object.hasOwn(model.expressions, name)
    ? model.expressions[name] : Object.hasOwn(AVATAR_EXPRESSIONS, name) ? AVATAR_EXPRESSIONS[name] : undefined;
  if (result === undefined) avatarFail(`未知表情 ${name}`);
  return result;
}
interface CompiledAction { action: AvatarAction; duration: number; motion?: AvatarMotion; expression?: AvatarExpression; target?: AvatarPoint }

/** Compiles once and bakes spring outputs at exactly 60 Hz. No render-history state. */
export function compileAvatarTimeline(input: AvatarModel, config: AvatarTimelineOptions): AvatarTimeline {
  const model = defineAvatar(input);
  const options = freeze(structuredClone(config));
  const duration = finite(options.duration, "timeline.duration");
  if (duration <= 0 || duration > 3600) avatarFail("timeline.duration 必须在 (0,3600] 秒内");
  const seed = finite(options.seed ?? 0, "seed");
  const ranges = parameterRanges(model); const defaults = Object.fromEntries(Object.entries(ranges).map(([key, r]) => [key, r[2]]));
  const baseExpression = options.expression === undefined ? undefined : expressionFor(options.expression, model);
  const gaze = options.lookAt === undefined ? undefined : resolveTarget(options.lookAt, options);
  const speech = options.speak === undefined ? undefined : defineAvatarSpeech(options.speak);
  if (speech !== undefined && speech.duration > duration) avatarFail("speech 超过时间轴长度");
  for (const [key, value] of Object.entries(options.parameters ?? {})) { if (!Object.hasOwn(ranges, key)) avatarFail(`未知参数 ${key}`); finite(value, key); }
  const actions: CompiledAction[] = (options.actions ?? []).map(action => {
    const at = finite(action.at, "action.at");
    const strength = finite(action.strength ?? 1, "strength"); finite(action.priority ?? 0, "priority");
    if (at < 0 || at >= duration || strength < 0 || strength > 1) avatarFail("action 时间或强度超出范围");
    let motion: AvatarMotion | undefined, expression: AvatarExpression | undefined;
    if (action.action === "motion") {
      motion = model.motions?.[action.name ?? ""]; if (!motion) avatarFail(`未知 motion ${action.name ?? ""}`);
    } else if (["emotion", "react", "smile", "surprised"].includes(action.action)) {
      expression = expressionFor(action.name ?? (action.action === "smile" ? "happy" : action.action === "surprised" ? "surprised" : "neutral"), model);
    } else if (action.action !== "lookAt" && action.action !== "speak") motion = avatarMotion(action.action as AvatarGesture);
    if (action.action === "speak" && !action.speech) avatarFail("speak 需要预计算的 speech 数据", "AVATAR_SPEECH_REQUIRED");
    if (action.speech) defineAvatarSpeech(action.speech);
    const d = finite(action.duration ?? action.speech?.duration ?? motion?.duration ?? 1.6, "action.duration");
    if (d <= 0 || at + d > duration + 1e-9 || (action.speech && d < action.speech.duration)) avatarFail("action 超出时间轴范围");
    if (action.action === "lookAt" && action.target === undefined) avatarFail("lookAt action 需要 target");
    return { action, duration: d, ...(motion ? { motion } : {}), ...(expression ? { expression } : {}), ...(action.target !== undefined ? { target: resolveTarget(action.target, options) } : {}) };
  }).sort((a, b) => (a.action.priority ?? 0) - (b.action.priority ?? 0));
  const clamp = (values: Record<string, number>) => {
    for (const [key, r] of Object.entries(ranges)) values[key] = Math.min(r[1], Math.max(r[0], values[key] ?? r[2]));
    return values;
  };
  const sampleBase = (time: number): Record<string, number> => {
    const p = { ...defaults };
    if (options.idle !== false) {
      const phase = ((seed % 997) + 997) % 997 / 997 * Math.PI * 2;
      p.Breath = (1 - Math.cos(time * 1.7 + phase)) * 0.5;
      p.HeadRoll = Math.sin(time * 0.72 + phase) * 0.035;
      p.BodyYaw = Math.sin(time * 0.53 + phase) * 0.025;
      const cycle = 3.7 + ((seed % 11) + 11) % 11 * 0.071;
      const blink = ((time + cycle - 1.4 + phase * 0.1) % cycle) / 0.18;
      p.EyeOpenL = p.EyeOpenR = blink < 1 ? Math.abs(blink * 2 - 1) : 1;
    }
    if (baseExpression) mix(p, baseExpression.parameters, baseExpression.blend ?? "replace");
    if (gaze) { p.EyeX = gaze[0]; p.EyeY = gaze[1]; }
    for (const entry of actions) {
      const local = time - entry.action.at;
      if (local < 0 || local >= entry.duration) continue;
      const strength = entry.action.strength ?? 1;
      const ramp = Math.min(0.15, entry.duration * 0.2);
      const weight = Math.min(1, local / ramp, (entry.duration - local) / ramp) * strength;
      if (entry.motion) {
        const motionTime = entry.motion.loop ? local % entry.motion.duration : local / entry.duration * entry.motion.duration;
        for (const tr of entry.motion.tracks) mix(p, { [tr.parameter]: sampleAvatarCurve(tr.keys, motionTime) }, tr.blend ?? "replace", strength);
      }
      if (entry.expression) mix(p, entry.expression.parameters, entry.expression.blend ?? "replace", weight);
      if (entry.target) mix(p, { EyeX: entry.target[0], EyeY: entry.target[1], HeadYaw: entry.target[0] * 0.3 }, "replace", weight);
    }
    // Speech owns mouth channels after expressions/gestures; explicit overrides are last.
    if (speech) mix(p, sampleAvatarSpeech(speech, time), "replace");
    for (const entry of actions) if (entry.action.speech && time >= entry.action.at && time < entry.action.at + entry.duration) mix(p, sampleAvatarSpeech(entry.action.speech, time - entry.action.at), "replace", entry.action.strength ?? 1);
    mix(p, options.parameters ?? {}, "replace");
    return clamp(p);
  };
  const springs = model.physics ?? []; const count = Math.ceil(duration * 60) + 1;
  const baked = springs.map(() => new Float64Array(count));
  const states = springs.map(s => ({ x: defaults[s.output]!, v: 0 }));
  for (let i = 0; i < count && springs.length; i++) {
    const p = sampleBase(i / 60);
    springs.forEach((spring, j) => {
      const state = states[j]!; const mass = spring.mass ?? 1;
      // Backward Euler is stable for stiff springs and uses a fixed 1/60 second step.
      if (i > 0) {
        const dt = 1 / 60, k = spring.stiffness / mass, c = spring.damping / mass;
        state.v = (state.v + dt * k * (p[spring.input]! * (spring.gain ?? 1) - state.x)) / (1 + dt * c + dt * dt * k);
        state.x += dt * state.v;
      }
      const r = ranges[spring.output]!;
      baked[j]![i] = Math.min(r[1], Math.max(r[0], state.x));
    });
  }
  return Object.freeze({ duration, sample(timeSeconds: number): AvatarParameters {
    const t = Math.max(0, Math.min(duration, finite(timeSeconds, "timeSeconds")));
    const p = sampleBase(t); const frame = t * 60; const index = Math.floor(frame); const fraction = frame - index;
    springs.forEach((s, j) => { const values = baked[j]!; const a = values[index]!; p[s.output] = a + ((values[index + 1] ?? a) - a) * fraction; });
    return Object.freeze(p);
  } });
}
