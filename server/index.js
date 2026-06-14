import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { Queue, Worker } from 'bullmq';

import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import dotenv from 'dotenv';
import {
  QDRANT_URL, QDRANT_COLLECTION,
  REDIS_HOST, REDIS_PORT, BIO_ENGINE_URL, PORT
} from './config.js';
import { performRAG } from './rag.js';
dotenv.config({ path: new URL('./.env', import.meta.url).pathname });

const app = express();
const port = PORT;

app.use(cors());
app.use(express.json());

// --- MULTER SETUP ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});
const upload = multer({ storage });

// --- BULLMQ SETUP ---
const connection = { host: REDIS_HOST, port: REDIS_PORT };
const queue = new Queue("file-upload-queue", { connection });

// --- PDF UPLOAD ENDPOINT ---
// multer saves the file to uploads/, then we enqueue a job for the worker.
app.post('/upload/pdf', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded. Send a PDF in the 'pdf' field." });
    }
    console.log(`📥 Received upload: ${req.file.originalname} -> ${req.file.path}`);
    await queue.add("user-upload", { filePath: req.file.path });
    return res.json({
      message: "File uploaded and queued for processing.",
      filename: req.file.originalname,
    });
  } catch (error) {
    console.error("Upload error:", error.message);
    return res.status(500).json({ error: "Upload failed", details: error.message });
  }
});



// --- HYBRID CRISPR ANALYSIS ENDPOINT ---
app.post('/api/analyze-crispr', async (req, res) => {
  try {
    const { sequence, nuclease } = req.body;

    if (!sequence || sequence.length < 23) {
      return res.status(400).json({ error: "Valid DNA sequence required (min 23bp)." });
    }

    console.log("🧬 Starting Hybrid Analysis for sequence length:", sequence.length);

    // --- STEP A: Call Python Bio-Engine (Deterministic Math) ---
    console.log("Calling Python engine...", nuclease ? `nuclease=${nuclease}` : '');
    let bioData = null;
    try {
      const pythonResponse = await fetch(`${BIO_ENGINE_URL}/analyze_sequence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sequence: sequence, nuclease: nuclease }),
      });

      if (!pythonResponse.ok) {
        // Pass the REAL reason through (e.g. "sequence too short") instead of a generic message.
        let detail = pythonResponse.statusText;
        try {
          const errBody = await pythonResponse.json();
          detail = errBody.detail || detail;
        } catch (_) { /* ignore parse errors */ }
        return res.status(pythonResponse.status).json({ error: `Bio-engine: ${detail}` });
      }

      bioData = await pythonResponse.json();
      console.log(`✅ Python engine returned ${bioData.candidate_count} candidates.`);

    } catch (pythonError) {
      console.error("❌ Failed to connect to Python engine:", pythonError.message);
      return res.status(503).json({
        error: "Bioinformatics engine unavailable. Please ensure the Python service is running."
      });
    }

    // --- STEP B: Perform RAG (AI Insights), grounded in THIS analysis ---
    const candidates = bioData.candidates || [];
    const gcValues = candidates.map(c => c.gc_content).filter(v => typeof v === 'number');
    const gcMin = gcValues.length ? Math.min(...gcValues).toFixed(0) : 'n/a';
    const gcMax = gcValues.length ? Math.max(...gcValues).toFixed(0) : 'n/a';
    const topGuides = candidates.slice(0, 3).map(c => c.guide_sequence).join(', ') || 'none';

    const ragQuery =
      `A user submitted a ${bioData.target_length}bp DNA sequence for ${nuclease || 'SpCas9'}. ` +
      `The engine found ${bioData.candidate_count} candidate gRNAs with GC content ranging ${gcMin}%–${gcMax}%. ` +
      `Example guides: ${topGuides}. ` +
      `Based on the literature, what should the user consider when choosing among these candidates ` +
      `to maximize on-target activity and minimize off-target effects for ${nuclease || 'SpCas9'}?`;

    console.log("🧠 Generating AI insights via RAG (sequence-aware)...");
    const ragResult = await performRAG(ragQuery, nuclease);

    // --- STEP C: Combine & Return ---
    const finalResponse = {
      analysis_summary: {
        total_candidates: bioData.candidate_count,
        sequence_length: bioData.target_length
      },
      candidates: bioData.candidates,
      ai_insights: {
        summary: ragResult.answer,
        sources: [...new Set(
          ragResult.docs.map(d => {
            const src = d.metadata?.source || "Unknown PDF";
            const file = src.split('/').pop();        // drop path
            return file.replace(/^\d+-\d+-/, '');     // drop multer "timestamp-rand-" prefix
          })
        )]
      }
    };

    console.log("🚀 Sending full hybrid response to client.");
    return res.json(finalResponse);

  } catch (error) {
    console.error("Hybrid Analysis Error:", error.message);
    return res.status(500).json({ error: "Analysis failed", details: error.message });
  }
});

app.listen(port, () => console.log(`Server running on http://localhost:${port}`));