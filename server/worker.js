import 'dotenv/config'; 
import { Worker } from 'bullmq';
import { QdrantClient } from "@qdrant/js-client-rest"; // Required for admin tasks
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai"; 
import { QdrantVectorStore } from '@langchain/qdrant';
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";

const worker = new Worker('file-upload-queue', async (job) => {
    try {
        console.log(`\n--- STARTING JOB ${job.id} ---`);

        // 1. DATA CHECK
        let data = job.data;
        if (typeof job.data === 'string') data = JSON.parse(job.data);
        console.log(`📂 Processing: ${data.filePath}`);

        // 2. LOAD & CHUNK
        const loader = new PDFLoader(data.filePath);
        const docs = await loader.load();
        
        const textSplitter = new RecursiveCharacterTextSplitter({ 
            chunkSize: 500, 
            chunkOverlap: 50 
        });
        const texts = await textSplitter.splitDocuments(docs);
        console.log(`✅ Text Splitting: Generated ${texts.length} chunks.`);

        // 3. GENERATE PROBE EMBEDDING
        // We need to know the ACTUAL size this model outputs (768 or 3072?)
        console.log("🔄 Initializing Embeddings...");
        const embeddings = new GoogleGenerativeAIEmbeddings({
            model: "models/gemini-embedding-001", // Or "models/text-embedding-004"
            apiKey: process.env.GOOGLE_API_KEY
        });

        // Generate one real embedding to check its size
        const sampleVector = await embeddings.embedQuery("Test");
        const vectorSize = sampleVector.length;
        console.log(`📏 Model Output Size: ${vectorSize} dimensions`);

        // 4. FIX QDRANT COLLECTION
        const client = new QdrantClient({ url: "http://localhost:6333" });
        const COLLECTION_NAME = "langchainjs-testing";
        
        // Check if collection exists
        const collections = await client.getCollections();
        const collectionExists = collections.collections.some(c => c.name === COLLECTION_NAME);

        if (collectionExists) {
            const info = await client.getCollection(COLLECTION_NAME);
            const currentSize = info.config.params.vectors.size;

            // IF SIZES DON'T MATCH, DELETE THE OLD COLLECTION
            if (currentSize !== vectorSize) {
                console.log(`⚠️ Dimension Mismatch! Qdrant: ${currentSize} vs Model: ${vectorSize}`);
                console.log(`🗑️ Deleting incompatible collection '${COLLECTION_NAME}'...`);
                await client.deleteCollection(COLLECTION_NAME);
            }
        }

        // Create fresh if needed (or if we just deleted it)
        const collectionsAfter = await client.getCollections();
        const existsNow = collectionsAfter.collections.some(c => c.name === COLLECTION_NAME);

        if (!existsNow) {
            console.log(`🔨 Creating new collection for size ${vectorSize}...`);
            await client.createCollection(COLLECTION_NAME, {
                vectors: {
                    size: vectorSize, // Uses the detected size (3072)
                    distance: 'Cosine',
                },
            });
        }

        // 5. STORE DATA
        const vectorStore = await QdrantVectorStore.fromExistingCollection(embeddings, {
            url: 'http://localhost:6333',
            collectionName: COLLECTION_NAME,
        });

        console.log(`📤 Uploading ${texts.length} chunks...`);
        await vectorStore.addDocuments(texts);
        
        console.log("✅ SUCCESS: Data stored in Qdrant!");

    } catch (error) {
        console.error("\n🔴 JOB FAILED:");
        console.error(error.message); 
        // console.error(error); // Uncomment for full stack trace
        throw error;
    }
}, { 
    concurrency: 1, 
    connection: { host: 'localhost', port: 6379 } 
});