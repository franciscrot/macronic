import { WordRecaps } from "./recaps.js";

// Tie progress to the exact prepared reading file, never to a title alone.
export async function readingKey(data) {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return "macronic:reading:v1:" + Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("");
}
export function saveReading(key, state, recaps, storage) {
  try {
    storage ||= globalThis.localStorage;
    storage.setItem(key, JSON.stringify({ version: 1, state, recap: {
      total: recaps.total, nextAt: recaps.nextAt,
      visits: [...recaps.visits].map(([index, visit]) => [index, {...visit, words: [...visit.words]}]),
      cards: [...recaps.cards],
    }}));
    return true;
  } catch { return false; }
}
export function loadReading(key, count, storage) {
  try {
    storage ||= globalThis.localStorage;
    const saved = JSON.parse(storage.getItem(key));
    if (saved?.version !== 1) return null;
    const s = saved.state, r = saved.recap;
    const integer = (n, max) => Number.isSafeInteger(n) && n >= 0 && n < max;
    if (!s || !integer(s.index, count) || !integer(s.furthest, count) || s.index > s.furthest ||
        !integer(s.anchor, count) || s.anchor > s.furthest || !integer(s.stage, 6) ||
        !integer(s.anchorStage, 6) || typeof s.automatic !== "boolean") return null;
    if (!r || !integer(r.total, Number.MAX_SAFE_INTEGER) || !integer(r.nextAt, Number.MAX_SAFE_INTEGER) ||
        r.nextAt < 1500 || r.nextAt % 1500 !== 0 || !Array.isArray(r.visits) || !Array.isArray(r.cards) ||
        r.visits.length > count || r.cards.length > count) return null;
    const recaps = new WordRecaps();
    recaps.total = r.total; recaps.nextAt = r.nextAt;
    for (const [i, v] of r.visits) {
      if (!integer(i, count) || recaps.visits.has(i) || !integer(v.start, r.total + 1) ||
          !integer(v.end, r.total + 1) || v.end < v.start || !Array.isArray(v.words)) return null;
      const words = new Map();
      for (const [id, w] of v.words) {
        if (typeof id !== "string" || typeof w.english !== "string" || typeof w.target !== "string" ||
            !integer(w.position, v.end + 1) || w.position < v.start) return null;
        words.set(id, w);
      }
      recaps.visits.set(i, {...v, words});
    }
    for (const [i, card] of r.cards) {
      if (!recaps.visits.has(i) || recaps.cards.has(i) || !Array.isArray(card) || card.length < 5 || card.length > 8 ||
          card.some(w => typeof w.english !== "string" || typeof w.target !== "string")) return null;
      recaps.cards.set(i, card);
    }
    return {state: s, recaps};
  } catch { return null; }
}
