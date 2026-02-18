# CRISPR gRNA Designer - Professional Dashboard

## Overview

A professional-grade bioinformatics tool for designing CRISPR guide RNAs with AI-powered RAG (Retrieval-Augmented Generation) insights. Built with Next.js, Tailwind CSS, and Shadcn UI.

## Features

### 🧬 Sequence Analysis
- **DNA Sequence Input**: Monospaced textarea for raw DNA sequence input
- **Clean Sequence Utility**: Automatically removes non-ATCG characters and whitespace
- **Nuclease Selection**: Support for multiple Cas variants (SpCas9, SaCas9, Cas12a, xCas9)
- **Real-time Validation**: Shows sequence length and validates input

### 🎯 gRNA Candidate Generation
- **Multi-stage Analysis**: 
  - Stage 1: Deterministic bio-algorithm execution
  - Stage 2: RAG knowledge base querying
- **Comprehensive Scoring**:
  - GC Content analysis
  - Off-target score calculation
  - Efficiency prediction
- **Visual PAM Highlighting**: PAM sites highlighted in bold red for easy identification

### 📊 Results Dashboard

#### Summary Ribbon
Three key metrics displayed prominently:
- **Candidates Found**: Total number of viable gRNA candidates
- **Sequence Length**: Input sequence size in base pairs
- **Safety Score**: Overall safety rating (0-100%)

#### Data Table
- Ranked list of gRNA candidates
- Color-coded DNA bases:
  - **Adenine (A)**: Green
  - **Thymine (T)**: Red
  - **Cytosine (C)**: Blue
  - **Guanine (G)**: Yellow
- PAM site highlighting in bold red
- One-click copy to clipboard
- Detailed metrics per candidate

### 🤖 RAG-Augmented Insights
Dedicated sidebar featuring:
- **AI Summary**: Context-aware analysis from research papers
- **Recommendations**: Actionable suggestions for optimization
- **Source Citations**: List of PDF documents used for insights

### 📥 Export Functionality
Export analysis results as JSON with:
- Input sequence
- Selected nuclease
- All candidates with scores
- Safety metrics
- Timestamp

## Design Philosophy

### Laboratory Instrument Aesthetic
- **Clean & Minimalist**: Uncluttered interface focusing on data
- **High Contrast**: Clear visual hierarchy with slate color palette
- **Precision Typography**: Monospaced fonts for sequences, Inter for UI
- **Glassmorphism**: Subtle backdrop blur effects on cards

### Color Palette
- **Primary Actions**: Indigo-600
- **Background**: Slate gradient (50-200)
- **DNA Bases**: 
  - A: Green-600
  - T: Red-600
  - C: Blue-600
  - G: Yellow-600
- **PAM Sites**: Bold Red-600
- **Success States**: Green
- **Warnings**: Amber
- **Info**: Purple

### Responsive Design
- Mobile-first approach
- Grid layouts that adapt to screen size
- Sticky sidebar on desktop
- Touch-friendly buttons and controls

## Component Architecture

```
app/
├── page.tsx                          # Main entry point
├── components/
│   └── crispr-designer.tsx          # Main dashboard component
└── components/ui/                    # Shadcn UI components
    ├── button.tsx
    ├── card.tsx
    ├── badge.tsx
    ├── select.tsx
    └── textarea.tsx
```

## Usage

### 1. Input DNA Sequence
```
ATCGATCGATCGATCGATCGATCG...
```

### 2. Select Nuclease
Choose from:
- SpCas9 (NGG PAM) - Default
- SaCas9 (NNGRRT PAM)
- Cas12a (TTTV PAM)
- xCas9 (NG PAM)

### 3. Analyze
Click "Analyze Sequence" to:
1. Execute bio-algorithms
2. Query RAG knowledge base
3. Generate ranked candidates
4. Display AI insights

### 4. Review Results
- Check summary metrics
- Review candidate rankings
- Read RAG insights and recommendations
- Copy sequences to clipboard
- Export results for documentation

## Integration with Backend

The dashboard is designed to integrate with your existing RAG backend:

### Expected Endpoints

#### 1. gRNA Generation (Future)
```typescript
POST /api/grna/generate
Body: {
  sequence: string,
  nuclease: string
}
Response: {
  candidates: GRNACandidate[],
  safetyScore: number
}
```

#### 2. RAG Insights
```typescript
GET /chat?q={query}
Response: {
  answer: string,
  sources: string[]
}
```

### Current Implementation
Currently uses mock data for demonstration. Replace the mock functions in `crispr-designer.tsx` with actual API calls:

```typescript
// Replace this
const mockCandidates = generateMockCandidates();

// With this
const response = await fetch('/api/grna/generate', {
  method: 'POST',
  body: JSON.stringify({ sequence, nuclease })
});
const { candidates } = await response.json();
```

## Key Features Implemented

✅ Monospaced sequence input with validation  
✅ Multi-nuclease support via dropdown  
✅ Two-stage analysis with loading states  
✅ Summary ribbon with key metrics  
✅ Color-coded DNA base visualization  
✅ PAM site highlighting  
✅ Copy to clipboard functionality  
✅ RAG insights sidebar  
✅ Source citation display  
✅ Export to JSON  
✅ Responsive grid layouts  
✅ Glassmorphism effects  
✅ Dark mode support  
✅ Professional SaaS-like UI  

## Next Steps

1. **Backend Integration**: Connect to actual bio-algorithm API
2. **Real RAG Query**: Integrate with existing `/chat` endpoint
3. **File Upload**: Add PDF upload for knowledge base
4. **Advanced Filtering**: Add filters for GC content, efficiency thresholds
5. **Visualization**: Add charts for score distributions
6. **Batch Processing**: Support multiple sequences
7. **Export Formats**: Add CSV, FASTA export options

## Technologies

- **Framework**: Next.js 15+ with App Router
- **Styling**: Tailwind CSS v4
- **UI Components**: Shadcn UI
- **Icons**: Lucide React
- **Typography**: Inter (UI), ui-monospace (sequences)
- **Type Safety**: TypeScript

## Development

```bash
# Start development server
cd client
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start
```

Visit `http://localhost:3000` to see the dashboard.

---

Built with precision for bioinformatics research 🧬
