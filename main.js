import { texts } from "./texts.js";

const WORDS_PER_CHUNK = 500;
const PHASES = [
  { start: 0, type: "token", probability: 0 },
  { start: 300, type: "token", probability: 0.1 },
  { start: 600, type: "token", probability: 0.2 },
  { start: 800, type: "token", probability: 0.3 },
  { start: 900, type: "token", probability: 0.4 },
  { start: 1000, type: "token", probability: 0.5 },
  { start: 1100, type: "sentence", sentenceProbability: 0.2, tokenProbability: 0.5 },
  { start: 1300, type: "sentence", sentenceProbability: 0.3, tokenProbability: 0.5 },
];

const select = document.querySelector("#text-select");
const reader = document.querySelector("#reader");
const textMeta = document.querySelector("#text-meta");
const progress = document.querySelector("#progress");
const startBtn = document.querySelector("#start-btn");
const nextBtn = document.querySelector("#next-btn");
const nextFiveBtn = document.querySelector("#next-five-btn");
const resetBtn = document.querySelector("#reset-btn");

const state = {
  text: null,
  sentenceWordCounts: [],
  sentenceEndsByChunk: [],
  renderedSentenceCount: 0,
};

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
  const words = new Set();

  if (typeof window.nlp === "function") {
    const doc = window.nlp(sentence);
    const termData = doc.terms().json({ offset: false })[0]?.terms ?? [];
    for (const term of termData) {
      const tags = term.tags ?? [];
      if (tags.includes("Noun") || tags.includes("Verb")) {
        words.add(term.text.toLowerCase());
      }
    }
  }

  if (words.size === 0) {
    for (const token of wordTokens(sentence)) {
      words.add(token.toLowerCase());
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

function buildChunkEnds(wordCounts, minWordsPerChunk) {
  const ends = [];
  let i = 0;
  while (i < wordCounts.length) {
    let words = 0;
    let j = i;
    while (j < wordCounts.length && words < minWordsPerChunk) {
      words += wordCounts[j];
      j += 1;
    }
    ends.push(j);
    i = j;
  }
  return ends;
}

function renderVisibleSentences() {
  if (!state.text) {
    reader.innerHTML = "";
    return;
  }

  let wordsSoFar = 0;
  const html = [];
  for (let i = 0; i < state.renderedSentenceCount; i += 1) {
    const pair = state.text.pairs[i];
    html.push(blendSentence(pair, i, wordsSoFar));
    html.push(" ");
    wordsSoFar += state.sentenceWordCounts[i];
  }

  reader.innerHTML = html.join("").trim();

  const renderedWordCount = state.sentenceWordCounts
    .slice(0, state.renderedSentenceCount)
    .reduce((sum, n) => sum + n, 0);
  const totalWords = state.sentenceWordCounts.reduce((sum, n) => sum + n, 0);
  progress.textContent = `Showing ${renderedWordCount.toLocaleString()} / ${totalWords.toLocaleString()} words (${state.renderedSentenceCount}/${state.text.pairs.length} sentences).`;

  const atEnd = state.renderedSentenceCount >= state.text.pairs.length;
  nextBtn.disabled = atEnd;
  nextFiveBtn.disabled = atEnd;
}

function loadText(text) {
  state.text = text;
  state.sentenceWordCounts = text.pairs.map((pair) => wordTokens(pair.en).length);
  state.sentenceEndsByChunk = buildChunkEnds(state.sentenceWordCounts, WORDS_PER_CHUNK);
  state.renderedSentenceCount = 0;

  textMeta.textContent = `${text.description} ${text.source}`;
  reader.textContent = `Press “Start text” to begin. The reader reveals at least ${WORDS_PER_CHUNK} words per chunk.`;
  progress.textContent = `Ready: ${text.pairs.length} sentences, ${state.sentenceWordCounts
    .reduce((sum, n) => sum + n, 0)
    .toLocaleString()} words total.`;
  nextBtn.disabled = true;
  nextFiveBtn.disabled = true;
}

function advanceChunks(chunkCount) {
  if (!state.text || state.sentenceEndsByChunk.length === 0) return;

  const currentChunkIndex = state.sentenceEndsByChunk.findIndex(
    (end) => end > state.renderedSentenceCount,
  );

  const baseIndex =
    currentChunkIndex === -1
      ? state.sentenceEndsByChunk.length - 1
      : Math.max(0, currentChunkIndex);
  const targetChunkIndex = Math.min(baseIndex + chunkCount - 1, state.sentenceEndsByChunk.length - 1);
  state.renderedSentenceCount = Math.max(
    state.renderedSentenceCount,
    state.sentenceEndsByChunk[targetChunkIndex],
  );

  renderVisibleSentences();
}

startBtn.addEventListener("click", () => {
  if (!state.text) return;
  if (state.renderedSentenceCount === 0) {
    advanceChunks(1);
  }
});

nextBtn.addEventListener("click", () => {
  advanceChunks(1);
});

nextFiveBtn.addEventListener("click", () => {
  advanceChunks(5);
});

resetBtn.addEventListener("click", () => {
  if (!state.text) return;
  loadText(state.text);
});

for (const text of texts) {
  const option = document.createElement("option");
  option.value = text.id;
  option.textContent = text.title;
  select.append(option);
}

select.addEventListener("change", () => {
  const chosen = texts.find((t) => t.id === select.value);
  if (chosen) loadText(chosen);
});

select.value = texts[0].id;
loadText(texts[0]);
