from dataclasses import dataclass
from io import BytesIO
from math import isfinite
from pathlib import Path

import mutagen
from mutagen.mp3 import MP3
from mutagen.mp4 import MP4
from mutagen.oggopus import OggOpus
from mutagen.oggvorbis import OggVorbis
from mutagen.wave import WAVE

from app.voice.config import VoiceError

MAX_AUDIO_BYTES = 5 * 1024 * 1024
MAX_AUDIO_SECONDS = 60
MIME_TYPES = {
    WAVE: "audio/wav",
    MP3: "audio/mpeg",
    MP4: "audio/m4a",
    OggOpus: "audio/ogg",
    OggVorbis: "audio/ogg",
}


@dataclass(frozen=True)
class AudioInput:
    data: bytes
    mime_type: str
    duration_seconds: float


def load_audio(path: Path) -> AudioInput:
    with path.open("rb") as source:
        data = source.read(MAX_AUDIO_BYTES + 1)
    if not data or len(data) > MAX_AUDIO_BYTES:
        raise VoiceError("invalid_audio", "Audio must be nonempty and no larger than 5 MiB.")
    try:
        media = mutagen.File(BytesIO(data))
        mime_type = MIME_TYPES.get(type(media))
        duration = float(media.info.length) if media is not None else 0
        if mime_type is None or not isfinite(duration) or not 0 < duration <= MAX_AUDIO_SECONDS:
            raise ValueError("unsupported audio")
    except (mutagen.MutagenError, ValueError, TypeError, AttributeError, EOFError):
        raise VoiceError(
            "invalid_audio", "Use valid WAV, MP3, M4A or Ogg audio, at most 60 seconds."
        ) from None
    return AudioInput(data, mime_type, duration)
