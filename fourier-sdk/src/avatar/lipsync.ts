import { array, avatarFail, finite, freeze, record, textValue } from "./model.ts";
import type { AvatarParameters, AvatarSpeech, AvatarViseme, AvatarVisemeCue } from "./types.ts";

const shapes: Readonly<Record<AvatarViseme, readonly [number, number]>> = freeze({
  sil: [0, 0], A: [0.9, 0.1], I: [0.3, 0.8], U: [0.35, -0.8], E: [0.5, 0.55], O: [0.65, -0.65], M: [0, 0], F: [0.15, 0.35],
});
/** Accepts an already timed phoneme sequence from a TTS/forced-alignment provider. */
export function phonemesToSpeech(input: {
  readonly audioHash: string;
  readonly duration: number;
  readonly phonemes: readonly { readonly start: number; readonly end: number; readonly phoneme: string }[];
}): AvatarSpeech {
  const viseme = (phoneme: string): AvatarViseme => {
    if (typeof phoneme !== "string") avatarFail("phoneme 必须是字符串");
    const p = phoneme.toLowerCase().replace(/[0-9]/g, "");
    if (["", "sil", "sp", "pau"].includes(p)) return "sil";
    if (["m", "b", "p", "mbp"].includes(p)) return "M";
    if (["f", "v"].includes(p)) return "F";
    if (["a", "aa", "ae", "ah", "ɑ", "æ"].includes(p)) return "A";
    if (["i", "iy", "ih", "y", "ɪ", "j"].includes(p)) return "I";
    if (["u", "uw", "uh", "ü", "w", "ʊ"].includes(p)) return "U";
    if (["o", "ao", "ow", "ɔ", "ɒ"].includes(p)) return "O";
    return "E";
  };
  return defineAvatarSpeech({ version: 1, audioHash: input.audioHash, duration: input.duration,
    cues: input.phonemes.map(p => ({ start: p.start, end: p.end, viseme: viseme(p.phoneme) })) });
}
export function defineAvatarSpeech(value: unknown): AvatarSpeech {
  const data = record(value, "speech");
  if (data.version !== 1) avatarFail("speech.version 必须为 1");
  textValue(data.audioHash, "audioHash"); const duration = finite(data.duration, "speech.duration");
  if (duration <= 0) avatarFail("speech.duration 必须为正");
  let end = 0;
  for (const raw of array(data.cues, "speech.cues")) {
    const cue = record(raw, "viseme"); const start = finite(cue.start, "cue.start"); const next = finite(cue.end, "cue.end");
    if (start < end || next <= start || next > duration) avatarFail("viseme 时间必须有序、无重叠且在音频范围内");
    if (!Object.hasOwn(shapes, String(cue.viseme))) avatarFail(`未知 viseme ${String(cue.viseme)}`);
    if (cue.strength !== undefined && (finite(cue.strength, "cue.strength") < 0 || Number(cue.strength) > 1)) avatarFail("viseme strength 超出范围");
    end = next;
  }
  return freeze(structuredClone(data) as unknown as AvatarSpeech);
}
/** Offline amplitude fallback. Call during preparation, never in a frame render. */
export function pcmToSpeech(samples: Float32Array, sampleRate: number, audioHash: string): AvatarSpeech {
  if (!samples.length || !Number.isFinite(sampleRate) || sampleRate < 1000 || sampleRate > 384000) avatarFail("PCM 数据或采样率无效");
  const hop = Math.max(1, Math.round(sampleRate / 50)); const cues: AvatarVisemeCue[] = [];
  for (let i = 0; i < samples.length; i += hop) {
    let energy = 0; const count = Math.min(hop, samples.length - i);
    for (let j = 0; j < count; j++) { const n = finite(samples[i + j], "PCM"); energy += n * n; }
    const rms = Math.sqrt(energy / count); const strength = Math.min(1, Math.max(0, (rms - 0.012) * 7));
    cues.push({ start: i / sampleRate, end: (i + count) / sampleRate, viseme: strength === 0 ? "sil" : "A", strength });
  }
  return defineAvatarSpeech({ version: 1, audioHash, duration: samples.length / sampleRate, cues });
}
/** Gaps and time outside audio resolve to a closed mouth. Short cues use short ramps. */
export function sampleAvatarSpeech(speech: AvatarSpeech, time: number): AvatarParameters {
  finite(time, "speech time");
  const closed = { MouthOpen: 0, MouthForm: 0 };
  if (time < 0 || time >= speech.duration) return closed;
  let lo = 0, hi = speech.cues.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1; const cue = speech.cues[mid]!;
    if (time < cue.start) hi = mid - 1;
    else if (time >= cue.end) lo = mid + 1;
    else {
      const edge = Math.min(0.035, (cue.end - cue.start) * 0.2);
      const weight = Math.min(1, (time - cue.start) / edge, (cue.end - time) / edge) * (cue.strength ?? 1);
      const shape = shapes[cue.viseme];
      return { MouthOpen: shape[0] * weight, MouthForm: shape[1] * weight };
    }
  }
  return closed;
}
