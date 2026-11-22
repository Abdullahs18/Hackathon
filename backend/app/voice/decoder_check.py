"""Local synthetic WebM decoder check; never contacts a provider or a database."""

import json
import os
import subprocess
import wave
from io import BytesIO

import imageio_ffmpeg

from app.voice.audio import parse_audio


def main():
    source = BytesIO()
    with wave.open(source, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(8000)
        wav.writeframes(b"\0\0" * 8000)
    encoded = subprocess.run(
        [
            imageio_ffmpeg.get_ffmpeg_exe(),
            "-nostdin",
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "wav",
            "-i",
            "pipe:0",
            "-c:a",
            "libopus",
            "-f",
            "webm",
            "pipe:1",
        ],
        input=source.getvalue(),
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        timeout=15,
        check=True,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
    )
    result = parse_audio(encoded.stdout)
    assert result.mime_type == "audio/wav" and 0 < result.duration_seconds < 2
    print(
        json.dumps(
            {
                "webm_decoder": "ok",
                "normalized_mime": result.mime_type,
                "seconds": result.duration_seconds,
            }
        )
    )


if __name__ == "__main__":
    main()
