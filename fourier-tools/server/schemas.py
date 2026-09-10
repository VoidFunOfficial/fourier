from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

FileId = Annotated[str, Field(pattern=r"^[0-9a-f]{32}$")]
Text = Annotated[str, Field(min_length=1, max_length=10000)]


class Request(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, allow_inf_nan=False)


class ImageRequest(Request):
    fileId: FileId


class MattingRequest(ImageRequest):
    method: Literal["color", "ai"] = "ai"
    targetColor: tuple[Annotated[int, Field(strict=True, ge=0, le=255)],
                       Annotated[int, Field(strict=True, ge=0, le=255)],
                       Annotated[int, Field(strict=True, ge=0, le=255)]] = (255, 255, 255)
    tolerance: float = Field(default=30, gt=0, le=442)
    strength: float = Field(default=1, ge=0, le=1)
    imageSize: int = Field(default=1024, ge=64, le=2048)


class TranscribeRequest(Request):
    fileId: FileId
    language: Literal["auto", "zh", "en", "yue", "ja", "ko", "nospeech"] = "auto"
    useItn: bool = True


class ClipRequest(ImageRequest):
    texts: list[Annotated[str, Field(min_length=1, max_length=2000)]] = Field(min_length=1, max_length=64)


class TtsRequest(Request):
    text: Text
    provider: Literal["voxcpm", "cosyvoice"] = "voxcpm"
    referenceFileId: FileId | None = None
    promptText: Text | None = None

    @model_validator(mode="after")
    def check_reference(self):
        if self.provider == "cosyvoice" and not self.referenceFileId:
            raise ValueError("CosyVoice requires referenceFileId")
        if self.promptText and not self.referenceFileId:
            raise ValueError("promptText requires referenceFileId")
        return self


class FileRecord(BaseModel):
    id: str
    name: str
    size: int
    mediaType: str
    url: str


class ImageResult(BaseModel):
    image: FileRecord
    width: int
    height: int


class MattingResult(ImageResult):
    mask: FileRecord


class Utterance(BaseModel):
    text: str
    richText: str
    rawText: str
    tags: list[str]


class TranscriptionResult(BaseModel):
    model: str
    language: str
    text: str
    richText: str
    utterances: list[Utterance]


class Match(BaseModel):
    index: int
    text: str
    score: float


class ClipResult(BaseModel):
    matches: list[Match]
    scoreType: Literal["cosine_similarity"]


class SpeechResult(BaseModel):
    audio: FileRecord
    provider: Literal["voxcpm", "cosyvoice"]
    sampleRate: int
    duration: float


class ErrorDetail(BaseModel):
    code: str
    message: str
    details: list[dict] | None = None


class ErrorResponse(BaseModel):
    error: ErrorDetail
