# Backend Integration Guide

## Connecting CRISPR Dashboard to RAG Backend

This guide shows how to integrate the CRISPR gRNA Designer frontend with your existing Express.js + RAG backend.

## Current Backend Endpoints

### 1. PDF Upload
```javascript
POST http://localhost:8000/upload/pdf
Content-Type: multipart/form-data

Body: FormData with 'pdf' field
```

### 2. RAG Chat Query
```javascript
GET http://localhost:8000/chat?q={query}

Response: {
  answer: string,
  sources?: string[]
}
```

## Frontend Integration Steps

### Step 1: Replace Mock gRNA Generation

In `client/app/components/crispr-designer.tsx`, find the `handleAnalyze` function and replace the mock candidate generation:

```typescript
// CURRENT (lines 70-80):
const mockCandidates: GRNACandidate[] = Array.from({ length: 8 }, (_, i) => ({
  id: `grna-${i + 1}`,
  guideSequence: generateMockGuideSequence(),
  pamSite: 'NGG',
  position: 120 + i * 50,
  gcContent: 45 + Math.random() * 15,
  offTargetScore: 0.85 + Math.random() * 0.14,
  efficiency: 0.75 + Math.random() * 0.24,
}));

// REPLACE WITH:
const response = await fetch('http://localhost:8000/api/grna/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sequence: sequence.replace(/[^ATCG]/gi, ''),
    nuclease: nuclease
  })
});

const { candidates: generatedCandidates } = await response.json();
const mockCandidates = generatedCandidates;
```

### Step 2: Replace Mock RAG Insights

Replace the mock RAG insights call (lines 86-100):

```typescript
// CURRENT:
const mockInsights: RAGInsight = {
  summary: '...',
  sources: [...],
  recommendations: [...]
};

// REPLACE WITH:
const ragQuery = `What are the best practices for ${nuclease} gRNA design? ` +
  `Consider GC content, PAM site specificity, and off-target effects.`;

const ragResponse = await fetch(
  `http://localhost:8000/chat?q=${encodeURIComponent(ragQuery)}`
);

const ragData = await ragResponse.json();

const mockInsights: RAGInsight = {
  summary: ragData.answer || 'No insights available.',
  sources: ragData.sources || [],
  recommendations: extractRecommendations(ragData.answer) // Helper function
};
```

### Step 3: Add Helper Function for Recommendations

Add this helper function to extract recommendations from RAG response:

```typescript
const extractRecommendations = (text: string): string[] => {
  // Simple extraction - split by bullet points or numbered lists
  const lines = text.split('\n')
    .filter(line => line.match(/^[\d\-\*•]/) || line.toLowerCase().includes('recommend'))
    .map(line => line.replace(/^[\d\-\*•]\s*/, '').trim())
    .filter(line => line.length > 10);
  
  return lines.length > 0 ? lines.slice(0, 5) : [
    'Review generated candidates carefully',
    'Validate sequences experimentally',
    'Consider chromatin accessibility at target sites'
  ];
};
```

## Backend Modifications Needed

### Option 1: Add gRNA Generation Endpoint (Recommended)

Create a new endpoint in `server/index.js`:

```javascript
import { generateGRNACandidates } from './bio-algorithms.js'; // Your algorithm

