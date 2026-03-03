const WORDS_PER_PAGE = 120;

const reader = document.querySelector('#reader');
const progress = document.querySelector('#progress');
const startBtn = document.querySelector('#start-btn');
const previousBtn = document.querySelector('#previous-btn');
const nextBtn = document.querySelector('#next-btn');
const resetBtn = document.querySelector('#reset-btn');
const textMeta = document.querySelector('#text-meta');

const state = {
  pairs: [],
  sentenceWordCounts: [],
  pageEnds: [],
  currentPageIndex: -1,
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

function buildPageEnds(wordCounts, minWordsPerPage) {
  const ends = [];
  let i = 0;
  while (i < wordCounts.length) {
    let words = 0;
    let j = i;
    while (j < wordCounts.length && words < minWordsPerPage) {
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

function pageBounds(pageIndex) {
  const end = state.pageEnds[pageIndex];
  const start = pageIndex === 0 ? 0 : state.pageEnds[pageIndex - 1];
  return { start, end };
}

function render() {
  if (state.currentPageIndex < 0) {
    reader.textContent = `Press “Start text” to begin. Each page shows at least ${WORDS_PER_PAGE} words.`;
    progress.textContent = 'Ready to read.';
    previousBtn.disabled = true;
    nextBtn.disabled = state.pageEnds.length === 0;
    return;
  }

  const { start, end } = pageBounds(state.currentPageIndex);
  const html = [];
  let wordsSoFar = state.sentenceWordCounts.slice(0, start).reduce((sum, n) => sum + n, 0);
  let pageWords = 0;

  for (let i = start; i < end; i += 1) {
    const pair = state.pairs[i];
    html.push(blendedSentence(pair, i, wordsSoFar + 1));
    html.push(' ');
    wordsSoFar += state.sentenceWordCounts[i];
    pageWords += state.sentenceWordCounts[i];
  }

  reader.innerHTML = html.join('').trim();

  progress.textContent = `Page ${state.currentPageIndex + 1} of ${state.pageEnds.length} · ${pageWords.toLocaleString()} words on this page.`;

  previousBtn.disabled = state.currentPageIndex <= 0;
  nextBtn.disabled = state.currentPageIndex >= state.pageEnds.length - 1;
}

function goToPage(pageIndex) {
  if (state.pageEnds.length === 0) return;
  state.currentPageIndex = Math.max(0, Math.min(pageIndex, state.pageEnds.length - 1));
  render();
}

function reset() {
  state.currentPageIndex = -1;
  render();
}

async function init() {
  const response = await fetch('./candide_ch1_aligned.json');
  const pairs = await response.json();
  state.pairs = pairs;
  state.sentenceWordCounts = pairs.map(englishWordCount);
  state.pageEnds = buildPageEnds(state.sentenceWordCounts, WORDS_PER_PAGE);
  textMeta.textContent = 'Candide in Franglais. A macaronic experiment in language-learning.';
  reset();
}

startBtn.addEventListener('click', () => goToPage(0));
previousBtn.addEventListener('click', () => goToPage(state.currentPageIndex - 1));
nextBtn.addEventListener('click', () => goToPage(state.currentPageIndex + 1));
resetBtn.addEventListener('click', reset);

init();
