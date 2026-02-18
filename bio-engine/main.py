# bio-engine/main.py
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from Bio.Seq import Seq
import uvicorn

app = FastAPI()

class DNARequest(BaseModel):
    sequence: str
    # In the future, you can add parameters like 'pam_type' here

@app.post("/analyze_sequence")
async def analyze_sequence(request: DNARequest):
    """
    Deterministically finds SpCas9 (NGG) targets in a DNA sequence.
    """
    raw_seq = request.sequence.upper().strip()

    # Basic validation
    allowed_bases = set("ATCGN\n\r ")
    if not set(raw_seq).issubset(allowed_bases):
         raise HTTPException(status_code=400, detail="Invalid DNA sequence. Non-standard bases detected.")

    clean_seq_str = "".join(raw_seq.split()) # Remove newlines/spaces
    if len(clean_seq_str) < 23:
         raise HTTPException(status_code=400, detail="Sequence too short to find targets.")

    seq_obj = Seq(clean_seq_str)
    candidates = []

    # --- The Hard Science: Scanning for NGG PAMs ---
    # We need 23 bases: 20bp guide + NGG PAM
    # Scan forward strand
    for i in range(len(seq_obj) - 2):
        if seq_obj[i+1:i+3] == "GG":
            # PAM is at seq_obj[i:i+3] (NGG)
            # Guide is the 20bp before it: seq_obj[i-20:i]
            if i >= 20:
                guide = str(seq_obj[i-20:i])
                pam = str(seq_obj[i:i+3])
                candidates.append({
                    "strand": "forward",
                    "position": i - 20 + 1, # 1-based indexing for humans
                    "guide_sequence": guide,
                    "pam": pam,
                    # Placeholder scores - you will implement CFD/MIT scoring algorithms later
                    "on_target_score_placeholder": 95.5, 
                })

    # In a real app, you must also scan the reverse complement sequence.

    return {
        "status": "success",
        "target_length": len(clean_seq_str),
        "candidate_count": len(candidates),
        "candidates": candidates
    }

if __name__ == "__main__":
    # This allows running directly with "python main.py"
    uvicorn.run(app, host="0.0.0.0", port=8001)