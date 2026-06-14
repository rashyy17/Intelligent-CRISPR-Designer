// server/eval-judge.js
// LLM-as-a-judge evaluation: runs the real RAG pipeline on test questions,
// then uses a SEPARATE LLM call to score each answer for:
//   - faithfulness: does the answer stick to the retrieved context (no hallucination)?
//   - relevance:    does the answer actually address the question?
import 'dotenv/config';                 // load GROQ_API_KEY (rag.js reads it but doesn't load it)
import { ChatGroq } from "@langchain/groq";
import { performRAG } from './rag.js';  // the SAME RAG core the app uses

// Questions to evaluate. These exercise the knowledge base.
const questions = [
  "What is the difference between NHEJ and HDR repair after a CRISPR cut?",
  "How do the CFD score and MIT-Broad score differ for off-target prediction?",
  "Why does GC content matter when designing a guide RNA?",
  "How should gRNAs be positioned relative to the TSS for CRISPRa?",
];

// The judge is its own LLM. Low temperature so scoring is stable/repeatable.
const judge = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: "llama-3.1-8b-instant",
  temperature: 0,
});

// Ask the judge to grade ONE (question, context, answer) triple.
// We force it to reply as strict JSON so we can parse numbers out reliably.
async function judgeAnswer(question, context, answer) {
  const judgePrompt = `You are a strict evaluator of a RAG system's answer.

Score TWO things, each from 1 (worst) to 5 (best):
1. faithfulness: Is every claim in the ANSWER supported by the CONTEXT? Penalize anything not in the context.
2. relevance: Does the ANSWER actually address the QUESTION?

Reply with ONLY a JSON object, no other text, in exactly this form:
{"faithfulness": <1-5>, "relevance": <1-5>, "reason": "<one short sentence>"}

QUESTION:
${question}

CONTEXT:
${context}

ANSWER:
${answer}`;

  const res = await judge.invoke([{ role: "user", content: judgePrompt }]);

  // res.content is a string; extract the JSON object from it defensively.
  const text = res.content;
  const match = text.match(/\{[\s\S]*\}/);   // grab the first {...} block
  if (!match) throw new Error(`Judge did not return JSON: ${text}`);
  return JSON.parse(match[0]);               // -> { faithfulness, relevance, reason }
}

async function main() {
  let totalFaith = 0;
  let totalRel = 0;
  let count = 0;

  console.log(`\nRunning LLM-as-a-judge eval over ${questions.length} questions...\n`);

  for (const question of questions) {
    // 1. Run the REAL RAG pipeline.
    const { answer, docs } = await performRAG(question);
    // 2. Rebuild the context the LLM saw (same join as in performRAG).
    const context = docs.map(d => d.pageContent).join("\n\n");
    // 3. Judge it.
    const score = await judgeAnswer(question, context, answer);

    totalFaith += score.faithfulness;
    totalRel += score.relevance;
    count++;

    console.log(`Q: ${question}`);
    console.log(`   faithfulness: ${score.faithfulness}/5   relevance: ${score.relevance}/5`);
    console.log(`   judge: ${score.reason}\n`);
  }

  // Averages across all questions.
  console.log("─".repeat(50));
  console.log(`📊 avg faithfulness: ${(totalFaith / count).toFixed(2)}/5`);
  console.log(`📊 avg relevance:    ${(totalRel / count).toFixed(2)}/5`);
}

main().catch(err => {
  console.error("Judge eval failed:", err.message);
  process.exit(1);
});