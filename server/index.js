import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { Queue, Worker } from 'bullmq'; // Added Worker
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { QdrantVectorStore } from '@langchain/qdrant';
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf"; // Added PDFLoader
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import dotenv from 'dotenv';
import { ChatGroq } from "@langchain/groq";

dotenv.config({ path: new URL('./.env', import.meta.url).pathname });

const app = express();
const port = 8000;

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
const connection = { host: 'localhost', port: 6379 };
const queue = new Queue("file-upload-queue", { connection });

// --- HELPER FUNCTION FOR RAG ---
async function performRAG(userQuery) {
  console.log("🔍 Running RAG for query:", userQuery);
  
  // 1. Initialize Embeddings
  const embeddings = new GoogleGenerativeAIEmbeddings({
      model: "models/gemini-embedding-001",
      apiKey: process.env.GOOGLE_API_KEY
  });

  // 2. Connect to Vector Store
  const vectorStore = await QdrantVectorStore.fromExistingCollection(embeddings, {
    url: 'http://localhost:6333',
    collectionName: "langchainjs-testing",
  });

  // 3. Retrieve relevant context
  // Increased k to 3 for slightly more context
  const result = await vectorStore.asRetriever({ k: 3 }).invoke(userQuery);
  const context = result.map(d => d.pageContent).join("\n\n");

  // 4. Generate Answer with LLM
  const llm = new ChatGroq({
    apiKey: process.env.GROQ_API_KEY,
    model: "llama-3.1-8b-instant",
    temperature: 0.1,
  });

  // A slightly more scientific system prompt
  const systemPrompt = `You are an expert bioinformatics assistant. Use the provided scientific context to answer the user's question accurately. If the answer isn't in the context, state that based on available data. Keep answers concise and factual.`;

  const response = await llm.invoke([
    { role: "system", content: systemPrompt },
    { role: "user", content: `Context:\n${context}\n\nQuestion: ${userQuery}` }
  ]);

  return { answer: response.content, docs: result };
}

// Your updated existing chat endpoint
app.get('/chat', async (req, res) => {
  try {
    const userQuery = req.query.message;
    if (!userQuery) return res.status(400).json({ error: "Message required" });
    
    // Use the helper function
    const ragResult = await performRAG(userQuery);
    return res.json(ragResult);
  } catch (error) {
    console.error("RAG Error:", error.message);
    return res.status(500).json({ error: error.message });
  }
});
// app.get('/chat', async (req, res) => {
//   try {
//     const userQuery = req.query.message;
//     if (!userQuery) {
//       return res.status(400).json({ error: "Message parameter is required" });
//     }

//     console.log("Received User Query:", userQuery);
//     const embeddings = new GoogleGenerativeAIEmbeddings({
//             model: "models/gemini-embedding-001", // Or "models/text-embedding-004"
//             apiKey: process.env.GOOGLE_API_KEY
//         });

//     const vectorStore = await QdrantVectorStore.fromExistingCollection(embeddings, {
//       url: 'http://localhost:6333',
//       collectionName: "langchainjs-testing",
//     });
//     // Retrieve top 4 relevant chunks instead of 2 for better context
//     const result = await vectorStore.asRetriever({ k: 2 }).invoke(userQuery);
//     const context = result.map(d => d.pageContent).join("\n\n");

//     const llm = new ChatGroq({
//       apiKey: process.env.GROQ_API_KEY,
//       model: "llama-3.1-8b-instant",
//       temperature: 0.1,
//     });

//     const response = await llm.invoke([
//       { role: "system", content: "Answer strictly based on the provided context. Include citations or references everywhere. Dont answer questions outside the context." },
//       { role: "user", content: `Context:\n${context}\n\nQuestion: ${userQuery}` }
//     ]);

//     return res.json({ answer: response.content, docs: result });
//   } catch (error) {
//     console.error("Groq RAG Error:", error.message);
//     return res.status(500).json({ error: "Server Error", details: error.message });
//   }
// });
// --- NEW: HYBRID CRISPR ANALYSIS ENDPOINT ---
app.post('/api/analyze-crispr', async (req, res) => {
  try {
    const { sequence } = req.body;

    if (!sequence || sequence.length < 23) {
      return res.status(400).json({ error: "Valid DNA sequence required (min 23bp)." });
    }

    console.log("🧬 Starting Hybrid Analysis for sequence length:", sequence.length);

    // --- STEP A: Call Python Bio-Engine (Deterministic Math) ---
    console.log("Calling Python engine on port 8001...");
    let bioData = null;
    try {
        // Native Node.js fetch to call the Python microservice
        const pythonResponse = await fetch("http://127.0.0.1:8001/analyze_sequence", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sequence: sequence }),
        });

        if (!pythonResponse.ok) {
            throw new Error(`Python service error: ${pythonResponse.statusText}`);
        }
        
        bioData = await pythonResponse.json();
        console.log(`✅ Python engine returned ${bioData.candidate_count} candidates.`);

    } catch (pythonError) {
        console.error("❌ Failed to connect to Python engine:", pythonError.message);
        return res.status(503).json({ 
            error: "Bioinformatics engine unavailable. Please ensure the Python service is running on port 8001." 
        });
    }


    // --- STEP B: Perform RAG (AI Insights) ---
    // We formulate a relevant scientific query based on the task.
    // Since we don't have a gene name yet, we ask about general design principles
    // based on whatever specialized PDFs you have uploaded.
    const ragQuery = "Summarize key design considerations for CRISPR-Cas9 gRNAs to maximize on-target activity and minimize off-target effects based on the literature.";
    
    console.log("🧠 Generating AI insights via RAG...");
    const ragResult = await performRAG(ragQuery);


    // --- STEP C: Combine & Return ---
    const finalResponse = {
      // The hard data from Python
      analysis_summary: {
        total_candidates: bioData.candidate_count,
        sequence_length: bioData.target_length
      },
      candidates: bioData.candidates, // The actual list of gRNAs

      // The soft insights from AI
      ai_insights: {
        summary: ragResult.answer,
        sources: ragResult.docs.map(d => d.metadata.source || "Unknown PDF")
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