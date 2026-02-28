import { texts } from "./texts.js";

const PHASES = [
  { start: 0, type: "token", probability: 0, label: "Phase 1: 100% English" },
  { start: 300, type: "token", probability: 0.1, label: "Phase 2: 10% noun/verb French" },
  { start: 600, type: "token", probability: 0.2, label: "Phase 2: 20% noun/verb French" },
  { start: 800, type: "token", probability: 0.3, label: "Phase 3: 30% noun/verb French" },
  { start: 900, type: "token", probability: 0.4, label: "Phase 4: 40% noun/verb French" },
  { start: 1000, type: "token", probability: 0.5, label: "Phase 5: 50% noun/verb French" },
  {
    start: 1100,
    type: "sentence",
    sentenceProbability: 0.2,
    tokenProbability: 0.5,
    label: "Phase 6: 20% full French sentences",
  },
  {
    start: 1300,
    type: "sentence",
    sentenceProbability: 0.3,
    tokenProbability: 0.5,
    label: "Phase 7: 30% full French sentences",
  },
];

const select = document.querySelector("#text-select");
const reader = document.querySelector("#reader");
const textMeta = document.querySelector("#text-meta");
const startBtn = document.querySelector("#start-btn");
const nextBtn = document.querySelector("#next-btn");
const nextFiveBtn = document.querySelector("#next-five-btn");
const resetBtn = document.querySelector("#reset-btn");
const progress = document.querySelector("#progress");

let activeText = texts[0];
let shownSentenceCount = 0;

function wordTokens(text) {
  return text.match(/[A-Za-zÀ-ÖØ-öø-ÿ'-]+/g) ?? [];
}

function getPhase(wordIndex) {
  let active = PHASES[0];
  for (const phase of PHASES) {
    if (wordIndex >= phase.start) active = phase;
  }
  return active;
}

function hashToUnit(str) {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildFrenchLookup(english, french) {
  const enWords = wordTokens(english);
  const frWords = wordTokens(french);
  const lookup = new Map();
  for (let i = 0; i < enWords.length; i += 1) {
    const en = enWords[i]?.toLowerCase();
    const fr = frWords[i];
    if (en && fr && !lookup.has(en)) lookup.set(en, fr);
  }
  return lookup;
}

function targetPartsOfSpeech(sentence) {
  const doc = window.nlp(sentence);
  const termData = doc.terms().json({ offset: false })[0]?.terms ?? [];
  const words = new Set();
  for (const term of termData) {
    const tags = term.tags ?? [];
    if (tags.includes("Noun") || tags.includes("Verb")) {
      words.add(term.text.toLowerCase());
    }
  }
  return words;
}

function blendSentence(pair, sentenceIndex, startWordIndex) {
  const phase = getPhase(startWordIndex);

  if (phase.type === "sentence") {
    const sentenceRoll = hashToUnit(`s:${sentenceIndex}:${pair.en}`);
    if (sentenceRoll < phase.sentenceProbability) {
      return `<span class="sentence french-sentence" title="${escapeHtml(pair.en)}">${escapeHtml(pair.fr)}</span>`;
    }
  }

  const tokenProbability = phase.type === "sentence" ? phase.tokenProbability : phase.probability;
  if (tokenProbability <= 0) return `<span class="sentence">${escapeHtml(pair.en)}</span>`;

  const posTargets = targetPartsOfSpeech(pair.en);
  const frLookup = buildFrenchLookup(pair.en, pair.fr);
  const tokenized = pair.en.split(/(\b[\wÀ-ÖØ-öø-ÿ'-]+\b)/g);

  const blended = tokenized.map((piece, tokenIndex) => {
    if (!/^[\wÀ-ÖØ-öø-ÿ'-]+$/.test(piece)) return escapeHtml(piece);
    const lower = piece.toLowerCase();
    if (!posTargets.has(lower)) return escapeHtml(piece);

    const frenchWord = frLookup.get(lower);
    if (!frenchWord) return escapeHtml(piece);

    const roll = hashToUnit(`w:${sentenceIndex}:${tokenIndex}:${piece}`);
    if (roll >= tokenProbability) return escapeHtml(piece);

    return `<span class="french-word" title="${escapeHtml(piece)}">${escapeHtml(frenchWord)}</span>`;
  });

  return `<span class="sentence">${blended.join("")}</span>`;
}

function sentenceWordPrefixCount(text, sentenceCount) {
  let words = 0;
  for (let i = 0; i < sentenceCount; i += 1) {
    words += wordTokens(text.pairs[i].en).length;
  }
  return words;
}

function updateProgress() {
  const wordsRead = sentenceWordPrefixCount(activeText, shownSentenceCount);
  const phase = getPhase(wordsRead);
  progress.textContent = `Showing ${shownSentenceCount}/${activeText.pairs.length} sentences · ${wordsRead} words read · ${phase.label}`;
}

function renderCurrent() {
  if (shownSentenceCount === 0) {
    reader.innerHTML = "<em>Click \"Start text\" to begin from 100% English.</em>";
  } else {
    let wordsSoFar = 0;
    const html = [];
    activeText.pairs.slice(0, shownSentenceCount).forEach((pair, sentenceIndex) => {
      html.push(blendSentence(pair, sentenceIndex, wordsSoFar));
      html.push(" ");
      wordsSoFar += wordTokens(pair.en).length;
    });
    reader.innerHTML = html.join("");
  }

  const atEnd = shownSentenceCount >= activeText.pairs.length;
  startBtn.disabled = shownSentenceCount > 0;
  nextBtn.disabled = atEnd || shownSentenceCount === 0;
  nextFiveBtn.disabled = atEnd || shownSentenceCount === 0;
  resetBtn.disabled = shownSentenceCount === 0;
  updateProgress();
}

function resetText() {
  shownSentenceCount = 0;
  textMeta.textContent = `${activeText.description} ${activeText.source}`;
  renderCurrent();
}

function advanceBy(count) {
  shownSentenceCount = Math.min(activeText.pairs.length, shownSentenceCount + count);
  renderCurrent();
}

for (const text of texts) {
  const option = document.createElement("option");
  option.value = text.id;
  option.textContent = text.title;
  select.append(option);
}

select.addEventListener("change", () => {
  const chosen = texts.find((t) => t.id === select.value);
  if (chosen) {
    activeText = chosen;
    resetText();
  }
});

startBtn.addEventListener("click", () => {
  if (shownSentenceCount === 0) advanceBy(1);
});

nextBtn.addEventListener("click", () => advanceBy(1));
nextFiveBtn.addEventListener("click", () => advanceBy(5));
resetBtn.addEventListener("click", resetText);

select.value = activeText.id;
resetText();
