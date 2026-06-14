# test_main.py — automated correctness tests for the bio-engine.
# Run with:  pytest -v
import asyncio
from main import gc_content, analyze_sequence, DNARequest


# ---------- helper ----------
def run_analyze(sequence, nuclease="SpCas9"):
    """analyze_sequence is async, so run it and return the result dict."""
    request = DNARequest(sequence=sequence, nuclease=nuclease)
    return asyncio.run(analyze_sequence(request))


# ---------- GC content tests ----------
def test_gc_content_all_gc():
    assert gc_content("GGGGCCCC") == 100.0


def test_gc_content_no_gc():
    assert gc_content("ATATATAT") == 0.0


def test_gc_content_half():
    assert gc_content("ATGCATGC") == 50.0


# ---------- PAM-finding tests ----------
def test_no_pam_means_no_candidates():
    # All A/T -> no G at all -> no NGG PAM possible -> 0 candidates.
    seq = "ATATATATATATATATATATATATATATAT"
    result = run_analyze(seq)
    assert result["candidate_count"] == 0


def test_finds_one_forward_pam():
    # Construct a sequence with a known SpCas9 site: 20bp guide + NGG PAM.
    guide = "ATCGATCGATCGATCGATCG"
    pam = "AGG"
    seq = guide + pam
    result = run_analyze(seq)
    forward = [c for c in result["candidates"] if c["strand"] == "forward"]
    assert any(c["guide_sequence"] == guide and c["pam"] == pam for c in forward)

def test_short_sequence_raises_error():
    # Sequences under 23bp can't contain even one SpCas9 site -> should error.
    from fastapi import HTTPException
    import pytest
    with pytest.raises(HTTPException):
        run_analyze("ATCG")  # way too short


def test_different_nuclease_uses_different_pam():
    # Cas12a uses a TTTV PAM on the 5' side, not NGG. Build a Cas12a site.
    # TTTV PAM (V=A/C/G) + 24bp guide.
    pam = "TTTA"
    guide = "ATCGATCGATCGATCGATCGATCG"  # 24 bp for Cas12a
    seq = pam + guide
    result = run_analyze(seq, nuclease="Cas12a")
    forward = [c for c in result["candidates"] if c["strand"] == "forward"]
    assert any(c["pam"] == pam and c["guide_sequence"] == guide for c in forward)