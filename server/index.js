import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { Queue } from 'bullmq'; 
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai"; 
import { QdrantVectorStore } from '@langchain/qdrant';



const app = express();
const port = 8000;
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
    return res.json({status: 'PDF uploaded successfully', file: req.file,
      filename: req.file.filename,
      destination: req.file.destination,
    });
});



const queue = new Queue("file-upload-queue", {connection:{
    host: 'localhost',
    port: '6379'
}});


app.get('/chat',async(req,res)=>{
    const userQuery='when is the flight';
     const embeddings = new GoogleGenerativeAIEmbeddings({
    model: "text-embedding-004",
    apiKey: "AIzaSyCTzdu7rtKN-qzcbPBA9W8uRJzMdusR5SM",
    });
    const vectorStore = await QdrantVectorStore.fromExistingCollection(embeddings, {
    url: 'http://localhost:6333',
    collectionName: "langchainjs-testing",
});
const ret=vectorStore.asRetriever({
  k:2
});
const result=await ret.invoke(userQuery);
return res.json({result});
});
const SYS_PROMPT=`
You are a helpful AI assistant that helps people find information 
about their documents.
Context:${JSON.stringify(result)}
`;
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});  


                                                                 