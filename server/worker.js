import { Worker } from 'bullmq';
import { QdrantClient } from "@qdrant/js-client-rest";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai"; 
import { QdrantVectorStore } from '@langchain/qdrant';
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf"


const worker = new Worker('file-upload-queue', async (job) => {

    // console.log('Job:', job.data);
    const data = JSON.parse(job.data);
    // Process the file here

    //1. Load PDF
    const loader = new PDFLoader(data.filePath);
    const docs = await loader.load();
    // const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 300, chunkOverlap: 0 })
    // const texts = splitter.createDocuments([{ pageContent: "..." }])
    
    //2. Split into chunks


    //3. Create embeddings
    const embeddings = new GoogleGenerativeAIEmbeddings({
    model: "text-embedding-004",
    apiKey: "AIzaSyCTzdu7rtKN-qzcbPBA9W8uRJzMdusR5SM",
    });
    const vectorStore = await QdrantVectorStore.fromExistingCollection(embeddings, {
    url: 'http://localhost:6333',
    collectionName: "langchainjs-testing",
    });
    await vectorStore.addDocuments(docs);




    const client=new QdrantClient({url: "http://localhost:6333"});
    
    console.log('all docs added to vs');
    //4. Store in Qdrant
  
}, { concurrency: 100, connection: {
    host: 'localhost',
    port: 6379
  } });