import 'dotenv/config';

const API_KEY = process.env.GOOGLE_API_KEY;

if (!API_KEY) {
    console.error("❌ No API Key found in .env");
    process.exit(1);
}

console.log("🔄 Fetching available models for your API Key...");

async function listModels() {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`;
    
    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            console.error("❌ API Error:", data.error.message);
            return;
        }

        console.log("\n✅ AVAILABLE EMBEDDING MODELS:");
        const embeddingModels = data.models.filter(m => 
            m.supportedGenerationMethods.includes("embedContent")
        );

        if (embeddingModels.length === 0) {
            console.log("⚠️ No embedding models found! Your key might be restricted.");
        } else {
            embeddingModels.forEach(m => {
                console.log(`   - ${m.name}`);
            });
            console.log("\nCopy one of the names above EXACTLY into your worker code.");
        }

    } catch (error) {
        console.error("❌ Network Error:", error.message);
    }
}

listModels();