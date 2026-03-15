const express = require("express");
const router = express.Router();
const { analyzeText, saveAnalysisToEntry } = require("../models/analysisService");
const { getDb } = require("../db/database");

// POST /api/journal/analyze
// Body: { text: string, entryId?: string }
router.post("/", async (req, res) => {
  const { text, entryId } = req.body;

  if (!text || typeof text !== "string" || text.trim().length < 5) {
    return res.status(400).json({
      error: "text is required and must be at least 5 characters",
    });
  }

  if (text.length > 5000) {
    return res.status(400).json({ error: "text must not exceed 5000 characters" });
  }

  try {
    const analysis = await analyzeText(text.trim());

    // If entryId provided, persist analysis to that entry
    if (entryId) {
      const db = getDb();
      const entry = db
        .prepare("SELECT id FROM journal_entries WHERE id = ?")
        .get(entryId);

      if (entry) {
        saveAnalysisToEntry(entryId, analysis);
      }
    }

    return res.json({
      emotion: analysis.emotion,
      keywords: analysis.keywords,
      summary: analysis.summary,
      cached: analysis.cached,
    });
  } catch (err) {
    console.error("Analysis error:", err.message);

    if (err.message.includes("ANTHROPIC_API_KEY")) {
      return res.status(503).json({
        error: "LLM service not configured. Set ANTHROPIC_API_KEY in environment.",
      });
    }

    return res.status(502).json({
      error: "Failed to analyze text. Please try again.",
      detail: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
});

module.exports = router;
