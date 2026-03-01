# Investigation: What this repo is trying to do vs what it currently does

## Intended behavior (probable product goal)
This is a tiny browser app called **Franglais Gradient Reader**.

It appears intended to:
1. Load aligned English/French sentence pairs from a curated text.
2. Reveal the text chunk-by-chunk (500 English words at a time).
3. Start with mostly English, then progressively replace English nouns/verbs with French words.
4. In later phases, occasionally replace whole English sentences with full French sentences.
5. Show the original English in tooltip titles when a French word/sentence appears.

That intent is visible in:
- progressive phase thresholds and probabilities,
- a bilingual lexicon builder,
- token-level replacements and sentence-level replacements,
- UI copy that promises “Start reading in English, then … French words and eventually full French sentences appear.”

## What it *actually* does right now
The current pipeline learns a pseudo-dictionary from **co-occurrence over sentence pairs** and then applies random replacement at render time. In practice, this produces highly unstable, semantically wrong substitutions.

In short: this is a very vibe-coded AI project, and the current alignment logic is sloppy and broken.

### Why the output fails in a predictable way
The lexicon maps each English lemma to the single French lemma with the best local co-occurrence score from the tiny dataset.

That means:
- It does not align tokens positionally.
- It does not account for word order, syntax, or phrase boundaries.
- It does not penalize hub words strongly enough.
- It does not model polysemy (one English lemma can map to many French words by context).
- It does not model morphology robustly (very naive suffix stripping).
- It can select semantically unrelated words that merely co-occur in the same sentence-level topics.

The result is systematic nonsense substitutions such as:
- `question -> deux`
- `ledger -> deux`
- `municipal -> boulangerie`
- `attic -> magistrat`
- `mechanical -> medecin`
- `same -> medecin`
- `coffee -> serrurier`

These are not one-off bugs; they are a direct consequence of the current algorithmic assumptions.

## Detailed challenges of EN↔FR alignment this project currently ignores

### 1) One-to-many and many-to-one mappings
English and French do not align 1:1 by token. Articles, contractions, and clitics differ (`of the` vs `du`, `to the` vs `au`). A naive lemma-to-lemma dictionary learned from sentence co-occurrence will often pick wrong hubs.

### 2) Morphology and inflection
French inflects verbs richly and marks gender/number agreements. English surface forms and French surface forms won’t line up without proper lemmatization and tagging. Naive suffix chopping (`-s`, `-ing`, `-ent`, etc.) creates non-lemmas and collisions.

### 3) Word sense disambiguation
Words like “fair”, “archive”, “charge”, etc. need context. Co-occurrence over a short corpus cannot disambiguate reliably.

### 4) Multiword expressions and compounds
Many translations are phrasal, not lexical (`schoolroom`, `winter fair`, `municipal court`, etc.). The system only swaps single tokens, causing phrase breakage.

### 5) Domain/topic bias from tiny corpora
With a small handcrafted corpus, topic words become attractors. If “serrurier” appears in a sentence cluster that also has “coffee”, the model may map unrelated words to it.

### 6) POS tagging mismatch
The app depends on compromise.js tags for both languages, but compromise is primarily English-focused; French tagging quality is weaker, so the extracted “content words” are noisy.

## Specific notes on the provided broken output sample
Given sample:

> "A locksmith from Rouen traded polished hinges for coffee, then argued that imported beans changed conversation because neighbors lingered over cups instead of rushing toward workshops. In the schoolroom, a widow copied navigation tables while children traced salle from salle, transport curve corrected by sailors who had survived storms beyond Newfoundland. Two brothers carried a deux astrolabe through muddy alleys, deux demonstrations in exchange for candles and municipale every deux question dan a deux ledger. During the winter fair, musicians from Lyon tuned violins beside spice stalls, blending dance rhythms with sermons that warned against vanity and encouraged practical charity. A retired magistrat opened his attic archive, letting apprentices inspect magistrat court sketches that revealed how grenier disguised magistrat beneath ornate signatures. By lueur, lueur comparer imported cotton with local linen, debating whether lighter cloth represented progress or merely another burden for underpaid hands. A village physician documented medecin remedies et mechanical experiments in la same notebook, medecin that gears and roots both obeyed patterns waiting to be named."

Notable errors and likely mechanism:
- `transport curve` likely from `curve -> salle` mismatch (co-occurrence hallucination).
- `deux astrolabe`, `deux question`, `deux ledger` come from high-frequency `two/deux` contamination into unrelated lemmas.
- `municipale` inserted mid-English sentence indicates raw lemma substitution without agreement/case handling.
- `magistrat ... attic archive ... magistrat` indicates collapse of several English lemmas onto one French attractor (`attic -> magistrat`, `archive -> magistrat`).
- `grenier disguised magistrat` shows random lexical replacement plus broken semantics.
- `By lueur, lueur comparer` looks like a malformed French fragment inserted into English syntax.
- `physician documented medecin remedies et mechanical experiments in la same notebook` is mixed-language ungrammatical code-switching caused by per-token replacement without syntactic repair.

## High-probability technical root causes in this repo
1. Sentence-level co-occurrence lexicon is too weak for translation.
2. Naive lemmatization creates collisions and wrong stems.
3. French NLP quality via compromise is unreliable.
4. No confidence threshold / backoff strategy (it replaces even dubious mappings).
5. No lexical blacklist/whitelist for function words and numerals.
6. No alignment constraints (position, attention, dictionary priors).
7. Deterministic hash-based replacement adds consistency, but consistently wrong substitutions remain wrong.

## Suggestions to make it less broken (ordered by effort/impact)

### Low effort (immediate damage control)
1. Add a minimum confidence threshold on lexicon entries; if below threshold, keep English.
2. Blacklist numerals/function words from being replacement targets (`one/two/the/and/etc.`).
3. Restrict replacement to only entries that appear as near-1:1 across many pairs.
4. Add manual seed dictionary for high-frequency core vocabulary and lock those mappings.
5. Add an “unsafe substitution detector” (e.g., if one French lemma is mapped from too many English lemmas, reject it).

### Medium effort
1. Replace custom co-occurrence with token alignment from a standard aligner (e.g., fast_align style pipeline).
2. Use real lemmatizers/POS taggers for each language (spaCy en/fr models, Stanza, UDPipe).
3. Support phrase-level replacements (n-gram or alignment spans), not only single tokens.
4. Separate content words from named entities and protect proper nouns from arbitrary replacement.

### Higher effort (best quality)
1. Use bilingual embeddings (or small MT model attention) for lexical candidate generation.
2. Score candidates with context windows and POS compatibility.
3. Evaluate with a held-out gold lexicon and sentence-level acceptability checks.
4. Add regression tests with known bad examples (including the sample in this report).

## Bottom line
The product idea is good for language learning UX, but the current “semantic mapping” is not translation and predictably produces nonsense Franglais. The failure mode is architectural, not cosmetic.
