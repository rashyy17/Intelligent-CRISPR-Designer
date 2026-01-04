import express from 'express'; 
import cors from 'cors'; 
import multer from 'multer'; 
import { Queue } from 'bullmq'; 
import { GoogleGenerativeAIEmbeddings, ChatGoogleGenerativeAI } from "@langchain/google-genai"; 
import { QdrantVectorStore } from '@langchain/qdrant'; 
import dotenv from 'dotenv';
import { ChatGroq } from "@langchain/groq";
// Load .env located next to this file (works regardless of current working directory)
dotenv.config({ path: new URL('./.env', import.meta.url).pathname });

const app = express(); 
const port = 8000; 
// Startup info (do not log secrets)
console.log('ENV loaded. GOOGLE_API_KEY present?', !!process.env.GOOGLE_API_KEY);
console.log('Using GOOGLE_MODEL=', process.env.GOOGLE_MODEL || 'models/chat-bison-001');

app.use(cors()); 

const storage = multer.diskStorage({ 
  destination: function (req, file, cb) { 
    cb(null, 'uploads/') 
  }, 
  filename: function (req, file, cb) { 
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9) 
    cb(null, uniqueSuffix+ '-' +file.originalname) 
  } 
}) 

const upload = multer({ storage: storage }) 

app.get('/',(req,res)=>{ 
  return res.json({status: 'Server is running'}); 
}); 

app.post('/upload/pdf', upload.single('pdf'), async (req, res) => { 
  await queue.add("file-ready", JSON.stringify({filePath: req.file.path}) ); 
  return res.json({
    status: 'PDF uploaded successfully', 
    file: req.file,
    filename: req.file.filename,
    destination: req.file.destination,
  }); 
}); 

const queue = new Queue("file-upload-queue", {
  connection:{
    host: 'localhost',
    port: '6379'
  }
}); 

app.get('/chat', async (req, res) => {
  try {
    const userQuery = req.query.message;

    // 1. Keep Gemini for Embeddings (since this works fine for you)
    const embeddings = new GoogleGenerativeAIEmbeddings({
      model: "text-embedding-004",
      apiKey: process.env.GOOGLE_API_KEY,
    });

    const vectorStore = await QdrantVectorStore.fromExistingCollection(embeddings, {
      url: 'http://localhost:6333',
      collectionName: "langchainjs-testing",
    });

    const result = await vectorStore.asRetriever({ k: 2 }).invoke(userQuery);
    const context = result.map(d => d.pageContent).join("\n\n");

    // 2. INITIALIZE GROQ (Instead of Gemini LLM)
    const llm = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: "llama-3.1-8b-instant", // Correct property
  temperature: 0.1,
});

    // 3. INVOKE GROQ
    const response = await llm.invoke([
      { role: "system", content: "Answer strictly based on the provided context." },
      { role: "user", content: `Context:\n${context}\n\nQuestion: ${userQuery}` }
    ]);

    return res.json({
      answer: response.content,
      docs: result
    });

  } catch (error) {
    console.error("Groq RAG Error:", error.message);
    return res.status(500).json({ error: "Server Error", details: error.message });
  }
});


app.listen(port, () => { 
  console.log(`Server is running on http://localhost:${port}`); 
});
