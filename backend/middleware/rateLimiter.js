const rateLimit = require("express-rate-limit");

// General API rate limit
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many requests. Please try again in 15 minutes.",
  },
});

// Stricter limit for LLM analysis endpoint (cost control)
const analysisLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Analysis rate limit exceeded. Max 10 requests per minute.",
  },
  keyGenerator: (req) => {
    // Rate limit per userId if provided, else by IP
    return req.body?.userId || req.ip;
  },
});

module.exports = { apiLimiter, analysisLimiter };
