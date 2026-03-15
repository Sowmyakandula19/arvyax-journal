const express = require("express");
const router = express.Router();
const { getDb } = require("../db/database");

// GET /api/journal/insights/:userId
router.get("/:userId", (req, res) => {
  const { userId } = req.params;

  if (!userId || userId.trim() === "") {
    return res.status(400).json({ error: "userId is required" });
  }

  const db = getDb();
  const uid = userId.trim();

  try {
    // Total entries
    const totalRow = db
      .prepare("SELECT COUNT(*) as count FROM journal_entries WHERE user_id = ?")
      .get(uid);
    const totalEntries = totalRow.count;

    if (totalEntries === 0) {
      return res.json({
        totalEntries: 0,
        topEmotion: null,
        mostUsedAmbience: null,
        recentKeywords: [],
        analyzedEntries: 0,
        emotionBreakdown: {},
        ambienceBreakdown: {},
      });
    }

    // Top emotion (from analyzed entries)
    const topEmotionRow = db
      .prepare(`
        SELECT emotion, COUNT(*) as count
        FROM journal_entries
        WHERE user_id = ? AND emotion IS NOT NULL
        GROUP BY emotion
        ORDER BY count DESC
        LIMIT 1
      `)
      .get(uid);

    // Most used ambience
    const topAmbienceRow = db
      .prepare(`
        SELECT ambience, COUNT(*) as count
        FROM journal_entries
        WHERE user_id = ?
        GROUP BY ambience
        ORDER BY count DESC
        LIMIT 1
      `)
      .get(uid);

    // Recent keywords from last 10 analyzed entries
    const recentEntries = db
      .prepare(`
        SELECT keywords FROM journal_entries
        WHERE user_id = ? AND keywords IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 10
      `)
      .all(uid);

    // Flatten and deduplicate keywords, count frequency
    const keywordFreq = {};
    for (const row of recentEntries) {
      const kws = JSON.parse(row.keywords || "[]");
      for (const kw of kws) {
        const normalized = kw.toLowerCase().trim();
        keywordFreq[normalized] = (keywordFreq[normalized] || 0) + 1;
      }
    }
    const recentKeywords = Object.entries(keywordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([kw]) => kw);

    // Emotion breakdown
    const emotionRows = db
      .prepare(`
        SELECT emotion, COUNT(*) as count
        FROM journal_entries
        WHERE user_id = ? AND emotion IS NOT NULL
        GROUP BY emotion
        ORDER BY count DESC
      `)
      .all(uid);
    const emotionBreakdown = Object.fromEntries(
      emotionRows.map((r) => [r.emotion, r.count])
    );

    // Ambience breakdown
    const ambienceRows = db
      .prepare(`
        SELECT ambience, COUNT(*) as count
        FROM journal_entries
        WHERE user_id = ?
        GROUP BY ambience
        ORDER BY count DESC
      `)
      .all(uid);
    const ambienceBreakdown = Object.fromEntries(
      ambienceRows.map((r) => [r.ambience, r.count])
    );

    // Count analyzed entries
    const analyzedRow = db
      .prepare(`
        SELECT COUNT(*) as count FROM journal_entries
        WHERE user_id = ? AND emotion IS NOT NULL
      `)
      .get(uid);

    // 7-day trend
    const trendRows = db
      .prepare(`
        SELECT date(created_at) as day, COUNT(*) as count
        FROM journal_entries
        WHERE user_id = ? AND created_at >= datetime('now', '-7 days')
        GROUP BY day
        ORDER BY day ASC
      `)
      .all(uid);

    return res.json({
      totalEntries,
      topEmotion: topEmotionRow?.emotion || null,
      mostUsedAmbience: topAmbienceRow?.ambience || null,
      recentKeywords,
      analyzedEntries: analyzedRow.count,
      emotionBreakdown,
      ambienceBreakdown,
      weeklyTrend: trendRows,
    });
  } catch (err) {
    console.error("Insights error:", err);
    return res.status(500).json({ error: "Failed to compute insights" });
  }
});

module.exports = router;
