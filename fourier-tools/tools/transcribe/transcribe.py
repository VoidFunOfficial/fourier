"""SenseVoice via FunASR's built-in implementation, with FSMN VAD."""

import re

from tools.runtime import MODELS, ModelSlot

MODEL_ID = "iic/SenseVoiceSmall"


class Transcriber:
    def __init__(self, model_path=None):
        local = MODELS / "transcribe_model"
        self.model_path = str(model_path or (local if local.is_dir() else MODEL_ID))
        self.slot = ModelSlot(self._load)

    def _load(self):
        import torch
        from funasr import AutoModel
        from funasr.utils.postprocess_utils import rich_transcription_postprocess

        model = AutoModel(
            model=self.model_path,
            hub="ms",
            trust_remote_code=False,
            vad_model="fsmn-vad",
            vad_kwargs={"max_single_segment_time": 30000},
            device="cuda:0" if torch.cuda.is_available() else "cpu",
            disable_update=True,
        )
        return model, rich_transcription_postprocess

    def transcribe(self, source, language="auto", use_itn=True):
        def infer(backend):
            model, postprocess = backend
            results = model.generate(
                input=str(source), cache={}, language=language, use_itn=use_itn,
                batch_size_s=60, merge_vad=True, merge_length_s=15,
            )
            utterances = []
            for item in results:
                raw = item.get("text", "")
                utterances.append({
                    "text": re.sub(r"<\|[^|]+\|>", "", raw).strip(),
                    "richText": postprocess(raw),
                    "rawText": raw,
                    "tags": list(dict.fromkeys(re.findall(r"<\|([^|]+)\|>", raw))),
                })
            # SenseVoice does not supply word alignment; do not invent timestamps.
            return {
                "model": MODEL_ID, "language": language,
                "text": "\n".join(row["text"] for row in utterances),
                "richText": "\n".join(row["richText"] for row in utterances),
                "utterances": utterances,
            }
        return self.slot.run(infer)
