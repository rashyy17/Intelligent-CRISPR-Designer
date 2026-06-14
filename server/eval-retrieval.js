// server/eval-retrieval.js
// Measures retrieval quality (recall@k) of the RAG system, in isolation
// from the LLM. For each test question we know which paper SHOULD answer it;
// we retrieve the top-k chunks and check whether that paper appears.

import { QdrantVectorStore } from '@langchain/qdrant';
import { getEmbeddings } from './embeddings.js';
import { QDRANT_URL, QDRANT_COLLECTION } from './config.js';

// How many chunks to retrieve per query (match what index.js uses).
const K = 5;

// --- THE LABELLED TEST SET ---
// Each item: a question, and a substring identifying the paper that should
// answer it. We match on a substring because the stored filenames have
// random multer prefixes (e.g. "1781441943394-690770952-335_2015...").
const testSet = [
  { question: "What is the difference between NHEJ and HDR repair after a double-strand break?", expect: "335_2015" },
  { question: "What is a Cas9 nickase and what does the D10A mutation do?",                       expect: "335_2015" },

  { question: "How should gRNAs be positioned relative to the TSS for CRISPRa activation?",        expect: "FEBS-283" },
  { question: "Why are good gene annotations important for guide RNA design?",                    expect: "FEBS-283" },

  { question: "How do the CFD score and the MIT-Broad score differ for off-target prediction?",   expect: "fphar-09" },
  { question: "Which alignment tools like Bowtie or BWA are used to find off-target sites?",       expect: "fphar-09" },

  { question: "How do U6 and T7 promoters affect on-target efficiency prediction?",                expect: "13059_2016" },
  { question: "How reliable are sequence-based off-target predictions across studies?",            expect: "13059_2016" },
];

async function main() {
  // Connect to the SAME vector store index.js reads from.
  const embeddings = getEmbeddings();
  const vectorStore = await QdrantVectorStore.fromExistingCollection(embeddings, {
    url: QDRANT_URL,
    collectionName: QDRANT_COLLECTION,
  });
  const retriever = vectorStore.asRetriever({ k: K });

  let hits = 0;  // how many questions retrieved the correct paper

  console.log(`\nRunning retrieval eval (recall@${K}) over ${testSet.length} questions...\n`);

  // Loop through every test question.
  for (const { question, expect } of testSet) {
    // Retrieve the top-K chunks for this question.
    const docs = await retriever.invoke(question);

    // Pull the source filename from each retrieved chunk.
    const sources = docs.map(d => d.metadata?.source || "");

    // Did ANY retrieved chunk come from the paper we expected?
    const hit = sources.some(s => s.includes(expect));
    if (hit) hits++;

    // Print a per-question result: ✅ if the right paper showed up, ❌ if not.
    console.log(`${hit ? '✅' : '❌'}  [expect: ${expect}]  ${question}`);
    if (!hit) {
      // On a miss, show what we got instead — useful for debugging retrieval.
      const got = [...new Set(sources.map(s => s.split('/').pop().replace(/^\d+-\d+-/, '')))];
      console.log(`     got instead: ${got.join(', ')}`);
    }
  }

  // Final metric.
  const recall = (hits / testSet.length * 100).toFixed(1);
  console.log(`\n📊 recall@${K} = ${hits}/${testSet.length} = ${recall}%\n`);
}

main().catch(err => {
  console.error("Eval failed:", err.message);
  process.exit(1);
});