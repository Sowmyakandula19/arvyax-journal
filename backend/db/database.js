const Database = require("better-sqlite3");
const path = require("path");

const DB_PATH = path.join(__dirname, "..", "journal.db");

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL"); // Better concurrency
    db.pragma("foreign_keys = ON");
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS journal_entries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      ambience TEXT NOT NULL CHECK(ambience IN ('forest','ocean','mountain','desert','rain','city')),
      text TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      -- LLM analysis fields (nullable until analyzed)
      emotion TEXT,
      keywords TEXT,          -- JSON array stored as string
      summary TEXT,
      analyzed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_journal_user ON journal_entries(user_id);
    CREATE INDEX IF NOT EXISTS idx_journal_user_created ON journal_entries(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_journal_ambience ON journal_entries(ambience);

    -- Cache table for LLM responses (deduplication by content hash)
    CREATE TABLE IF NOT EXISTS analysis_cache (
      text_hash TEXT PRIMARY KEY,
      emotion TEXT NOT NULL,
      keywords TEXT NOT NULL,
      summary TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      hit_count INTEGER DEFAULT 1
    );
  `);
}

module.exports = { getDb };
