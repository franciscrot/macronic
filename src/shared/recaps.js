import { segments } from "./data.js";

const wordCount = (text) => (text.match(/\S+/gu) || []).length;
const key = (text) => text.normalize("NFC").toLocaleLowerCase("en");

// Session-only exposure history. Recaps use existing approved occurrences,
// never new translations, and never count a skipped or revisited section twice.
export class WordRecaps {
  constructor(interval = 1500, window = 2000) {
    this.interval = interval;
    this.window = window;
    this.total = 0;
    this.nextAt = interval;
    this.visits = new Map();
    this.cards = new Map();
  }
  record(index, passages, stage) {
    let visit = this.visits.get(index);
    if (!visit) {
      visit = { start: this.total, end: this.total + passages.reduce((n, p) => n + wordCount(p.text), 0), words: new Map() };
      this.total = visit.end;
      this.visits.set(index, visit);
    }
    let offset = visit.start;
    for (const p of passages) {
      const visible = segments(p, stage).flatMap(part => {
        const r = part.replacement;
        if (!r) return [];
        if (r.kind !== "sentence") return [r];
        return p.replacements.filter(w => w.start >= r.start && w.end <= r.end && part.text.includes(w.target ?? w.french));
      });
      if (stage === 5) visible.push(...p.replacements.filter(w => p.translation?.includes(w.target ?? w.french)));
      for (const r of visible) {
        const target = r.target ?? r.french;
        if (r.kind === "sentence" || !r.english || !target || /\s/u.test(r.english) || /\s/u.test(target)) continue;
        if (r.decision?.status !== "approved" || !r.decision.safe_for_substitution) continue;
        visit.words.set(`${p.id}:${r.id}`, {
          english: r.english, target,
          position: offset + wordCount(Array.from(p.text).slice(0, r.end).join("")),
        });
      }
      offset += wordCount(p.text);
    }
    if (!this.cards.has(index) && visit.end === this.total && this.total >= this.nextAt) {
      const pairs = new Map();
      for (const v of this.visits.values()) for (const w of v.words.values()) {
        if (w.position <= this.total - this.window) continue;
        const id = `${key(w.english)}\0${key(w.target)}`;
        const pair = pairs.get(id) || { ...w, count: 0 };
        pair.count++;
        if (w.position >= pair.position) Object.assign(pair, w);
        pairs.set(id, pair);
      }
      // Reinforce recurring words first; break ties by recency. Keep one
      // contextual translation per English spelling and at most eight rows.
      const seen = new Set();
      const selected = [...pairs.values()].sort((a, b) => b.count - a.count || b.position - a.position)
        .filter(w => { const k = key(w.english); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 8);
      if (selected.length >= 5) {
        this.cards.set(index, selected.map(({ english, target }) => ({ english, target })));
        this.nextAt = (Math.floor(this.total / this.interval) + 1) * this.interval;
      }
    }
    return this.cards.get(index) || [];
  }
}
