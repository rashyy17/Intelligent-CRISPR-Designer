// server/embeddings.js — local, offline sentence embeddings.
// Wraps a Transformers.js model in LangChain's Embeddings interface so it
// plugs into QdrantVectorStore on both the write (worker) and read (index) sides.
// No API key, no quota, no rate limit.
import { Embeddings } from "@langchain/core/embeddings";

const MODEL_NAME = "Xenova/all-MiniLM-L6-v2"; // 384-dim sentence embeddings

class LocalEmbeddings extends Embeddings {
  constructor() {
    super({});
    this._extractor = null;
  }

  async _getExtractor() {
    if (!this._extractor) {
      const { pipeline } = await import("@huggingface/transformers");
      console.log("⏳ Loading local embedding model (first run downloads ~90MB)...");
      this._extractor = await pipeline("feature-extraction", MODEL_NAME);
      console.log("✅ Local embedding model ready.");
    }
    return this._extractor;
  }

  async embedDocuments(texts) {
    const extractor = await this._getExtractor();
    // mean pooling + L2 normalize = standard sentence-embedding recipe
    const output = await extractor(texts, { pooling: "mean", normalize: true });
    return output.tolist(); // -> number[][]
  }

  async embedQuery(text) {
    const [vector] = await this.embedDocuments([text]);
    return vector;
  }
}

let _instance = null;
export function getEmbeddings() {
  if (!_instance) _instance = new LocalEmbeddings();
  return _instance;
}