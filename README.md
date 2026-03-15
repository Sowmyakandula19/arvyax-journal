# 🌿 ArvyaX Journal

An AI-powered journaling system for nature wellness sessions. Users write about their forest, ocean, and mountain experiences; the system analyzes emotions using an LLM and surfaces insights over time.

## Live Demo
🌐 **Frontend:** https://arvyax-journal-1-4hbo.onrender.com

⚙️ **Backend API:** https://arvyax-backend-api.onrender.com

📦 **GitHub:** https://github.com/Sowmyakandula19/arvyax-journal

---

## Quick Start

### Prerequisites
- Node.js 18+
- A free [Groq API key](https://console.groq.com) — no credit card required

### 1. Clone & Install

```bash
git clone https://github.com/Sowmyakandula19/arvyax-journal.git
cd arvyax-journal

# Install backend deps
cd backend
npm install

# Install frontend deps
cd ../frontend
npm install
```

### 2. Configure Environment

```bash
cd backend
cp .env.example .env
# Edit .env and set your GROQ API key
```

Your `.env` should look like:
```
ANTHROPIC_API_KEY=gsk_your_groq_key_here
PORT=3001
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000
```

> The variable is named `ANTHROPIC_API_KEY` in the code but holds your Groq key.

### 3. Run

**Terminal 1 — Backend:**
```bash
cd backend
npm start
# API running at http://localhost:3001
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm start
# UI running at http://localhost:3000
```

### Docker (Alternative)

```bash
# From repo root
cp backend/.env.example .env
# Edit .env — set your Groq API key as ANTHROPIC_API_KEY

docker-compose up --build
# Frontend: http://localhost:3000
# Backend:  http://localhost:3001
```

---

## API Reference

### Create a Journal Entry
```
POST /api/journal
Content-Type: application/json

{
  "userId": "user123",
  "ambience": "forest",
  "text": "I felt calm today after listening to the rain."
}
```
**Response `201`:**
```json
{
  "success": true,
  "entry": {
    "id": "uuid",
    "userId": "user123",
    "ambience": "forest",
    "text": "I felt calm today...",
    "createdAt": "2024-01-15T10:30:00",
    "analysis": null
  }
}
```

Valid `ambience` values: `forest`, `ocean`, `mountain`, `desert`, `rain`, `city`

---

### Get Entries for a User
```
GET /api/journal/:userId?page=1&limit=10
```
**Response `200`:**
```json
{
  "success": true,
  "entries": [...],
  "pagination": { "page": 1, "limit": 10, "total": 42, "totalPages": 5 }
}
```

---

### Analyze Text (LLM)
```
POST /api/journal/analyze
Content-Type: application/json

{
  "text": "I felt calm today after listening to the rain",
  "entryId": "optional-uuid-to-persist-analysis"
}
```
**Response `200`:**
```json
{
  "emotion": "calm",
  "keywords": ["rain", "nature", "peace"],
  "summary": "User experienced relaxation during a forest session.",
  "cached": false
}
```

---

### Get Insights for a User
```
GET /api/journal/insights/:userId
```
**Response `200`:**
```json
{
  "totalEntries": 8,
  "topEmotion": "calm",
  "mostUsedAmbience": "forest",
  "recentKeywords": ["focus", "nature", "rain"],
  "analyzedEntries": 6,
  "emotionBreakdown": { "calm": 4, "grateful": 2 },
  "ambienceBreakdown": { "forest": 5, "ocean": 3 },
  "weeklyTrend": [{ "day": "2024-01-15", "count": 2 }]
}
```

---

### Health Check
```
GET /health
```

---

## Tech Stack

| Layer    | Technology                        |
|----------|-----------------------------------|
| Backend  | Node.js + Express                 |
| Database | SQLite (via `better-sqlite3`)     |
| LLM      | Groq API (llama-3.1-8b-instant)   |
| Frontend | React (CRA)                       |
| Caching  | SQLite `analysis_cache` table     |
| Hosting  | Render (backend + frontend)       |
| Docker   | Docker Compose                    |

---

## Project Structure

```
arvyax-journal/
├── backend/
│   ├── server.js                  # Express app + route wiring
│   ├── db/
│   │   └── database.js            # SQLite init + schema
│   ├── routes/
│   │   ├── journal.js             # POST /api/journal, GET /api/journal/:userId
│   │   ├── analyze.js             # POST /api/journal/analyze
│   │   └── insights.js            # GET /api/journal/insights/:userId
│   ├── models/
│   │   └── analysisService.js     # LLM call + DB cache logic
│   ├── middleware/
│   │   └── rateLimiter.js         # express-rate-limit config
│   ├── .env.example
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── App.js                 # Full single-page UI
│   │   ├── App.css                # Styles
│   │   ├── api.js                 # API helper
│   │   └── index.js
│   ├── public/index.html
│   └── Dockerfile
├── docker-compose.yml
├── README.md
└── ARCHITECTURE.md
```

---

## Features

- ✅ Journal entry creation with ambience tagging
- ✅ Paginated entry retrieval
- ✅ LLM emotion analysis (Groq — free, no credit card)
- ✅ Insights API with emotion & ambience breakdowns
- ✅ **Analysis caching** — identical text reuses cached result (SHA-256 keyed)
- ✅ **Rate limiting** — 100 req/15 min general; 10 req/min on analysis endpoint
- ✅ **Docker setup** — `docker-compose up --build`
- ✅ Input validation & structured error responses
- ✅ WAL-mode SQLite for better concurrent read performance
- ✅ Deployed live on Render
