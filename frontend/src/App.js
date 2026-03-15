import React, { useState, useEffect, useCallback } from "react";
import { api } from "./api";
import "./App.css";

const AMBIENCES = [
  { value: "forest", emoji: "🌲", label: "Forest" },
  { value: "ocean", emoji: "🌊", label: "Ocean" },
  { value: "mountain", emoji: "⛰️", label: "Mountain" },
  { value: "desert", emoji: "🏜️", label: "Desert" },
  { value: "rain", emoji: "🌧️", label: "Rain" },
  { value: "city", emoji: "🏙️", label: "City" },
];

const EMOTION_COLORS = {
  calm: "#4ade80",
  peaceful: "#34d399",
  grateful: "#a78bfa",
  joyful: "#fbbf24",
  energized: "#fb923c",
  anxious: "#f87171",
  melancholic: "#60a5fa",
  overwhelmed: "#f472b6",
  default: "#94a3b8",
};

export default function App() {
  const [userId, setUserId] = useState(() => localStorage.getItem("arvyax_user") || "");
  const [userInput, setUserInput] = useState("");
  const [tab, setTab] = useState("write"); // write | entries | insights

  const [text, setText] = useState("");
  const [ambience, setAmbience] = useState("forest");
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState(null);

  const [entries, setEntries] = useState([]);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [analyzingId, setAnalyzingId] = useState(null);

  const [insights, setInsights] = useState(null);
  const [loadingInsights, setLoadingInsights] = useState(false);

  const isLoggedIn = !!userId;

  function login() {
    const id = userInput.trim();
    if (!id) return;
    localStorage.setItem("arvyax_user", id);
    setUserId(id);
  }

  function logout() {
    localStorage.removeItem("arvyax_user");
    setUserId("");
    setEntries([]);
    setInsights(null);
    setTab("write");
  }

  const loadEntries = useCallback(async () => {
    if (!userId) return;
    setLoadingEntries(true);
    try {
      const data = await api.getEntries(userId);
      setEntries(data.entries);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingEntries(false);
    }
  }, [userId]);

  const loadInsights = useCallback(async () => {
    if (!userId) return;
    setLoadingInsights(true);
    try {
      const data = await api.getInsights(userId);
      setInsights(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingInsights(false);
    }
  }, [userId]);

  useEffect(() => {
    if (isLoggedIn && tab === "entries") loadEntries();
    if (isLoggedIn && tab === "insights") loadInsights();
  }, [tab, isLoggedIn, loadEntries, loadInsights]);

  async function handleSubmit() {
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    setSubmitMsg(null);
    try {
      await api.createEntry({ userId, ambience, text });
      setSubmitMsg({ type: "success", text: "Entry saved! ✓" });
      setText("");
    } catch (e) {
      setSubmitMsg({ type: "error", text: e.message });
    } finally {
      setSubmitting(false);
    }
  }

  async function analyzeEntry(entry) {
    setAnalyzingId(entry.id);
    try {
      const result = await api.analyzeText(entry.text, entry.id);
      setEntries((prev) =>
        prev.map((e) =>
          e.id === entry.id ? { ...e, analysis: result } : e
        )
      );
    } catch (e) {
      alert("Analysis failed: " + e.message);
    } finally {
      setAnalyzingId(null);
    }
  }

  // ── Login Screen ──────────────────────────────────────────────────────────
  if (!isLoggedIn) {
    return (
      <div className="app-shell">
        <div className="login-card">
          <div className="brand-mark">🌿</div>
          <h1 className="brand-title">ArvyaX Journal</h1>
          <p className="brand-sub">Your nature wellness companion</p>
          <div className="login-form">
            <input
              className="input"
              placeholder="Enter your user ID"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && login()}
              autoFocus
            />
            <button className="btn-primary" onClick={login}>
              Begin Session
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main App ──────────────────────────────────────────────────────────────
  return (
    <div className="app-shell">
      <header className="topbar">
        <span className="brand">🌿 ArvyaX</span>
        <nav className="tabs">
          {["write", "entries", "insights"].map((t) => (
            <button
              key={t}
              className={`tab-btn ${tab === t ? "active" : ""}`}
              onClick={() => setTab(t)}
            >
              {t === "write" ? "✍️ Write" : t === "entries" ? "📖 Entries" : "📊 Insights"}
            </button>
          ))}
        </nav>
        <div className="user-info">
          <span className="user-id">👤 {userId}</span>
          <button className="btn-ghost" onClick={logout}>Logout</button>
        </div>
      </header>

      <main className="main-content">
        {/* ── WRITE TAB ── */}
        {tab === "write" && (
          <div className="panel">
            <h2 className="panel-title">New Journal Entry</h2>

            <div className="section-label">Choose your nature session</div>
            <div className="ambience-grid">
              {AMBIENCES.map((a) => (
                <button
                  key={a.value}
                  className={`ambience-btn ${ambience === a.value ? "selected" : ""}`}
                  onClick={() => setAmbience(a.value)}
                >
                  <span className="ambience-emoji">{a.emoji}</span>
                  <span className="ambience-label">{a.label}</span>
                </button>
              ))}
            </div>

            <div className="section-label">How did it feel?</div>
            <textarea
              className="journal-textarea"
              placeholder="Write about your experience..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={7}
            />
            <div className="char-count">{text.length}/5000</div>

            {submitMsg && (
              <div className={`msg ${submitMsg.type}`}>{submitMsg.text}</div>
            )}

            <button
              className="btn-primary"
              onClick={handleSubmit}
              disabled={submitting || text.trim().length < 5}
            >
              {submitting ? "Saving..." : "Save Entry"}
            </button>
          </div>
        )}

        {/* ── ENTRIES TAB ── */}
        {tab === "entries" && (
          <div className="panel">
            <div className="panel-header">
              <h2 className="panel-title">Your Journal</h2>
              <button className="btn-ghost" onClick={loadEntries}>↻ Refresh</button>
            </div>

            {loadingEntries ? (
              <div className="loading">Loading entries…</div>
            ) : entries.length === 0 ? (
              <div className="empty">No entries yet. Start writing!</div>
            ) : (
              <div className="entries-list">
                {entries.map((entry) => {
                  const amb = AMBIENCES.find((a) => a.value === entry.ambience);
                  const emotionColor =
                    EMOTION_COLORS[entry.analysis?.emotion] || EMOTION_COLORS.default;
                  return (
                    <div key={entry.id} className="entry-card">
                      <div className="entry-header">
                        <span className="entry-ambience">
                          {amb?.emoji} {amb?.label}
                        </span>
                        <span className="entry-date">
                          {new Date(entry.createdAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                      </div>
                      <p className="entry-text">{entry.text}</p>

                      {entry.analysis ? (
                        <div className="analysis-block">
                          <span
                            className="emotion-badge"
                            style={{ background: emotionColor + "30", color: emotionColor }}
                          >
                            {entry.analysis.emotion}
                          </span>
                          <div className="keywords">
                            {entry.analysis.keywords.map((k) => (
                              <span key={k} className="keyword">{k}</span>
                            ))}
                          </div>
                          <p className="summary">{entry.analysis.summary}</p>
                          {entry.analysis.cached && (
                            <span className="cache-badge">⚡ cached</span>
                          )}
                        </div>
                      ) : (
                        <button
                          className="btn-analyze"
                          onClick={() => analyzeEntry(entry)}
                          disabled={analyzingId === entry.id}
                        >
                          {analyzingId === entry.id ? "Analyzing…" : "🔍 Analyze Emotion"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── INSIGHTS TAB ── */}
        {tab === "insights" && (
          <div className="panel">
            <div className="panel-header">
              <h2 className="panel-title">Your Insights</h2>
              <button className="btn-ghost" onClick={loadInsights}>↻ Refresh</button>
            </div>

            {loadingInsights ? (
              <div className="loading">Computing insights…</div>
            ) : !insights ? (
              <div className="empty">No data yet.</div>
            ) : (
              <div className="insights-grid">
                <div className="stat-card">
                  <div className="stat-value">{insights.totalEntries}</div>
                  <div className="stat-label">Total Entries</div>
                </div>
                <div className="stat-card">
                  <div
                    className="stat-value"
                    style={{
                      color:
                        EMOTION_COLORS[insights.topEmotion] || EMOTION_COLORS.default,
                    }}
                  >
                    {insights.topEmotion || "—"}
                  </div>
                  <div className="stat-label">Top Emotion</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">
                    {AMBIENCES.find((a) => a.value === insights.mostUsedAmbience)?.emoji || "—"}{" "}
                    {insights.mostUsedAmbience || "—"}
                  </div>
                  <div className="stat-label">Favourite Ambience</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{insights.analyzedEntries}</div>
                  <div className="stat-label">Entries Analyzed</div>
                </div>

                {insights.recentKeywords.length > 0 && (
                  <div className="stat-card wide">
                    <div className="stat-label">Recent Keywords</div>
                    <div className="keywords" style={{ marginTop: 8 }}>
                      {insights.recentKeywords.map((k) => (
                        <span key={k} className="keyword">{k}</span>
                      ))}
                    </div>
                  </div>
                )}

                {Object.keys(insights.emotionBreakdown).length > 0 && (
                  <div className="stat-card wide">
                    <div className="stat-label">Emotion Breakdown</div>
                    <div className="breakdown-bars">
                      {Object.entries(insights.emotionBreakdown).map(([em, count]) => {
                        const pct = Math.round((count / insights.analyzedEntries) * 100);
                        return (
                          <div key={em} className="bar-row">
                            <span className="bar-label">{em}</span>
                            <div className="bar-track">
                              <div
                                className="bar-fill"
                                style={{
                                  width: `${pct}%`,
                                  background:
                                    EMOTION_COLORS[em] || EMOTION_COLORS.default,
                                }}
                              />
                            </div>
                            <span className="bar-count">{count}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {Object.keys(insights.ambienceBreakdown).length > 0 && (
                  <div className="stat-card wide">
                    <div className="stat-label">Ambience Breakdown</div>
                    <div className="breakdown-bars">
                      {Object.entries(insights.ambienceBreakdown).map(([amb, count]) => {
                        const total = insights.totalEntries;
                        const pct = Math.round((count / total) * 100);
                        const emoji =
                          AMBIENCES.find((a) => a.value === amb)?.emoji || "";
                        return (
                          <div key={amb} className="bar-row">
                            <span className="bar-label">{emoji} {amb}</span>
                            <div className="bar-track">
                              <div
                                className="bar-fill"
                                style={{ width: `${pct}%`, background: "#4ade80" }}
                              />
                            </div>
                            <span className="bar-count">{count}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
