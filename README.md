# 🧬 Intelligent CRISPR gRNA Designer

A full-stack bioinformatics tool that designs CRISPR guide RNAs (gRNAs) and explains its
reasoning using a **Retrieval-Augmented Generation (RAG)** pipeline grounded in real research
literature.

The system pairs two complementary "brains":

- A **deterministic Python engine** that scans DNA for valid gRNA target sites (exact, rule-based — no AI).
- A **generative RAG layer** that retrieves relevant passages from CRISPR research papers and uses an LLM to produce grounded, literature-backed design insights.

---

## ✨ Features

- **gRNA candidate generation** for multiple nucleases (SpCas9, SaCas9, Cas12a, xCas9), each with its own PAM rules.
- **Transparent scoring** — exact GC content, plus heuristic on-target efficiency and off-target safety proxies (clearly labeled as heuristics).
- **Sequence-aware RAG insights** — the generative layer reasons about the *actual* candidates found, not generic advice.
- **Local sentence embeddings** (`all-MiniLM-L6-v2` via Transformers.js) — no external embedding API, no rate limits, fully offline.
- **Async ingestion pipeline** — PDFs are chunked, embedded, and stored in a vector database via a background job queue.
- **Role separation** — a public client tool (paste a sequence, get guides) and an authenticated maintainer console (upload research papers to the knowledge base).
- **Evaluation harness** — retrieval `recall@k`, plus LLM-as-a-judge faithfulness and relevance scoring.
- **Unit-tested** deterministic engine (pytest).

---

## 🏗️ Architecture

The app runs as five coordinated services:

| Service     | Tech                                   | Port | Responsibility                              |
|-------------|----------------------------------------|------|---------------------------------------------|
| **client**  | Next.js / React / TypeScript / Clerk   | 3000 | UI — public dashboard + maintainer admin    |
| **server**  | Node / Express                         | 8000 | Orchestrator + RAG core                     |
| **bio-engine** | Python / FastAPI / Biopython        | 8001 | Deterministic gRNA finder + scoring         |
| **qdrant**  | Qdrant (vector database)               | 6333 | Stores paper embeddings (persistent volume) |
| **valkey**  | Valkey (Redis-compatible)              | 6379 | BullMQ job queue backing store              |

### Two pipelines

**Ingestion (offline, async):**
```
PDF → chunk (RecursiveCharacterTextSplitter) → embed (local MiniLM) → store in Qdrant
```
Triggered via the maintainer admin page; processed by a background BullMQ worker.

**Query (per request):**
```
DNA sequence
   ├─→ bio-engine: find gRNA candidates + scores      (deterministic)
   └─→ RAG: embed query → retrieve top-k chunks → LLM (Groq, Llama 3.1) answers from context
        → combined response returned to the client
```

---

## 🛠️ Tech Stack

- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS, shadcn/ui, Clerk (auth)
- **Backend:** Node.js, Express, LangChain.js, BullMQ
- **Bio-engine:** Python, FastAPI, Biopython, pytest
- **AI:** local Transformers.js embeddings (`all-MiniLM-L6-v2`, 384-dim), Groq-hosted Llama 3.1 8B
- **Data:** Qdrant (vector DB), Valkey/Redis (queue)
- **Infra:** Docker Compose

---

## 🚀 Getting Started

### Prerequisites
- Node.js 20+ and `pnpm`
- Python 3.12+
- Docker

### 1. Clone and configure environment

```bash
git clone https://github.com/rashyy17/Intelligent-CRISPR-Designer.git
cd Intelligent-CRISPR-Designer
```

Create `server/.env` (see `server/.env.example`):

```env
GROQ_API_KEY=your_groq_key
GOOGLE_API_KEY=your_google_key   # only if using the Gemini embedding option
```

Configure Clerk keys in `client/.env` (see Clerk docs).

### 2. Install dependencies

```bash
# server
cd server && pnpm install && cd ..

# client
cd client && pnpm install && cd ..

# bio-engine
cd bio-engine && python -m venv venv && source venv/bin/activate && pip install -r requirements.txt && cd ..
```

### 3. Run everything with one command

```bash
chmod +x start.sh
./start.sh
```

This starts the Docker infra (Qdrant + Valkey), the Python engine, the Express server, the
ingestion worker, and the Next.js frontend. **Ctrl+C** stops all of them.

Then open **http://localhost:3000**.

### 4. Populate the knowledge base

Sign in and visit **/admin** to upload CRISPR research papers (PDFs). They're chunked,
embedded, and stored in Qdrant by the background worker.

---

## 🧪 Testing & Evaluation

**Bio-engine unit tests** (correctness of the deterministic engine):
```bash
cd bio-engine && source venv/bin/activate && pytest -v
```

**Retrieval evaluation** (`recall@k`):
```bash
cd server && node eval-retrieval.js
```

**LLM-as-a-judge evaluation** (answer faithfulness + relevance):
```bash
cd server && node eval-judge.js
```

---

## ⚠️ Known Limitations

This is a portfolio / learning project, and a few things are honestly scoped as such:

- **Scoring is heuristic.** GC content is exact, but on-target efficiency and off-target
  safety are transparent proxies (GC-band and sequence-complexity), not trained models like
  Doench Rule Set 2 or CFD/MIT specificity scores. Real off-target scoring would require
  genome-wide alignment.
- **Established tools** (CRISPOR, CHOPCHOP, Benchling) are more scientifically validated;
  this project's differentiator is the integrated RAG explanation layer and the full-stack
  architecture, not clinical accuracy.
- **API hardening** is incomplete — Clerk protects the frontend; the backend API is open.
- **Evaluation sets are small** (proof-of-concept), and the LLM judge shares a model family
  with the system it grades.

---

## 📈 Future Work

- Real on-target (Doench) and off-target (CFD / genome alignment) scoring.
- Guide-location visualization track.
- Candidate sorting/filtering UI.
- FASTA upload and gene-name lookup for sequence-specific RAG context.
- Full containerization (`docker compose up` for all services) and cloud deployment.

---

## 📄 License

MIT (or your choice).