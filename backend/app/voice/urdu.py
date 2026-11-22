"""Urdu speech rendering preserves saved Urdu, identifiers and numbers verbatim."""

import re
from dataclasses import dataclass
from uuid import uuid4

from app.voice.config import VoiceError

LATIN = re.compile(r"[A-Za-z]")
SLOT = re.compile(r"__K[a-f0-9]{8}_[0-9]+__")


def invalid():
    return VoiceError("invalid_model_output", "Urdu translation failed preservation checks.")


def has_urdu(text):
    return any("\u0600" <= c <= "\u06ff" and c.isalpha() for c in text)


def needs_translation(text, literals=()):
    for literal in literals:
        if literal:
            text = text.replace(literal, "")
    return bool(LATIN.search(text))


@dataclass(frozen=True)
class UrduTranslation:
    source: str
    masked: str
    replacements: tuple[tuple[str, str], ...]

    def restore(self, output):
        if not isinstance(output, str) or len(output) > 12000:
            raise invalid()
        output = output.strip()
        expected = [token for token, _ in self.replacements]
        if SLOT.findall(output) != expected:
            raise invalid()
        remainder = SLOT.sub("", output)
        if LATIN.search(remainder) or re.search(r"\d", remainder) or not has_urdu(remainder):
            raise invalid()
        if self.masked.startswith(expected[0]) and not output.startswith(expected[0]):
            raise invalid()
        if self.masked.endswith(expected[-1]) and not output.endswith(expected[-1]):
            raise invalid()
        for token, literal in self.replacements:
            output = output.replace(token, literal)
        if len(output) > 2000 or not has_urdu(output):
            raise invalid()
        return output


def prepare_translation(text, literals=()):
    if not isinstance(text, str) or not 0 < len(text) <= 2000:
        raise invalid()
    protected = sorted(
        {value for value in literals if value and value in text}, key=len, reverse=True
    )
    # Existing Urdu framing, including unfiled-status/authorization statements, is immutable.
    pattern = "|".join(
        [
            *(re.escape(value) for value in protected),
            r"[\u0600-\u06ff][\u0600-\u06ff\s۔،:؛؟.!]*",
            r"[0-9]+(?:[.,:/-][0-9]+)*",
        ]
    )
    prefix = "__K" + uuid4().hex[:8] + "_"
    while prefix in text:
        prefix = "__K" + uuid4().hex[:8] + "_"
    replacements = []

    def replace(match):
        token = prefix + str(len(replacements)) + "__"
        replacements.append((token, match.group()))
        return token

    masked = re.sub(pattern, replace, text)
    if not replacements or len(replacements) > 64 or len(masked) > 12000:
        raise invalid()
    return UrduTranslation(text, masked, tuple(replacements))
