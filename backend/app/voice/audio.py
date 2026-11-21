import os
import subprocess
import wave
from dataclasses import dataclass
from io import BytesIO
from math import isfinite
from pathlib import Path

import imageio_ffmpeg
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
    return parse_audio(data)


def parse_audio(data: bytes) -> AudioInput:
    if not data or len(data) > MAX_AUDIO_BYTES:
        raise VoiceError("invalid_audio", "Audio must be nonempty and no larger than 5 MiB.")
    if data.startswith(b"\x1a\x45\xdf\xa3"):
        # Browser MediaRecorder WebM/Opus: decode bounded audio only, through pipes.
        # No filenames, external protocols, video decoding or shell commands are accepted.
        try:
            result = subprocess.run(
                [
                    imageio_ffmpeg.get_ffmpeg_exe(),
                    "-nostdin",
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-protocol_whitelist",
                    "pipe",
                    "-f",
                    "matroska",
                    "-i",
                    "pipe:0",
                    "-map",
                    "0:a:0",
                    "-vn",
                    "-sn",
                    "-dn",
                    "-threads",
                    "1",
                    "-t",
                    "61",
                    "-ac",
                    "1",
                    "-ar",
                    "16000",
                    "-f",
                    "s16le",
                    "-fs",
                    "1952000",
                    "pipe:1",
                ],
                input=data,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                timeout=15,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
            )
            if result.returncode or not 0 < len(result.stdout) <= MAX_AUDIO_SECONDS * 32000:
                raise ValueError
            output = BytesIO()
            with wave.open(output, "wb") as wav:
                wav.setnchannels(1)
                wav.setsampwidth(2)
                wav.setframerate(16000)
                wav.writeframes(result.stdout)
            return AudioInput(output.getvalue(), "audio/wav", len(result.stdout) / 32000)
        except (OSError, RuntimeError, ValueError, subprocess.TimeoutExpired):
            raise VoiceError("invalid_audio", "Use valid audio at most 60 seconds.") from None
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
