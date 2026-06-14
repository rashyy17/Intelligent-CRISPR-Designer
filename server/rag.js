// server/rag.js — the reusable RAG core: retrieve context + generate a grounded answer.
// Imported by both index.js (the app) and eval-judge.js (the evaluation harness),
// so the RAG logic lives in exactly one place.
import { QdrantVectorStore } from '@langchain/qdrant';
import { ChatGroq } from "@langchain/groq";
import { getEmbeddings } from './embeddings.js';
import { QDRANT_URL, QDRANT_COLLECTION } from './config.js';

export async function performRAG(userQuery, nuclease = 'SpCas9') {
  console.log("🔍 Running RAG for query:", userQuery, "nuclease:", nuclease);

  const embeddings = getEmbeddings();

  // Connecting to a non-existent collection throws — handle it gracefully
  // so an empty knowledge base doesn't kill the whole analysis request.
  let result = [];
  try {
    const vectorStore = await QdrantVectorStore.fromExistingCollection(embeddings, {
      url: QDRANT_URL,
      collectionName: QDRANT_COLLECTION,
    });
    result = await vectorStore.asRetriever({ k: 5 }).invoke(userQuery);
  } catch (err) {
    console.warn("⚠️ RAG retrieval skipped (knowledge base may be empty):", err.message);
    return {
      answer: "No research papers are available in the knowledge base yet, so AI insights are unavailable. A maintainer can add papers via the admin page.",
      docs: []
    };
  }

  const context = result.map(d => d.pageContent).join("\n\n");

  const llm = new ChatGroq({
    apiKey: process.env.GROQ_API_KEY,
    model: "llama-3.1-8b-instant",
    temperature: 0.1,
  });

  const systemPrompt = `You are an expert bioinformatics assistant. Use the provided scientific context to answer accurately. Tailor gRNA design recommendations to the specified nuclease (${nuclease}). If the answer isn't in the context, say so based on available data. Keep answers concise and factual.

FORMATTING RULES (important):
- Write in plain prose. Do NOT use Markdown.
- Do NOT use asterisks, hashes, backticks, or bullet symbols.
- Write as short, clear paragraphs in complete sentences.`;
  const response = await llm.invoke([
    { role: "system", content: systemPrompt },
    { role: "user", content: `Nuclease: ${nuclease}\nContext:\n${context}\n\nQuestion: ${userQuery}` }
  ]);

  return { answer: response.content, docs: result };
}