require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { apiLimiter, analysisLimiter } = require("./middleware/rateLimiter");

// Initialize DB on startup
require("./db/database").getDb();

const journalRoutes = require("./routes/journal");
const analyzeRoutes = require("./routes/analyze");
const insightsRoutes = require("./routes/insights");

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.CORS_ORIGIN || "http://localhost:3000",
  methods: ["GET", "POST"],
}));
app.use(express.json({ limit: "50kb" }));
app.use(apiLimiter);

// ─── Routes ───────────────────────────────────────────────────────────────────
// NOTE: /analyze must be registered BEFORE /:userId to avoid route conflict
app.use("/api/journal/analyze", analysisLimiter, analyzeRoutes);
app.use("/api/journal/insights", insightsRoutes);
app.use("/api/journal", journalRoutes);

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    llm: process.env.ANTHROPIC_API_KEY ? "configured" : "NOT CONFIGURED",
  });
});

// ─── 404 handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// ─── Error handler ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({
    error: "Internal server error",
    detail: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════╗
  ║   ArvyaX Journal API running        ║
  ║   http://localhost:${PORT}             ║
  ║                                      ║
  ║   POST  /api/journal                 ║
  ║   GET   /api/journal/:userId         ║
  ║   POST  /api/journal/analyze         ║
  ║   GET   /api/journal/insights/:id    ║
  ╚══════════════════════════════════════╝
  `);
});

module.exports = app;