app.post('/api/grna/generate', async (req, res) => {
  try {
    const { sequence, nuclease } = req.body;
    
    // Validate input
    if (!sequence || sequence.length < 20) {
      return res.status(400).json({ error: 'Invalid sequence' });
    }
    
    // Generate candidates using your algorithm
    const candidates = await generateGRNACandidates(sequence, nuclease);
    
    // Calculate safety score
    const safetyScore = calculateSafetyScore(candidates);
    
    res.json({
      candidates,
      safetyScore,
      sequenceLength: sequence.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('gRNA generation error:', error);
    res.status(500).json({ error: 'Analysis failed' });
  }
});
```

### Option 2: Use Bio-Engine Python Service

If you prefer to use the existing `bio-engine/main.py`, create a proxy endpoint:

```javascript
app.post('/api/grna/generate', async (req, res) => {
  try {
    const { sequence, nuclease } = req.body;
    
    // Call Python bio-engine
    const pythonResponse = await fetch('http://localhost:5000/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sequence, nuclease })
    });
    
    const results = await pythonResponse.json();
    res.json(results);
    
  } catch (error) {
    console.error('Bio-engine error:', error);
    res.status(500).json({ error: 'Analysis failed' });
  }
});
```

## Python Bio-Engine Implementation

Update `bio-engine/main.py`:

```python
from flask import Flask, request, jsonify
from flask_cors import CORS
import re

app = Flask(__name__)
CORS(app)

def find_pam_sites(sequence, pam_pattern='GG'):
    """Find all PAM sites in sequence"""
    sites = []
    for i in range(len(sequence) - len(pam_pattern)):
        if sequence[i:i+len(pam_pattern)] == pam_pattern:
            sites.append(i)
    return sites

def calculate_gc_content(seq):
    """Calculate GC content percentage"""
    gc_count = seq.count('G') + seq.count('C')
    return (gc_count / len(seq)) * 100 if seq else 0

def generate_grna_candidates(sequence, nuclease='SpCas9'):
    """Generate gRNA candidates"""
    sequence = sequence.upper()
    
    # PAM patterns for different nucleases
    pam_patterns = {
        'SpCas9': 'GG',
        'SaCas9': 'NNGRRT',  # Simplified
        'Cas12a': 'TTTV',    # Simplified
        'xCas9': 'NG'
    }
    
    pam = pam_patterns.get(nuclease, 'GG')
    pam_sites = find_pam_sites(sequence, pam[:2])  # Simplified search
    
    candidates = []
    
    for i, pam_pos in enumerate(pam_sites[:20]):  # Limit to 20 candidates
        # Extract 20bp guide sequence before PAM
        if pam_pos >= 20:
            guide_seq = sequence[pam_pos-20:pam_pos]
            
            candidates.append({
                'id': f'grna-{i+1}',
                'guideSequence': guide_seq,
                'pamSite': pam,
                'position': pam_pos,
                'gcContent': calculate_gc_content(guide_seq),
                'offTargetScore': 0.85 + (hash(guide_seq) % 15) / 100,  # Mock score
                'efficiency': 0.75 + (hash(guide_seq[:10]) % 25) / 100  # Mock score
            })
    
    # Sort by efficiency
    candidates.sort(key=lambda x: x['efficiency'], reverse=True)
    
    return candidates

@app.route('/analyze', methods=['POST'])
def analyze():
    data = request.json
    sequence = data.get('sequence', '')
    nuclease = data.get('nuclease', 'SpCas9')
    
    if not sequence or len(sequence) < 20:
        return jsonify({'error': 'Invalid sequence'}), 400
    
    candidates = generate_grna_candidates(sequence, nuclease)
    
    # Calculate safety score
    if candidates:
        avg_off_target = sum(c['offTargetScore'] for c in candidates) / len(candidates)
        safety_score = int(avg_off_target * 100)
    else:
        safety_score = 0
    
    return jsonify({
        'candidates': candidates,
        'safetyScore': safety_score,
        'sequenceLength': len(sequence)
    })

if __name__ == '__main__':
    app.run(port=5000, debug=True)
```

## Testing the Integration

### 1. Start all services:

```bash
# Terminal 1: Start Redis/Valkey
cd /Users/rashi/Desktop/pdf-rag
docker compose up -d

# Terminal 2: Start Express backend
cd server
pnpm dev

# Terminal 3: Start Python bio-engine (if using)
cd bio-engine
python main.py

# Terminal 4: Start Next.js frontend
cd client
pnpm dev
```

### 2. Test the flow:

1. Visit http://localhost:3000
2. Upload PDFs via the backend (use existing upload endpoint)
3. Paste a DNA sequence in the dashboard
4. Click "Analyze Sequence"
5. View gRNA candidates and RAG insights

### 3. Verify backend calls:

```bash
# Test gRNA generation
curl -X POST http://localhost:8000/api/grna/generate \
  -H "Content-Type: application/json" \
  -d '{"sequence":"ATCGATCGATCGATCGATCGATCGATCGATCGATCG","nuclease":"SpCas9"}'

# Test RAG query
curl "http://localhost:8000/chat?q=What+are+best+practices+for+CRISPR+gRNA+design"
```

## Environment Variables

Add to `server/.env`:

```env
# Existing variables
GROQ_API_KEY=your_groq_key_here
QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION=crispr_papers

# New variables
BIO_ENGINE_URL=http://localhost:5000
GRNA_MIN_LENGTH=20
GRNA_MAX_CANDIDATES=20
```

## Next Steps

1. ✅ Implement actual bio-algorithms for gRNA scoring
2. ✅ Add real off-target prediction using BLAST or similar
3. ✅ Integrate chromatin accessibility data
4. ✅ Add batch processing for multiple sequences
5. ✅ Implement user authentication for saving analyses
6. ✅ Add visualization charts for score distributions

## Additional Features to Consider

### Real-time Validation
Add real-time sequence validation as user types:

```typescript
useEffect(() => {
  const cleaned = sequence.replace(/[^ATCG]/gi, '');
  const isValid = cleaned.length >= 20;
  setIsValidSequence(isValid);
}, [sequence]);
```

### Sequence File Upload
Allow uploading FASTA files:

```typescript
const handleFastaUpload = async (file: File) => {
  const text = await file.text();
  const sequences = parseFasta(text);
  setSequence(sequences[0]); // Use first sequence
};
```

### Advanced Filtering
Add UI controls for filtering candidates:

```typescript
const [filters, setFilters] = useState({
  minGC: 40,
  maxGC: 60,
  minOffTarget: 0.85,
  minEfficiency: 0.75
});
```

---

This integration guide should help you connect the professional CRISPR dashboard to your existing RAG backend. The mock data can be gradually replaced with real bio-algorithm results as you develop the backend services.
