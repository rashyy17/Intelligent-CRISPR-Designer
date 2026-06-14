# bio-engine/main.py
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from Bio.Seq import Seq
import uvicorn


# ----------------- SCORING HELPERS -----------------
def gc_content(guide: str) -> float:
    """Exact GC percentage of the guide (0-100)."""
    if not guide:
        return 0.0
    gc = guide.count('G') + guide.count('C')
    return round((gc / len(guide)) * 100, 1)


def _longest_homopolymer(guide: str) -> int:
    """Length of the longest single-letter run, e.g. 'AAGCCCC' -> 4."""
    if not guide:
        return 0
    longest = run = 1
    for i in range(1, len(guide)):
        run = run + 1 if guide[i] == guide[i - 1] else 1
        longest = max(longest, run)
    return longest


def on_target_efficiency(guide: str) -> float:
    """
    Heuristic on-target score in [0,1]. Real tools use trained models
    (e.g. Doench Rule Set 2); this is a transparent GC-band proxy:
    efficiency peaks for 40-60% GC and falls off linearly outside it.
    """
    gc = gc_content(guide)  # 0-100
    if 40 <= gc <= 60:
        return 1.0
    dist = (40 - gc) if gc < 40 else (gc - 60)
    return round(max(0.0, 1.0 - dist / 40.0), 2)


def off_target_safety(guide: str) -> float:
    """
    Heuristic SAFETY score in [0,1] (higher = safer). Real tools align the
    guide against the whole genome (e.g. CFD / MIT specificity). This proxy
    rewards sequence complexity: repetitive/low-complexity guides are more
    likely to match many genomic sites, so they score lower.
    """
    if not guide:
        return 0.0
    unique_bases = len(set(guide)) / 4.0
    run_penalty = min(_longest_homopolymer(guide) / len(guide), 1.0)
    score = (unique_bases * 0.6) + ((1.0 - run_penalty) * 0.4)
    return round(max(0.0, min(1.0, score)), 2)


# ----------------- APP -----------------
app = FastAPI()


class DNARequest(BaseModel):
    sequence: str
    nuclease: str = 'SpCas9'


@app.post("/analyze_sequence")
async def analyze_sequence(request: DNARequest):
    """
    Deterministically finds gRNA targets in a DNA sequence for different nucleases.
    Supports a few common nucleases (SpCas9, SaCas9, Cas12a, xCas9).
    """
    raw_seq = request.sequence.upper().strip()
    nuclease = (request.nuclease or 'SpCas9')

    # Basic validation
    allowed_bases = set("ATCGN\n\r ")
    if not set(raw_seq).issubset(allowed_bases):
        raise HTTPException(status_code=400, detail="Invalid DNA sequence. Non-standard bases detected.")

    clean_seq_str = "".join(raw_seq.split())  # Remove newlines/spaces
    if len(clean_seq_str) < 23:
        raise HTTPException(status_code=400, detail="Sequence too short to find targets.")

    seq_obj = Seq(clean_seq_str)
    candidates = []

    # Define nuclease-specific rules
    rules = {
        'SpCas9': {'pam_len': 3, 'guide_len': 20, 'pam_side': '3', 'pam_pattern': lambda s: len(s) >= 3 and s[1:3] == 'GG'},
        'SaCas9': {'pam_len': 6, 'guide_len': 21, 'pam_side': '3', 'pam_pattern': lambda s: len(s) >= 6 and s[2] == 'G' and s[4] in 'AG' and s[5] == 'T'},
        'Cas12a': {'pam_len': 4, 'guide_len': 24, 'pam_side': '5', 'pam_pattern': lambda s: len(s) >= 4 and s[0:3] == 'TTT' and s[3] in 'ACG'},
        'xCas9': {'pam_len': 2, 'guide_len': 20, 'pam_side': '3', 'pam_pattern': lambda s: len(s) >= 2 and s[1] == 'G'},
    }

    rule = rules.get(nuclease, rules['SpCas9'])

    # helper to add candidate safely
    def add_candidate(strand, guide_start, guide_seq, pam_seq):
        candidates.append({
            'strand': strand,
            'position': guide_start + 1,  # 1-based
            'guide_sequence': guide_seq,
            'pam': pam_seq,
            # --- real / heuristic scores (names the frontend mapper reads) ---
            'gc_content': gc_content(guide_seq),
            'efficiency': on_target_efficiency(guide_seq),
            'off_target': off_target_safety(guide_seq),
        })

    seq_str = str(seq_obj)

    # Scan forward strand
    L = len(seq_str)
    for i in range(L):
        if rule['pam_side'] == '3':
            pam_start = i + rule['guide_len']
            if pam_start + rule['pam_len'] <= L:
                pam_seq = seq_str[pam_start:pam_start + rule['pam_len']]
                if rule['pam_pattern'](pam_seq):
                    guide_seq = seq_str[i:i + rule['guide_len']]
                    add_candidate('forward', i, guide_seq, pam_seq)
        else:
            # PAM on the 5' side (Cas12a): PAM at i, guide follows
            if i + rule['pam_len'] + rule['guide_len'] <= L:
                pam_seq = seq_str[i:i + rule['pam_len']]
                if rule['pam_pattern'](pam_seq):
                    guide_start = i + rule['pam_len']
                    guide_seq = seq_str[guide_start:guide_start + rule['guide_len']]
                    add_candidate('forward', guide_start, guide_seq, pam_seq)

    # Reverse-complement scan to capture guides on the opposite strand
    rc_str = str(seq_obj.reverse_complement())
    for i in range(len(rc_str)):
        if rule['pam_side'] == '3':
            pam_start = i + rule['guide_len']
            if pam_start + rule['pam_len'] <= len(rc_str):
                pam_seq = rc_str[pam_start:pam_start + rule['pam_len']]
                if rule['pam_pattern'](pam_seq):
                    guide_seq = rc_str[i:i + rule['guide_len']]
                    orig_pos = len(seq_str) - (i + rule['guide_len'])
                    add_candidate('reverse', orig_pos, guide_seq, pam_seq)
        else:
            if i + rule['pam_len'] + rule['guide_len'] <= len(rc_str):
                pam_seq = rc_str[i:i + rule['pam_len']]
                if rule['pam_pattern'](pam_seq):
                    guide_start = i + rule['pam_len']
                    guide_seq = rc_str[guide_start:guide_start + rule['guide_len']]
                    orig_pos = len(seq_str) - (guide_start + rule['guide_len'])
                    add_candidate('reverse', orig_pos, guide_seq, pam_seq)

    return {
        "status": "success",
        "target_length": len(clean_seq_str),
        "candidate_count": len(candidates),
        "candidates": candidates,
    }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)