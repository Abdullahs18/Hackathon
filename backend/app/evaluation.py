"""Synthetic, opt-in Gemini evaluation. Never mutates a complaint or grants access."""

import argparse
import json
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path
from time import monotonic

from app.analysis_policy import evaluate
from app.voice.audio import load_audio
from app.voice.config import VoiceError, VoiceSettings
from app.voice.providers import GeminiProvider

FIELDS = {
    "amount",
    "currency",
    "money_lost",
    "incident_date",
    "transaction_reference",
    "payment_method",
    "platform",
    "suspect_details",
}


def load_cases(path):
    rows = [
        json.loads(line)
        for line in Path(path).read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    identifiers = set()
    for row in rows:
        if (
            not isinstance(row.get("id"), str)
            or row["id"] in identifiers
            or row.get("synthetic") is not True
            or not row.get("text", "").strip()
            or not isinstance(row.get("expected"), dict)
            or set(row["expected"]) - FIELDS
            or not row["expected"]
        ):
            raise ValueError("Invalid synthetic evaluation case or duplicate identifier.")
        identifiers.add(row["id"])
    if not rows:
        raise ValueError("Evaluation dataset is empty.")
    return rows


def score(expected, actual):
    """Exact critical-field agreement; null specifically measures preserved unknowns."""
    matches = {
        field: field in actual and actual[field] == value for field, value in expected.items()
    }
    return {
        "field_matches": matches,
        "matched": sum(matches.values()),
        "total": len(matches),
        "unknown_total": sum(value is None for value in expected.values()),
        "unknown_preserved": sum(
            field in actual and actual[field] is None
            for field, value in expected.items()
            if value is None
        ),
        "missing_output_fields": sorted(set(expected) - set(actual)),
    }


def word_error_rate(expected, actual):
    reference, observed = expected.split(), actual.split()
    previous = list(range(len(observed) + 1))
    for index, word in enumerate(reference, 1):
        current = [index]
        for position, other in enumerate(observed, 1):
            current.append(
                min(
                    current[-1] + 1,
                    previous[position] + 1,
                    previous[position - 1] + (word != other),
                )
            )
        previous = current
    return previous[-1] / max(1, len(reference))


def run(cases, provider, audio_root=None):
    records = []
    for case in cases:
        started = monotonic()
        try:
            text = case["text"]
            audio_metrics = {}
            if case.get("audio_file"):
                if audio_root is None:
                    raise ValueError("Audio cases require a dataset directory.")
                root = Path(audio_root).resolve()
                path = (root / case["audio_file"]).resolve()
                if not path.is_relative_to(root):
                    raise ValueError("Audio path must stay inside the dataset directory.")
                text = provider.transcribe(load_audio(path))
                audio_metrics = {
                    "transcript": text,
                    "word_error_rate": word_error_rate(case["text"], text),
                }
            assessment = provider.assess({"description": text})
            actual = assessment.extraction.incident_data
            route_match = assessment.classification.incident_type not in {"unclear", "out of scope"}
            policy = evaluate(
                actual,
                assessment,
                bool(case.get("possible_duplicate")),
                route_match,
                None if route_match else "no_matching_rule",
            )
            records.append(
                {
                    "id": case["id"],
                    "status": "completed",
                    "expected": case["expected"],
                    "actual": {field: actual.get(field) for field in case["expected"]},
                    **score(case["expected"], actual),
                    "classification": assessment.classification.incident_type,
                    "classification_match": assessment.classification.incident_type
                    == case.get("classification")
                    if case.get("classification")
                    else None,
                    "handling": policy["current_status"],
                    "handling_match": policy["current_status"] == case.get("expected_status")
                    if case.get("expected_status")
                    else None,
                    "handoff_reasons": policy["handoff_reasons"],
                    "elapsed_seconds": round(monotonic() - started, 3),
                    **audio_metrics,
                }
            )
        except VoiceError as error:
            records.append({"id": case["id"], "status": "provider_error", "error_code": error.code})
    completed = [row for row in records if row["status"] == "completed"]
    totals = Counter()
    for row in completed:
        totals.update(
            {key: row[key] for key in ["matched", "total", "unknown_total", "unknown_preserved"]}
        )
    classifications = [
        row["classification_match"] for row in completed if row["classification_match"] is not None
    ]
    handling = [row["handling_match"] for row in completed if row["handling_match"] is not None]
    return {
        "created_at": datetime.now(UTC).isoformat(),
        "model": provider.model,
        "case_count": len(cases),
        "completed": len(completed),
        "provider_errors": len(cases) - len(completed),
        "classification_accuracy": sum(classifications) / len(classifications)
        if classifications
        else None,
        "handling_accuracy": sum(handling) / len(handling) if handling else None,
        "counts": dict(totals),
        "critical_field_accuracy": totals["matched"] / totals["total"] if totals["total"] else None,
        "unknown_preservation": totals["unknown_preserved"] / totals["unknown_total"]
        if totals["unknown_total"]
        else None,
        "cases": records,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--cases",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "evaluation" / "cases.jsonl",
    )
    parser.add_argument("--live", action="store_true")
    parser.add_argument("--allow-external-processing", action="store_true")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    cases = load_cases(args.cases)
    if not args.live:
        print(json.dumps({"validated_cases": len(cases), "provider_calls": 0}))
        return
    if not args.allow_external_processing or args.output is None:
        parser.error("Live evaluation requires --allow-external-processing and --output.")
    provider = GeminiProvider(VoiceSettings())
    try:
        report = run(cases, provider, args.cases.parent)
    finally:
        provider.close()
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({key: value for key, value in report.items() if key != "cases"}))
    if report["provider_errors"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
