import { texts } from "./texts.js";

const WORDS_PER_CHUNK = 500;
const LEXICON_CONFIG = {
  minimumConfidence: 0.6,
  minimumCooccurrencePairs: 3,
  minimumForwardDominance: 0.7,
  minimumReverseDominance: 0.55,
  unsafeFrenchFanInLimit: 3,
};

const LOCKED_SEED_DICTIONARY = Object.freeze({
  time: "temps",
  year: "annee",
  day: "jour",
  night: "nuit",
  people: "gens",
  man: "homme",
  woman: "femme",
  child: "enfant",
  work: "travail",
  school: "ecole",
  city: "ville",
  village: "village",
  house: "maison",
  family: "famille",
  market: "marche",
  money: "argent",
  food: "nourriture",
  water: "eau",
  read: "lire",
  write: "ecrire",
  learn: "apprendre",
  know: "savoir",
  see: "voir",
  make: "faire",
  build: "construire",
  give: "donner",
  take: "prendre",
  come: "venir",
  go: "aller",
  say: "dire",
});

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
const lexiconInspector = document.querySelector("#lexicon-inspector");
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
  lexiconReport: null,
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
  if (typeof window.nlp !== "function") return [];

  const words = [];
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

  return words;
}

function generateLexiconCode(lockedMappings, learnedMappings) {
  const lines = [
    "// Generated lexicon proposal (review/edit before freezing):",
    "const LOCKED_SEED_DICTIONARY = Object.freeze({",
  ];

  const lockedEntries = Array.from(lockedMappings.entries()).sort(([a], [b]) => a.localeCompare(b));
  for (const [enLemma, frLemma] of lockedEntries) {
    lines.push(`  ${JSON.stringify(enLemma)}: ${JSON.stringify(frLemma)},`);
  }
  lines.push("});");
  lines.push("");
  lines.push("const LEARNED_LEXICON_OVERRIDES = Object.freeze({");

  for (const mapping of [...learnedMappings].sort((a, b) => a.enLemma.localeCompare(b.enLemma))) {
    lines.push(
      `  ${JSON.stringify(mapping.enLemma)}: ${JSON.stringify(mapping.frLemma)}, // conf=${mapping.confidence} pairs=${mapping.cooccurrence}`,
    );
  }
  lines.push("});");

  return lines.join("\n");
}

