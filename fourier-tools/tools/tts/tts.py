from tools.runtime import MODELS, ModelSlot, local_model


def save_audio(waveform, sample_rate, output):
    import numpy as np
    import soundfile as sf

    samples = np.asarray(waveform, dtype=np.float32).reshape(-1)
    if not samples.size or not np.isfinite(samples).all():
        raise RuntimeError("Speech model returned empty or invalid audio")
    sf.write(str(output), samples, sample_rate, subtype="PCM_16")
    return {"sampleRate": sample_rate, "duration": len(samples) / sample_rate}


class SpeechSynthesizer:
    def __init__(self, voxcpm_path=MODELS / "tts_model", cosyvoice_path=MODELS / "tts_cosy"):
        self.voxcpm_path = voxcpm_path
        self.cosyvoice_path = cosyvoice_path
        self.slots = {"voxcpm": ModelSlot(self._load_voxcpm),
                      "cosyvoice": ModelSlot(self._load_cosyvoice)}

    def _load_voxcpm(self):
        from voxcpm import VoxCPM
        return VoxCPM.from_pretrained(local_model(self.voxcpm_path), load_denoiser=False)

    def _load_cosyvoice(self):
        from cosyvoice.cli.cosyvoice import AutoModel
        return AutoModel(model_dir=local_model(self.cosyvoice_path))

    def synthesize(self, output, text, provider="voxcpm", reference=None, prompt_text=None):
        def infer(model):
            if provider == "voxcpm":
                kwargs = {"text": text, "cfg_value": 2.0, "inference_timesteps": 10}
                if reference:
                    kwargs["reference_wav_path"] = str(reference)
                    if prompt_text:
                        kwargs.update(prompt_wav_path=str(reference), prompt_text=prompt_text)
                wav = model.generate(**kwargs)
                return save_audio(wav, model.tts_model.sample_rate, output)

            import torch

            if reference is None:
                raise ValueError("CosyVoice requires reference audio")
            if prompt_text:
                chunks = model.inference_zero_shot(text, prompt_text, str(reference), stream=False)
            else:
                chunks = model.inference_cross_lingual(text, str(reference), stream=False)
            waves = [chunk["tts_speech"].detach().float().cpu() for chunk in chunks]
            if not waves:
                raise RuntimeError("Speech model returned no audio")
            wav = torch.cat(waves, dim=-1).squeeze(0).numpy()
            return save_audio(wav, model.sample_rate, output)
        return self.slots[provider].run(infer)
