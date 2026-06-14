// server/config.js — single source of truth for shared settings.
// Values fall back to the current hardcoded defaults, so behaviour is unchanged
// even if .env is missing. Do NOT change EMBEDDING_MODEL without re-ingesting:
// switching models changes vector dimensions and will reset the Qdrant collection.

// server/config.js — single source of truth for shared settings.
// Values fall back to sensible defaults, so behaviour is stable even if .env is missing.
// NOTE: changing EMBEDDING_MODEL changes vector dimensions and requires re-ingesting
// all PDFs (delete the Qdrant collection first).

export const QDRANT_URL        = process.env.QDRANT_URL        || 'http://localhost:6333';
export const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION || 'langchainjs-testing';
export const REDIS_HOST        = process.env.REDIS_HOST        || 'localhost';
export const REDIS_PORT        = Number(process.env.REDIS_PORT || 6379);
export const BIO_ENGINE_URL    = process.env.BIO_ENGINE_URL    || 'http://127.0.0.1:8001';
export const PORT              = Number(process.env.PORT       || 8000);