// server/ingest_manual.js
import { Queue } from 'bullmq';
import fs from 'fs';
import path from 'path';

const connection = { host: 'localhost', port: 6379 };
const queue = new Queue("file-upload-queue", { connection });

async function ingestFolder() {
  const uploadsDir = './uploads';
  const files = fs.readdirSync(uploadsDir).filter(f => f.endsWith('.pdf'));

  console.log(`Found ${files.length} PDFs. Adding to queue...`);

  for (const file of files) {
    const filePath = path.join(uploadsDir, file);
    await queue.add("manual-upload", { filePath: filePath });
    console.log(`+ Added to queue: ${file}`);
  }

  console.log("Done. Make sure your worker.js is running to process them!");
  process.exit();
}

ingestFolder();