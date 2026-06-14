import 'dotenv/config';
import { Worker } from 'bullmq';
import { QdrantClient } from "@qdrant/js-client-rest";
import { QdrantVectorStore } from '@langchain/qdrant';
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { getEmbeddings } from './embeddings.js';
import { QDRANT_URL, QDRANT_COLLECTION, REDIS_HOST, REDIS_PORT } from './config.js';

const worker = new Worker('file-upload-queue', async (job) => {
  try {
    console.log(`\n--- STARTING JOB ${job.id} ---`);

    let data = job.data;
    if (typeof job.data === 'string') data = JSON.parse(job.data);
    console.log(`📂 Processing: ${data.filePath}`);

    // LOAD & CHUNK
    const loader = new PDFLoader(data.filePath);
    const docs = await loader.load();
    const textSplitter = new RecursiveCharacterTextSplitter({ chunkSize: 500, chunkOverlap: 50 });
    const texts = await textSplitter.splitDocuments(docs);
    console.log(`✅ Text Splitting: Generated ${texts.length} chunks.`);

    // LOCAL EMBEDDINGS — no API, no quota
    const embeddings = getEmbeddings();
    const sampleVector = await embeddings.embedQuery("Test");
    const vectorSize = sampleVector.length;
    console.log(`📏 Model Output Size: ${vectorSize} dimensions`);

    // ENSURE QDRANT COLLECTION MATCHES DIMENSION
    const client = new QdrantClient({ url: QDRANT_URL });
    const COLLECTION_NAME = QDRANT_COLLECTION;

    const collections = await client.getCollections();
    const collectionExists = collections.collections.some(c => c.name === COLLECTION_NAME);
    if (collectionExists) {
      const info = await client.getCollection(COLLECTION_NAME);
      const currentSize = info.config.params.vectors.size;
      if (currentSize !== vectorSize) {
        console.log(`⚠️ Dimension Mismatch! Qdrant: ${currentSize} vs Model: ${vectorSize}`);
        console.log(`🗑️ Deleting incompatible collection '${COLLECTION_NAME}'...`);
        await client.deleteCollection(COLLECTION_NAME);
      }
    }
    const collectionsAfter = await client.getCollections();
    const existsNow = collectionsAfter.collections.some(c => c.name === COLLECTION_NAME);
    if (!existsNow) {
      console.log(`🔨 Creating new collection for size ${vectorSize}...`);
      await client.createCollection(COLLECTION_NAME, { vectors: { size: vectorSize, distance: 'Cosine' } });
    }

    // STORE — local embeddings have no rate limit, so the simple path works again
    const vectorStore = await QdrantVectorStore.fromExistingCollection(embeddings, {
      url: QDRANT_URL,
      collectionName: COLLECTION_NAME,
    });
    console.log(`📤 Embedding & uploading ${texts.length} chunks...`);
    await vectorStore.addDocuments(texts);
    console.log("✅ SUCCESS: Data stored in Qdrant!");

  } catch (error) {
    console.error("\n🔴 JOB FAILED:");
    console.error(error.message);
    throw error;
  }
}, {
  concurrency: 1,
  connection: { host: REDIS_HOST, port: REDIS_PORT }
});