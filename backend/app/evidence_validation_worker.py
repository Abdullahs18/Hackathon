"""Bounded format validation worker; never extracts text or rewrites originals."""

import json
import logging
import sys
import warnings
from io import BytesIO

from app.evidence_limits import MAX_EVIDENCE_BYTES, MAX_IMAGE_PIXELS, MAX_PDF_PAGES


def inspect_pdf(data: bytes) -> str:
    from pypdf import PdfReader
    from pypdf.generic import ArrayObject, DictionaryObject, IndirectObject

    if not data.startswith(b"%PDF-") or not data.rstrip().endswith(b"%%EOF"):
        raise ValueError("PDF structure")
    reader = PdfReader(
        BytesIO(data),
        strict=True,
        root_object_recovery_limit=1000,
        xref_stream_maximum_entries=10000,
    )
    if reader.is_encrypted or not 1 <= len(reader.pages) <= MAX_PDF_PAGES:
        raise ValueError("PDF limits")
    blocked = {
        "/A",  # Reject all PDF actions, including action types unknown to this parser policy.
        "/AF",
        "/OpenAction",
        "/AA",
        "/JavaScript",
        "/JS",
        "/Launch",
        "/RichMedia",
        "/EmbeddedFiles",
        "/EmbeddedFile",
        "/EF",
        "/XFA",
        "/AcroForm",
        "/URI",
    }
    stack = [(reader.root_object, 0)]
    references, objects = set(), set()
    nodes = 0
    while stack:
        value, depth = stack.pop()
        nodes += 1
        if nodes > 20000 or depth > 64:
            raise ValueError("PDF complexity")
        if isinstance(value, IndirectObject):
            key = (value.idnum, value.generation)
            if key in references:
                continue
            references.add(key)
            value = value.get_object()
        if isinstance(value, (DictionaryObject, ArrayObject)):
            if id(value) in objects:
                continue
            objects.add(id(value))
        if isinstance(value, DictionaryObject):
            if (
                blocked.intersection(value)
                or value.get("/Subtype") in ("/Widget", "/RichMedia", "/Movie", "/Sound", "/Screen")
                or value.get("/S")
                in (
                    "/JavaScript",
                    "/Launch",
                    "/GoToR",
                    "/SubmitForm",
                    "/ImportData",
                )
            ):
                raise ValueError("Interactive PDF")
            stack.extend((item, depth + 1) for item in value.values())
        elif isinstance(value, ArrayObject):
            stack.extend((item, depth + 1) for item in value)
    reader.close()
    return "application/pdf"


def inspect_file(data: bytes) -> str:
    if not data or len(data) > MAX_EVIDENCE_BYTES:
        raise ValueError("File size")
    if data.startswith(b"%PDF-"):
        return inspect_pdf(data)
    from PIL import Image

    Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS
    with warnings.catch_warnings():
        warnings.simplefilter("error", Image.DecompressionBombWarning)
        with Image.open(BytesIO(data), formats=["PNG", "JPEG", "WEBP"]) as image:
            kind = image.format
            if image.width * image.height > MAX_IMAGE_PIXELS or getattr(image, "n_frames", 1) != 1:
                raise ValueError("Image limits")
            image.verify()
        with Image.open(BytesIO(data), formats=[kind]) as image:
            image.load()
    return {"PNG": "image/png", "JPEG": "image/jpeg", "WEBP": "image/webp"}[kind]


def main() -> int:
    logging.disable(logging.CRITICAL)
    try:
        # Available in the Linux container. Windows still has byte/pixel/object/time bounds.
        try:
            import resource

            resource.setrlimit(resource.RLIMIT_AS, (384 * 1024 * 1024, 384 * 1024 * 1024))
            resource.setrlimit(resource.RLIMIT_CPU, (4, 4))
        except ImportError:
            pass
        data = sys.stdin.buffer.read(MAX_EVIDENCE_BYTES + 1)
        kind = inspect_file(data)
        print(json.dumps({"file_type": kind}))
        return 0
    except ImportError:
        return 2
    except Exception:
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