function buildSemanticLexicon(pairs) {
  const enToFr = new Map();
  const enTotals = new Map();
  const frTotals = new Map();

  for (const pair of pairs) {
    const enContent = extractContentWords(pair.en, "en");
    const frContent = extractContentWords(pair.fr, "fr");
    const enSet = new Set(enContent.map((word) => word.lemma));
    const frSet = new Set(frContent.map((word) => word.lemma));

    for (const enLemma of enSet) {
      enTotals.set(enLemma, (enTotals.get(enLemma) ?? 0) + 1);
      if (!enToFr.has(enLemma)) enToFr.set(enLemma, new Map());
      const candidates = enToFr.get(enLemma);
      for (const frLemma of frSet) {
        candidates.set(frLemma, (candidates.get(frLemma) ?? 0) + 1);
      }
    }

    for (const frLemma of frSet) {
      frTotals.set(frLemma, (frTotals.get(frLemma) ?? 0) + 1);
    }
  }

  const manualLocks = new Map(Object.entries(LOCKED_SEED_DICTIONARY));
  const lexicon = new Map(manualLocks);
  const proposedMappings = [];

  for (const [enLemma, candidates] of enToFr.entries()) {
    if (manualLocks.has(enLemma)) continue;

    let bestFr = null;
    let bestScore = -1;
    let bestCooccurrence = 0;
    let runnerUpScore = -1;

    for (const [frLemma, cooccurrence] of candidates.entries()) {
      const enFreq = enTotals.get(enLemma) ?? 1;
      const frFreq = frTotals.get(frLemma) ?? 1;
      const score = (2 * cooccurrence) / (enFreq + frFreq);

      if (score > bestScore) {
        runnerUpScore = bestScore;
        bestCooccurrence = cooccurrence;
        bestScore = score;
        bestFr = frLemma;
      } else if (score > runnerUpScore) {
        runnerUpScore = score;
      }
    }

    if (!bestFr) continue;

    const enFreq = enTotals.get(enLemma) ?? 1;
    const forwardDominance = bestCooccurrence / enFreq;
    const reverseDominance = bestCooccurrence / (frTotals.get(bestFr) ?? 1);
    const margin = bestScore - Math.max(0, runnerUpScore);

    if (
      bestScore < LEXICON_CONFIG.minimumConfidence ||
      bestCooccurrence < LEXICON_CONFIG.minimumCooccurrencePairs ||
      forwardDominance < LEXICON_CONFIG.minimumForwardDominance ||
      reverseDominance < LEXICON_CONFIG.minimumReverseDominance ||
      margin <= 0
    ) {
      continue;
    }

    proposedMappings.push({
      enLemma,
      frLemma: bestFr,
      confidence: Number(bestScore.toFixed(3)),
      cooccurrence: bestCooccurrence,
      forwardDominance: Number(forwardDominance.toFixed(3)),
      reverseDominance: Number(reverseDominance.toFixed(3)),
    });
  }

  const frenchFanIn = new Map();
  for (const mapping of proposedMappings) {
    const current = frenchFanIn.get(mapping.frLemma) ?? 0;
    frenchFanIn.set(mapping.frLemma, current + 1);
  }

  const acceptedLearned = [];
  const rejectedUnsafe = [];
  for (const mapping of proposedMappings) {
    if ((frenchFanIn.get(mapping.frLemma) ?? 0) > LEXICON_CONFIG.unsafeFrenchFanInLimit) {
      rejectedUnsafe.push(mapping);
      continue;
    }
    acceptedLearned.push(mapping);
    lexicon.set(mapping.enLemma, mapping.frLemma);
  }

  const report = {
    config: LEXICON_CONFIG,
    lockedSeeds: Array.from(manualLocks.entries()).map(([enLemma, frLemma]) => ({ enLemma, frLemma })),
    acceptedLearned,
    rejectedUnsafe,
    generatedCode: generateLexiconCode(manualLocks, acceptedLearned),
  };

  return { lexicon, report };
}

function targetPartsOfSpeech(sentence) {
  const words = new Set();

  if (typeof window.nlp !== "function") return words;

  const doc = window.nlp(sentence);
  const termData = doc.terms().json({ offset: false })[0]?.terms ?? [];
  for (const term of termData) {
    if (!hasNounOrVerbTag(term.tags)) continue;
    const lemma = toSimpleLemma(term.text, "en");
    if (lemma) words.add(lemma);
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
  if (posTargets.size === 0) return `<span class="sentence">${escapeHtml(pair.en)}</span>`;

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

function renderLexiconInspector() {
  if (!lexiconInspector) return;
  if (!state.lexiconReport) {
    lexiconInspector.textContent = "";
    return;
  }

  const { lockedSeeds, acceptedLearned, rejectedUnsafe, generatedCode } = state.lexiconReport;
  lexiconInspector.textContent = [
    `Locked seed mappings: ${lockedSeeds.length}`,
    `Accepted learned mappings: ${acceptedLearned.length}`,
    `Rejected by unsafe substitution detector: ${rejectedUnsafe.length}`,
    "",
    generatedCode,
  ].join("\n");
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
  const { lexicon, report } = buildSemanticLexicon(text.pairs);
  state.bilingualLexicon = lexicon;
  state.lexiconReport = report;
  state.sentenceWordCounts = text.pairs.map((pair) => wordTokens(pair.en).length);
  state.sentenceEndsByChunk = buildChunkEnds(state.sentenceWordCounts, WORDS_PER_CHUNK);
  state.renderedSentenceCount = 0;

  textMeta.textContent = `${text.description} ${text.source}`;
  reader.textContent = `Press “Start text” to begin. The reader reveals at least ${WORDS_PER_CHUNK} words per chunk.`;
  progress.textContent = `Ready: ${text.pairs.length} sentences, ${state.sentenceWordCounts
    .reduce((sum, n) => sum + n, 0)
    .toLocaleString()} words total.`;
  renderLexiconInspector();
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
