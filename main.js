import { texts } from "./texts.js";

const WORDS_PER_CHUNK = 500;
const PHASES = [
  { start: 0, type: "token", probability: 0 },
  { start: 50, type: "token", probability: 0.1 },
  { start: 250, type: "token", probability: 0.2 },
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
  bilingualLexicon: new Map(),
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

function normalizeToken(token) {
  return token
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z'-]/g, "");
}

function toSimpleLemma(token, language) {
  let lemma = normalizeToken(token);
  if (!lemma) return "";

  const suffixes =
    language === "en"
      ? ["ingly", "ation", "ments", "ement", "ingly", "lessly", "ed", "ing", "es", "s"]
      : ["ements", "ement", "ations", "ation", "aient", "ions", "ait", "ent", "es", "s"];

  for (const suffix of suffixes) {
    if (lemma.length > suffix.length + 2 && lemma.endsWith(suffix)) {
      lemma = lemma.slice(0, -suffix.length);
      break;
    }
  }

  return lemma;
}

function hasNounOrVerbTag(tags = []) {
  return tags.includes("Noun") || tags.includes("Verb") || tags.includes("Infinitive") || tags.includes("Gerund");
}

function extractContentWords(sentence, language) {
  const words = [];

  if (typeof window.nlp === "function") {
    const doc = window.nlp(sentence);
    const termData = doc.terms().json({ offset: false })[0]?.terms ?? [];
    for (const term of termData) {
      if (!hasNounOrVerbTag(term.tags)) continue;
      const text = term.normal || term.text;
      const lemma = toSimpleLemma(text, language);
      if (lemma) {
        words.push({ lemma, original: term.text });
      }
    }
  }

  if (words.length === 0) {
    for (const token of wordTokens(sentence)) {
      const lemma = toSimpleLemma(token, language);
      if (lemma) words.push({ lemma, original: token });
    }
  }

  return words;
}

function buildSemanticLexicon(pairs) {
  const preparedPairs = pairs
    .map((pair) => {
      const enLemmas = [...new Set(extractContentWords(pair.en, "en").map((word) => word.lemma))];
      const frLemmas = [...new Set(extractContentWords(pair.fr, "fr").map((word) => word.lemma))];
      return { enLemmas, frLemmas };
    })
    .filter((pair) => pair.enLemmas.length > 0 && pair.frLemmas.length > 0);

  const frVocabulary = new Set();
  for (const pair of preparedPairs) {
    for (const frLemma of pair.frLemmas) {
      frVocabulary.add(frLemma);
    }
  }

  const uniform = 1 / Math.max(frVocabulary.size, 1);
  const translationProbabilities = new Map();

  for (const pair of preparedPairs) {
    for (const enLemma of pair.enLemmas) {
      if (!translationProbabilities.has(enLemma)) {
        const candidates = new Map();
        for (const frLemma of pair.frLemmas) {
          candidates.set(frLemma, uniform);
        }
        translationProbabilities.set(enLemma, candidates);
        continue;
      }

      const candidates = translationProbabilities.get(enLemma);
      for (const frLemma of pair.frLemmas) {
        if (!candidates.has(frLemma)) candidates.set(frLemma, uniform);
      }
    }
  }

  const ITERATIONS = 8;
  for (let step = 0; step < ITERATIONS; step += 1) {
    const expectedCounts = new Map();
    const totalsByEnglish = new Map();

    for (const pair of preparedPairs) {
      for (const frLemma of pair.frLemmas) {
        let normalization = 0;
        for (const enLemma of pair.enLemmas) {
          normalization += translationProbabilities.get(enLemma)?.get(frLemma) ?? 0;
        }

        if (normalization <= 0) continue;

        for (const enLemma of pair.enLemmas) {
          const probability = translationProbabilities.get(enLemma)?.get(frLemma) ?? 0;
          if (probability <= 0) continue;
          const posterior = probability / normalization;

          if (!expectedCounts.has(enLemma)) expectedCounts.set(enLemma, new Map());
          const bucket = expectedCounts.get(enLemma);
          bucket.set(frLemma, (bucket.get(frLemma) ?? 0) + posterior);
          totalsByEnglish.set(enLemma, (totalsByEnglish.get(enLemma) ?? 0) + posterior);
        }
      }
    }

    for (const [enLemma, frCounts] of expectedCounts.entries()) {
      const total = totalsByEnglish.get(enLemma) ?? 0;
      if (total <= 0) continue;
      const probs = translationProbabilities.get(enLemma);
      for (const [frLemma, count] of frCounts.entries()) {
        probs.set(frLemma, count / total);
      }
    }
  }

  const lexicon = new Map();
  for (const [enLemma, frProbs] of translationProbabilities.entries()) {
    let bestFr = null;
    let bestProbability = 0;
    for (const [frLemma, probability] of frProbs.entries()) {
      if (probability > bestProbability) {
        bestProbability = probability;
        bestFr = frLemma;
      }
    }

    if (bestFr && bestProbability > 0) {
      lexicon.set(enLemma, bestFr);
    }
  }

  return lexicon;
}

function targetPartsOfSpeech(sentence) {
  const words = new Set();

  if (typeof window.nlp === "function") {
    const doc = window.nlp(sentence);
    const termData = doc.terms().json({ offset: false })[0]?.terms ?? [];
    for (const term of termData) {
      const tags = term.tags ?? [];
      if (tags.includes("Noun") || tags.includes("Verb")) {
        const lemma = toSimpleLemma(term.text, "en");
        if (lemma) words.add(lemma);
      }
    }
  }

  if (words.size === 0) {
    for (const token of wordTokens(sentence)) {
      const lemma = toSimpleLemma(token, "en");
      if (lemma) words.add(lemma);
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
  const tokenized = pair.en.split(/(\b[\wÀ-ÖØ-öø-ÿ'-]+\b)/g);

  const blended = tokenized.map((piece, tokenIndex) => {
    if (!/^[\wÀ-ÖØ-öø-ÿ'-]+$/.test(piece)) return escapeHtml(piece);
    const lemma = toSimpleLemma(piece, "en");
    if (!posTargets.has(lemma)) return escapeHtml(piece);

    const frenchWord = state.bilingualLexicon.get(lemma);
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
  state.bilingualLexicon = buildSemanticLexicon(text.pairs);
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
