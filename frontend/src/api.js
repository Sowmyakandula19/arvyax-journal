const BASE = process.env.REACT_APP_API_URL || "http://localhost:3001";

async function apiFetch(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "API error");
  return data;
}

export const api = {
  createEntry: (body) =>
    apiFetch("/api/journal", { method: "POST", body: JSON.stringify(body) }),

  getEntries: (userId, page = 1) =>
    apiFetch(`/api/journal/${userId}?page=${page}&limit=10`),

  analyzeText: (text, entryId) =>
    apiFetch("/api/journal/analyze", {
      method: "POST",
      body: JSON.stringify({ text, entryId }),
    }),

  getInsights: (userId) => apiFetch(`/api/journal/insights/${userId}`),
};
