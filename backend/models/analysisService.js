const crypto = require("crypto");
const { getDb } = require("../db/database");

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5-20251001"; // Cost-efficient for analysis

const SYSTEM_PROMPT = `You are an emotion analysis assistant for ArvyaX, a nature wellness app.
Analyze the user's journal entry and respond ONLY with a valid JSON object.
No markdown, no explanation, no code fences. Raw JSON only.

The JSON must have exactly these fields:
- "emotion": string — the primary emotion (e.g. "calm", "anxious", "joyful", "melancholic", "energized", "peaceful", "overwhelmed", "grateful")
- "keywords": array of 3-5 strings — key themes/words from the entry
- "summary": string — one sentence summarizing the user's mental state during this session

Example response:
{"emotion":"calm","keywords":["rain","peace","nature"],"summary":"User experienced deep relaxation during a forest session with gentle rain."}`;

/**
 * Hash text for cache key — avoids storing raw journal text in cache table
 */
function hashText(text) {
  return crypto
    .createHash("sha256")
    .update(text.trim().toLowerCase())
    .digest("hex");
}

/**
 * Check DB cache for a previous analysis of identical text
 */
function getCachedAnalysis(text) {
  const hash = hashText(text);
  const db = getDb();
  const cached = db
    .prepare("SELECT * FROM analysis_cache WHERE text_hash = ?")
    .get(hash);

  if (cached) {
    // Bump hit count asynchronously (non-blocking)
    db.prepare(
      "UPDATE analysis_cache SET hit_count = hit_count + 1 WHERE text_hash = ?"
    ).run(hash);
    return {
      emotion: cached.emotion,
      keywords: JSON.parse(cached.keywords),
      summary: cached.summary,
      cached: true,
    };
  }
  return null;
}

/**
 * Store analysis result in DB cache
 */
function storeInCache(text, result) {
  const hash = hashText(text);
  const db = getDb();
  db.prepare(`
    INSERT OR IGNORE INTO analysis_cache (text_hash, emotion, keywords, summary)
    VALUES (?, ?, ?, ?)
  `).run(hash, result.emotion, JSON.stringify(result.keywords), result.summary);
}

/**
 * Call Anthropic API for emotion analysis
 */
async function callLLM(text) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set in environment");
  }

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 256,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Analyze this journal entry:\n\n"${text}"`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${errBody}`);
  }

  const data = await response.json();
  const rawText = data.content?.[0]?.text?.trim();

  if (!rawText) {
    throw new Error("Empty response from LLM");
  }

  // Parse and validate the JSON response
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    // Attempt to extract JSON from response if it has surrounding text
    const match = rawText.match(/\{[\s\S]*\}/);
    if (match) {
      parsed = JSON.parse(match[0]);
    } else {
      throw new Error(`LLM returned non-JSON: ${rawText}`);
    }
  }

  // Validate required fields
  if (!parsed.emotion || !Array.isArray(parsed.keywords) || !parsed.summary) {
    throw new Error("LLM response missing required fields");
  }

  return {
    emotion: String(parsed.emotion).toLowerCase(),
    keywords: parsed.keywords.map(String).slice(0, 5),
    summary: String(parsed.summary),
    cached: false,
  };
}

/**
 * Main analysis function — checks cache first, then calls LLM
 */
async function analyzeText(text) {
  // 1. Check cache
  const cached = getCachedAnalysis(text);
  if (cached) return cached;

  // 2. Call LLM
  const result = await callLLM(text);

  // 3. Cache the result
  storeInCache(text, result);

  return result;
}

/**
 * Save analysis back to a journal entry
 */
function saveAnalysisToEntry(entryId, analysis) {
  const db = getDb();
  db.prepare(`
    UPDATE journal_entries
    SET emotion = ?, keywords = ?, summary = ?, analyzed_at = datetime('now')
    WHERE id = ?
  `).run(
    analysis.emotion,
    JSON.stringify(analysis.keywords),
    analysis.summary,
    entryId
  );
}

module.exports = { analyzeText, saveAnalysisToEntry };
