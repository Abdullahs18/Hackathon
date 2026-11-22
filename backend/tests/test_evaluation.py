import json

import pytest

from app.evaluation import load_cases, run, score, word_error_rate
from app.voice.config import VoiceError
from tests.test_analysis import FakeProvider


def test_synthetic_dataset_is_valid_and_covers_three_languages():
    from pathlib import Path

    rows = load_cases(Path(__file__).resolve().parents[1] / "evaluation" / "cases.jsonl")
    assert len(rows) == 36
    assert {row["language"] for row in rows} == {"en", "ur", "roman-ur"}
    assert any("prompt-injection" in row["id"] for row in rows)


def test_missing_fields_are_not_counted_as_preserved_unknowns():
    result = score({"amount": None, "transaction_reference": "000123"}, {})
    assert result["matched"] == result["unknown_preserved"] == 0
    assert result["missing_output_fields"] == ["amount", "transaction_reference"]
    assert score({"money_lost": False}, {"money_lost": False})["matched"] == 1
    assert (
        score({"transaction_reference": "000123"}, {"transaction_reference": "123"})["matched"] == 0
    )


def test_evaluation_computes_fields_without_treating_confidence_as_accuracy():
    provider = FakeProvider()
    rows = [
        {
            "id": "test",
            "text": "Synthetic amount",
            "expected": {"amount": 1500, "incident_date": None},
        }
    ]
    report = run(rows, provider)
    assert report["critical_field_accuracy"] == report["unknown_preservation"] == 1
    assert report["completed"] == 1 and report["provider_errors"] == 0
    provider.error = VoiceError("provider_quota", "Safe fixed message")
    failed = run(rows, provider)
    assert failed["critical_field_accuracy"] is None
    assert failed["provider_errors"] == 1


def test_duplicate_or_real_data_rejected(tmp_path):
    path = tmp_path / "cases.jsonl"
    row = {"id": "a", "synthetic": True, "text": "Synthetic", "expected": {"amount": None}}
    path.write_text(json.dumps(row) + "\n" + json.dumps(row), encoding="utf-8")
    with pytest.raises(ValueError):
        load_cases(path)

    row["synthetic"] = False
    path.write_text(json.dumps(row), encoding="utf-8")
    with pytest.raises(ValueError):
        load_cases(path)


def test_word_error_rate_counts_missing_words():
    assert word_error_rate("one two three", "one three") == pytest.approx(1 / 3)
    assert word_error_rate("یہ ایک آزمائش ہے", "یہ ایک آزمائش ہے") == 0
