const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const { getDb } = require("../db/database");

// Validation helpers
const VALID_AMBIENCES = ["forest", "ocean", "mountain", "desert", "rain", "city"];

function validateEntry(body) {
  const errors = [];
  if (!body.userId || typeof body.userId !== "string" || body.userId.trim() === "") {
    errors.push("userId is required and must be a non-empty string");
  }
  if (!body.ambience || !VALID_AMBIENCES.includes(body.ambience)) {
    errors.push(`ambience must be one of: ${VALID_AMBIENCES.join(", ")}`);
  }
  if (!body.text || typeof body.text !== "string" || body.text.trim().length < 5) {
    errors.push("text is required and must be at least 5 characters");
  }
  if (body.text && body.text.length > 5000) {
    errors.push("text must not exceed 5000 characters");
  }
  return errors;
}

// POST /api/journal — Create a new journal entry
router.post("/", (req, res) => {
  const errors = validateEntry(req.body);
  if (errors.length > 0) {
    return res.status(400).json({ error: "Validation failed", details: errors });
  }

  const db = getDb();
  const id = uuidv4();
  const { userId, ambience, text } = req.body;

  const stmt = db.prepare(`
    INSERT INTO journal_entries (id, user_id, ambience, text)
    VALUES (?, ?, ?, ?)
  `);

  try {
    stmt.run(id, userId.trim(), ambience, text.trim());
    const entry = db
      .prepare("SELECT * FROM journal_entries WHERE id = ?")
      .get(id);

    return res.status(201).json({
      success: true,
      entry: formatEntry(entry),
    });
  } catch (err) {
    console.error("DB insert error:", err);
    return res.status(500).json({ error: "Failed to save journal entry" });
  }
});

// GET /api/journal/:userId — Get all entries for a user
router.get("/:userId", (req, res) => {
  const { userId } = req.params;
  if (!userId || userId.trim() === "") {
    return res.status(400).json({ error: "userId is required" });
  }

  const db = getDb();
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const offset = (page - 1) * limit;

  try {
    const entries = db
      .prepare(
        `SELECT * FROM journal_entries
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(userId.trim(), limit, offset);

    const total = db
      .prepare("SELECT COUNT(*) as count FROM journal_entries WHERE user_id = ?")
      .get(userId.trim());

    return res.json({
      success: true,
      entries: entries.map(formatEntry),
      pagination: {
        page,
        limit,
        total: total.count,
        totalPages: Math.ceil(total.count / limit),
      },
    });
  } catch (err) {
    console.error("DB query error:", err);
    return res.status(500).json({ error: "Failed to fetch entries" });
  }
});

// Helper: format a DB row for API response
function formatEntry(row) {
  return {
    id: row.id,
    userId: row.user_id,
    ambience: row.ambience,
    text: row.text,
    createdAt: row.created_at,
    analysis: row.emotion
      ? {
          emotion: row.emotion,
          keywords: JSON.parse(row.keywords || "[]"),
          summary: row.summary,
          analyzedAt: row.analyzed_at,
        }
      : null,
  };
}

module.exports = router;
