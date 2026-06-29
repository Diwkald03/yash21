"""Tests for Stage 03 — AI Content Analysis."""
import json
import pytest
from unittest.mock import patch


SAMPLE_ANALYSIS = {
    "topic": "Review of stainless steel casserole suitable for Indian kitchen",
    "intent": "commercial",
    "buying_intent": "high",
    "target_audience": "Indian home cooks and kitchen shoppers",
    "problem_solved": "Finding a durable and affordable casserole for daily Indian cooking",
    "products": ["stainless steel casserole", "cooking pot"],
    "collections": ["kitchen essentials", "cookware"],
    "primary_keyword": "stainless steel casserole India",
    "secondary_keywords": ["best casserole for Indian cooking", "steel casserole buy online", "kitchen cookware India"],
    "key_points": [
        "Durable stainless steel construction",
        "Suitable for all cooktops",
        "Affordable price point",
        "Available on Grabnix",
    ],
}


@patch("backend.pipeline.stage03_analysis.call_claude")
def test_valid_json_response(mock_claude):
    mock_claude.return_value = json.dumps(SAMPLE_ANALYSIS)

    from backend.pipeline.stage03_analysis import run
    result = run("Sample transcript text about casseroles.")

    assert result["intent"] == "commercial"
    assert result["buying_intent"] == "high"
    assert "stainless steel casserole" in result["products"]
    assert result["primary_keyword"] == "stainless steel casserole India"


@patch("backend.pipeline.stage03_analysis.call_claude")
def test_json_repair_on_bad_response(mock_claude):
    bad_json = "Here is the analysis: " + json.dumps(SAMPLE_ANALYSIS)
    mock_claude.side_effect = [bad_json, json.dumps(SAMPLE_ANALYSIS)]

    from backend.pipeline.stage03_analysis import run
    result = run("Transcript text.")
    assert result["topic"] == SAMPLE_ANALYSIS["topic"]
    assert mock_claude.call_count == 2


@patch("backend.pipeline.stage03_analysis.call_claude")
def test_transcript_truncation(mock_claude):
    mock_claude.return_value = json.dumps(SAMPLE_ANALYSIS)
    long_transcript = "word " * 15000  # well over 50_000 chars

    from backend.pipeline.stage03_analysis import run, _MAX_TRANSCRIPT_CHARS
    run(long_transcript)

    call_args = mock_claude.call_args
    sent_prompt = call_args[1]["prompt"] if "prompt" in call_args[1] else call_args[0][1]
    assert len(long_transcript) > _MAX_TRANSCRIPT_CHARS
