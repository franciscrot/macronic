const WORDS_PER_CHUNK = 120;

const reader = document.querySelector('#reader');
const progress = document.querySelector('#progress');
const startBtn = document.querySelector('#start-btn');
const nextBtn = document.querySelector('#next-btn');
const nextFiveBtn = document.querySelector('#next-five-btn');
const resetBtn = document.querySelector('#reset-btn');
const textMeta = document.querySelector('#text-meta');

const state = {
  pairs: [],
  sentenceWordCounts: [],
  chunkEnds: [],
  renderedSentenceCount: 0,
  alignmentReport: null,
};

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
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function isWord(token) {
  return /^[A-Za-zÀ-ÖØ-öø-ÿ'-]+$/.test(token);
}

function isContentPos(posTag) {
  return posTag === 'N' || posTag === 'V';
}

function joinUnits(units) {
  let result = '';
  for (const unit of units) {
    if (!result) {
      result = unit;
      continue;
    }

    if (/^[,.;:!?)]$/.test(unit)) {
      result += unit;
    } else if (/^['’]$/.test(unit)) {
      result += unit;
    } else if (result.endsWith("'") || result.endsWith('’') || result.endsWith('(')) {
      result += unit;
    } else {
      result += ` ${unit}`;
    }
  }
  return result;
}

function englishWordCount(pair) {
  return pair.en_units.filter((unit) => isWord(unit)).length;
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

function phaseForWord(wordNumber) {
  if (wordNumber <= 50) {
    return { type: 'token', tokenProbability: 0 };
  }
  if (wordNumber <= 150) {
    return { type: 'token', tokenProbability: 0.1 };
  }
  if (wordNumber <= 300) {
    return { type: 'token', tokenProbability: 0.4 };
  }
  return { type: 'sentence', sentenceProbability: 0.2, tokenProbability: 0.4 };
}

function mappedFrenchToken(pair, englishIndex) {
  const englishPos = pair.en_pos[englishIndex] ?? 'O';
  const directToken = mappedFrenchTokenFromAlignment(pair, englishIndex, englishPos);
  if (directToken) return directToken;

  return mappedFrenchTokenByProjection(pair, englishIndex, englishPos);
}

function mappedFrenchTokenFromAlignment(pair, englishIndex, englishPos) {
  const alignment = pair.align?.[String(englishIndex + 1)] ?? [];
  let fallback = null;

  for (const frIndex1 of alignment) {
    const frIndex = frIndex1 - 1;
    if (frIndex < 0 || frIndex >= pair.fr_units.length) continue;

    const token = pair.fr_units[frIndex];
    if (!isWord(token)) continue;

    const frenchPos = pair.fr_pos[frIndex] ?? 'O';
    if (frenchPos === englishPos) return token;
    if (!fallback) fallback = token;
  }

  return fallback;
}

function mappedFrenchTokenByProjection(pair, englishIndex, englishPos) {
  const anchors = [];

  for (const [enIndex1, frIndexes1] of Object.entries(pair.align ?? {})) {
    const enIndex = Number(enIndex1) - 1;
    for (const frIndex1 of frIndexes1) {
      const frIndex = frIndex1 - 1;
      if (enIndex < 0 || frIndex < 0 || frIndex >= pair.fr_units.length) continue;
      if (!isWord(pair.fr_units[frIndex])) continue;
      anchors.push({ enIndex, frIndex });
      break;
    }
  }

  if (anchors.length === 0) return null;
  anchors.sort((a, b) => a.enIndex - b.enIndex);

  let left = null;
  let right = null;
  for (const anchor of anchors) {
    if (anchor.enIndex <= englishIndex) {
      left = anchor;
      continue;
    }
    right = anchor;
    break;
  }

  let projectedFrIndex;
  if (left && right && right.enIndex !== left.enIndex) {
    const ratio = (englishIndex - left.enIndex) / (right.enIndex - left.enIndex);
    projectedFrIndex = Math.round(left.frIndex + ratio * (right.frIndex - left.frIndex));
  } else if (left) {
    projectedFrIndex = left.frIndex + (englishIndex - left.enIndex);
  } else {
    projectedFrIndex = right.frIndex - (right.enIndex - englishIndex);
  }

  const maxRadius = Math.max(5, Math.ceil(pair.fr_units.length / 8));
  let nearestFallback = null;

  for (let radius = 0; radius <= maxRadius; radius += 1) {
    for (const offset of [0, -radius, radius]) {
      const frIndex = projectedFrIndex + offset;
      if (frIndex < 0 || frIndex >= pair.fr_units.length) continue;

      const token = pair.fr_units[frIndex];
      if (!isWord(token)) continue;

      const frenchPos = pair.fr_pos[frIndex] ?? 'O';
      if (frenchPos === englishPos) return token;
      if (!nearestFallback) nearestFallback = token;
    }
  }

  return nearestFallback;
}

function buildAlignmentReport(pairs) {
  let contentWords = 0;
  let directHits = 0;
  let projectedHits = 0;

  for (const pair of pairs) {
    for (let index = 0; index < pair.en_units.length; index += 1) {
      const token = pair.en_units[index];
      const pos = pair.en_pos[index] ?? 'O';
      if (!isWord(token) || !isContentPos(pos)) continue;

      contentWords += 1;
      if (mappedFrenchTokenFromAlignment(pair, index, pos)) {
        directHits += 1;
      } else if (mappedFrenchTokenByProjection(pair, index, pos)) {
        projectedHits += 1;
      }
    }
  }

  return {
    contentWords,
    directHits,
    projectedHits,
    totalHits: directHits + projectedHits,
  };
}

function blendedSentence(pair, sentenceIndex, sentenceStartWordNumber) {
  const phase = phaseForWord(sentenceStartWordNumber);

  if (phase.type === 'sentence') {
    const sentenceRoll = hashToUnit(`sentence:${sentenceIndex}:${pair.id}`);
    if (sentenceRoll < phase.sentenceProbability) {
      return `<span class="sentence french-sentence" title="${escapeHtml(pair.en_sentence)}">${escapeHtml(pair.fr_sentence)}</span>`;
    }
  }

  const outputUnits = pair.en_units.map((unit, index) => {
    const pos = pair.en_pos[index] ?? 'O';
    if (!isWord(unit) || !isContentPos(pos)) return escapeHtml(unit);

    const frenchToken = mappedFrenchToken(pair, index);
    if (!frenchToken) return escapeHtml(unit);

    const tokenRoll = hashToUnit(`token:${sentenceIndex}:${index}:${unit}`);
    if (tokenRoll >= phase.tokenProbability) return escapeHtml(unit);

    return `<span class="french-word" title="${escapeHtml(unit)}">${escapeHtml(frenchToken)}</span>`;
  });

  return `<span class="sentence">${joinUnits(outputUnits)}</span>`;
}

function render() {
  const html = [];
  let wordsSoFar = 0;

  for (let i = 0; i < state.renderedSentenceCount; i += 1) {
    const pair = state.pairs[i];
    html.push(blendedSentence(pair, i, wordsSoFar + 1));
    html.push(' ');
    wordsSoFar += state.sentenceWordCounts[i];
  }

  reader.innerHTML = html.join('').trim();

  const totalWords = state.sentenceWordCounts.reduce((sum, n) => sum + n, 0);
  progress.textContent = `Showing ${wordsSoFar.toLocaleString()} / ${totalWords.toLocaleString()} words (${state.renderedSentenceCount}/${state.pairs.length} sentences).`;

  const atEnd = state.renderedSentenceCount >= state.pairs.length;
  nextBtn.disabled = atEnd;
  nextFiveBtn.disabled = atEnd;
}

function advanceChunks(chunkCount) {
  if (state.chunkEnds.length === 0) return;

  const currentChunkIndex = state.chunkEnds.findIndex((end) => end > state.renderedSentenceCount);
  const baseIndex = currentChunkIndex === -1 ? state.chunkEnds.length - 1 : Math.max(0, currentChunkIndex);
  const targetChunkIndex = Math.min(baseIndex + chunkCount - 1, state.chunkEnds.length - 1);
  state.renderedSentenceCount = Math.max(state.renderedSentenceCount, state.chunkEnds[targetChunkIndex]);

  render();
}

function reset() {
  state.renderedSentenceCount = 0;
  reader.textContent = `Press “Start text” to begin. The reader reveals at least ${WORDS_PER_CHUNK} words per chunk.`;
  const totalWords = state.sentenceWordCounts.reduce((sum, n) => sum + n, 0);
  const alignment = state.alignmentReport;
  const alignmentSummary = alignment
    ? ` Content-word mapping: ${alignment.totalHits}/${alignment.contentWords} (${alignment.directHits} direct + ${alignment.projectedHits} projected fallback).`
    : '';
  progress.textContent = `Ready: ${state.pairs.length} sentences, ${totalWords.toLocaleString()} words total.${alignmentSummary}`;
  nextBtn.disabled = true;
  nextFiveBtn.disabled = true;
}

async function init() {
  const response = await fetch('./candide_ch1_aligned.json');
  const pairs = await response.json();
  state.pairs = pairs;
  state.sentenceWordCounts = pairs.map(englishWordCount);
  state.chunkEnds = buildChunkEnds(state.sentenceWordCounts, WORDS_PER_CHUNK);
  state.alignmentReport = buildAlignmentReport(pairs);
  textMeta.textContent = 'Candide, Chapter 1 aligned English/French sentence pairs.';
  reset();
}

startBtn.addEventListener('click', () => {
  if (state.renderedSentenceCount === 0) advanceChunks(1);
});
nextBtn.addEventListener('click', () => advanceChunks(1));
nextFiveBtn.addEventListener('click', () => advanceChunks(5));
resetBtn.addEventListener('click', reset);

init();
