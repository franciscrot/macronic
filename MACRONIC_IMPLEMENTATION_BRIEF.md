> Design brief retained for context. README.md records the implemented behavior, actual results and recovery limitations.

# Macronic: Bertalign-led implementation brief

Revised 14 September 2026 following the decision to build around Bertalign. This replaces the earlier dictionary-led, manually approved workflow in this document. The next coding phase should demonstrate good automatic alignments before investing heavily in the reader interface.

Baseline reviewed: [draft PR #15](https://github.com/franciscrot/macronic/pull/15), head `94b8eef1ef6673cefdb31772a98791f8a70b1917`. This document is an implementation brief, not a claim that these tools have been installed or tested on the repository. No repository changes or deployment accompany this revision.

**1. Architecture and scope**

Use Bertalign to align the opening chapter of the selected English and French editions of *Candide*. Use SimAlign to propose contextual word links inside those aligned passages. Apply conservative automatic checks to identify the subset suitable for the macaronic reader. Provide a small correction tool for residual errors. Publish about ten consecutive opening passages as the initial demonstration.

| Layer | Initial choice | Purpose |
|---|---|---|
| Passage alignment | Bertalign, pinned code and embedding-model revision | Align sentence groups using semantic similarity and narrative sequence. |
| Word alignment | SimAlign with multilingual BERT; start with its `inter`/Argmax output | Produce contextual links without training a new model. |
| Linguistic checks | Pinned English/French NLP pipelines, initially spaCy | Supply token boundaries, lemmas, morphology and dependency/POS diagnostics. |
| Dictionary evidence | Compact FreeDict subset from a pinned release | Corroborate candidate senses and show lexical evidence during correction. |
| Preparation | Python in an isolated, locked environment | Run the NLP tools once per source/configuration change. |
| Reader and workshop | Plain HTML, CSS and JavaScript modules | Display prepared text and edit corrections without a runtime model or backend. |
| Build/test | Small Node scripts, Node tests, a small Playwright suite | Validate data, generate the static artifact and test interactions. |
| Deployment | GitHub Pages at `/macronic/prototype/` | Keep hosting simple and preserve the existing root reader. |

Bertalign supports multilingual sentence embeddings and one-to-many/many-to-many alignment through a two-step dynamic-programming procedure. English and French are supported. These are reasons to select it, not evidence of its accuracy on this particular text. [Bertalign documentation](https://github.com/bfsujason/bertalign)

SimAlign fills a separate need: Bertalign does not provide the word correspondences required by this reader. Its documentation exposes word-index links and several matching methods. Begin with one configuration, not a multi-aligner voting system. [SimAlign documentation](https://github.com/cisnlp/simalign)

Keep three concepts separate in all code and data: passage correspondence, word/phrase correspondence, and suitability for substitution. A correct translation alignment does not necessarily support an isolated French insertion.

**2. Explicit changes to the original specification**

When implementing, update `PROTOTYPE_SPEC.md` alongside the code so that it no longer contradicts these decisions. Preserve its historical audit as a dated section.

- Replace “ten corresponding sentence pairs” with “about ten opening aligned passages, each containing one or more sentences per language”. Prepare the whole chapter for context and evaluation.
- Replace dictionary-generated candidate links with Bertalign passage groups followed by contextual word alignment. Keep dictionary evidence as a check.
- Replace obligatory human approval of every link with explicit machine acceptance under a tested policy, plus editorial corrections and a bounded release check. Never label machine acceptance as human review.
- Replace the read-only JSON inspector with an editable correction interface using JSON import/export.
- Preserve one-word insertion as the first public display mode. Store and inspect multiword links now, without assuming that isolated words are the natural units of translation.

Preserve exact source wording, permission to abstain, explicit evidence, deterministic rendering, and the prohibition on positional word projection. There is no coverage target that can authorise a doubtful replacement.

**3. Passage alignment with Bertalign**

Establish the exact source editions, translator, URLs and reuse basis. Save immutable UTF-8 source snapshots and checksums. Existing repository texts can be reused after verification; existing alignment links cannot be imported as trusted output. Store headings separately from narrative content.

Segment the chapter while retaining a reversible map to original source offsets. Preserve paragraphs as context and diagnostics; do not force identical paragraph counts. Configure the selected Bertalign revision to consume the prepared segmentation where supported, or reconcile its segmentation with the source explicitly. Do not silently strip punctuation or normalise source text to make indices fit.

Run Bertalign across the chapter. Persist its raw sentence-index groups and the exact configuration. Permit 1:1, 1:many and many:many passage groups. Represent omitted or unmatched text explicitly; check how the pinned implementation handles skips rather than assuming a particular API. Never force a correspondence solely to avoid gaps. Monotonic narrative alignment is an appropriate default; flag evidence of substantial reordering instead of forcing it through.

The adapter must check source coverage, duplicated sentences, impossible indices and overlapping groups. Add diagnostic signals for weak group similarity, nearby alternative groupings, unusually large merges and extreme length imbalance. These are proposed adapter checks, not claims that Bertalign returns calibrated confidence or alternative paths. Compute only signals that can be obtained and documented from the pinned implementation. Call a similarity a similarity, not a probability of correctness.

Keep uncertain groups visible in the workshop. They can remain English in the reader. A rejected grouping must not remove its English text from the reading sequence.

**4. Contextual word alignment and substitution checks**

Run SimAlign within each usable passage group. Pass occurrence-specific tokens and map its results back to exact spans, retaining subword-to-word mappings. Explicitly detect model input-length limits; do not accept silently truncated passages. Flag oversized groups for a boundary correction or an explicitly tested subdivision.

Store the complete candidate links, including multiword relationships. A group of word links is evidence for a possible phrase relation, not automatically a validated idiom. The workshop must also support directly recording a phrase span. Do not force an expression such as “was hungry” into a standalone equivalent for “hungry”.

Generate annotations automatically. Use POS/morphology as diagnostics for correspondence, and stricter filters for isolated substitution. A valid translation can change grammatical construction; preserve those links while marking them unsuitable for the initial display mode.

Build an initial acceptance policy with these requirements:

1. The passage passes the calibrated passage checks or has a current editorial correction.
2. A one-word substitution has one unambiguous English occurrence and one French occurrence, with no unresolved competing or overlapping links.
3. Contextual alignment evidence is present. Dictionary lemma/sense evidence corroborates automatically accepted insertions; missing dictionary support sends the candidate to the uncertain queue, without deleting a potentially correct alignment.
4. The surface forms and automatic linguistic checks fit the tested eligible category. Begin by evaluating simple noun substitutions; add other categories only when the diagnostic sample supports them. Exclude contractions, multiword dependencies, uncertain senses, tense/agreement problems and identical-surface “substitutions” from automatic insertion.
5. The generated combination passes structural checks and belongs to a release configuration that has passed the evaluation below.

Dictionary membership and matching POS do not prove contextual correctness. The first release must measure the failures these checks leave behind. If the pipeline is too sparse, improve its analysis or use of phrases in a later slice; do not quietly relax precision to make the demo busy.

Cache dictionary entries with source identifiers, sense locators, release/checksum and licence. A small targeted FreeDict extraction is sufficient initially. Do not build a second dictionary integration or a large lexical database merely to fill gaps. [FreeDict downloads](https://freedict.org/downloads/)

**5. Evidence and quality gates before interface polish**

First deliver the chapter's raw automatic output and an error report. Evaluation must distinguish raw output, filtered output and editor-corrected output. Otherwise manual repair can conceal a poor automatic method.

Create a bounded reference sample: start with about twenty passage groups where available, covering ordinary prose, dialogue, splits/merges, repeated words and idiomatic constructions. Use roughly half for development and reserve the rest before tuning. If the chapter lacks enough varied material, add a small diagnostic excerpt from the next chapter; keep the reader demo at the opening. Record who checked the reference and any ambiguous gold links. AI output alone is not ground truth.

Measure:

| Measure | What it reveals |
|---|---|
| Exact sentence-group matches, plus missed/duplicated text | Passage alignment quality and catastrophic shifts. |
| Word-link precision and recall against the reference | Both incorrect links and excessive abstention. |
| Correct usable insertions / proposed insertions | Whether alignment actually supports this product. |
| Number and distribution of usable insertions | Whether the reader offers meaningful French exposure. |
| Corrections and correction time per passage | Whether the automatic output reduces editorial work. |
| Preparation time, memory and model-download size | The actual cost of the chosen stack. |

Use the held-out sample to assess the fixed policy, not tune it. If it exposes a failure requiring tuning, treat it as development data and obtain another small check sample. Report counts and uncertainty; a small zero-error sample is not proof of 99% precision. Do not invent a confidence threshold in advance and describe it as empirically validated.

For the first ten-passage release, do one complete reading of the generated blended versions and fix any visible meaning errors. Record one dataset-level release check rather than hundreds of repetitive approval records. This limited product check complements evaluation of the automatic alignments. It is not the mechanism for constructing them.

The first release requires correct passage grouping in its displayed sample, no known wrong displayed substitutions, and a useful distributed set of insertions demonstrated in the preview. Report the actual count and distribution for review. An English-only output may pass structural tests but does not satisfy the product goal. If high precision can be obtained only with almost no usable output, report that as a pipeline limitation and improve it before polishing or publishing.

**6. Correction workflow**

Build a local workshop that displays the automatic alignment first, with uncertainty filters and side-by-side text. Support these operations:

- Split or merge adjacent passage groups and mark omissions/unmatched sentences.
- Select English and French word or phrase spans to add, move or remove a link.
- Accept or reject a candidate, separately mark substitution suitability, and record a short reason when needed.
- Preview the full blended passage at each stage and disable an unsuitable insertion.
- Undo session edits, import saved corrections and export a versioned JSON correction file.

Export is an explicit save action. Show unsaved edits and warn on leaving with changes. Imported files must pass schema and source-fingerprint checks before application. Applying a correction file through the preparation command validates and commits it into the data pipeline; a browser edit alone never changes the published reader. No backend, login or GitHub credentials in the browser are needed.

Store corrections separately from immutable machine output. Recomputing the pipeline must preserve matching corrections, invalidate affected stale corrections visibly, and never overwrite them silently. Passage-boundary changes invalidate downstream word links for the affected groups and require recomputation. Rejections take precedence over automatic acceptance.

**7. Small, explicit data contract**

Use exact `.txt` source files and pretty-printed JSON with `schema_version: 1`. No database. Keep the original directory structure with clarified responsibilities.

| Directory | Contents |
|---|---|
| `data/sources/` | Source texts, provenance and hashes. |
| `data/samples/` | Sentence segmentation, original ranges and occurrence-specific tokens. |
| `data/candidates/` | Immutable Bertalign and SimAlign runs and run manifests. |
| `data/evidence/` | NLP annotations, dictionary entries, diagnostics, evaluation results and acceptance policy. |
| `data/reviewed/` | Human corrections and dataset-level release checks. |
| `data/reader/` | Generated texts, eligible replacements, stage membership and traceable evidence IDs. |

Core records are `passage` (arrays of sentence IDs in both languages), `link` (arrays of occurrence token IDs), `evidence`, `decision` and `run`. Use `proposed`, `needs_review`, `approved`, `rejected`, with a separate `safe_for_substitution` boolean. Approved decisions require `decision_origin: automatic | human`; automatic decisions name the tested policy/run, while human decisions name the editor. Missing status or safety cannot enable substitution.

Every run identifies source hashes, code revision, model identifiers/revisions, tokenizer configuration, parameters and environment. Every decision/correction references an input fingerprint. Do not fabricate scores, human names or provenance. Machine re-evaluation may issue a new machine decision but must never refresh a stale human decision.

Use zero-based, end-exclusive Unicode code-point offsets in the Python preparation data. The JavaScript renderer must explicitly convert these offsets or slice via code-point arrays; JavaScript's native string indices are UTF-16 and are not interchangeable. Test non-BMP characters. Source hashes cover original UTF-8 bytes. Token surface text must exactly match its recorded range. Normalisation for model input requires an explicit mapping back to these ranges.

Deterministically derive display text from exact English ranges and exact French source spans. Preserve original whitespace and punctuation outside replacements. Do not join tokens to reconstruct prose or rewrite French forms automatically. Avoid overlapping replacements and reuse of French occurrences in a stage. Preserve original English paragraph order even when French grouping differs.

**8. Reader, tooling and deployment**

Show three deterministic stages over the sample: English, a little French, more French. Generate nested subsets from eligible links using a documented stable order. No random coverage filling. Keep phrase and sentence replacement out of the first public mode, while retaining those relationships in the workshop/data.

Hover, keyboard focus and tap reveal the original English for a French insertion. Use visible focus, dismissible explanations and `lang="fr"`. Use DOM text nodes. Invalid data shows a clear error; unsupported links leave English. There are no external calls at reading time.

Lock the Python tools and model revisions after a small installation/run check. Use a supported compatible environment, not an untested copy of old README dependency versions. Start on CPU and measure performance. Cache model files outside Git, document initial downloads, retain upstream licences and use explicit preparation commands. Do not train models or introduce hosted inference for this phase.

Separate expensive inference from normal builds. Commit the small prepared outputs and run manifests; ordinary PR checks regenerate reader JSON from those outputs without downloading models. Re-running inference may vary across devices; record it as a new run. Identical frozen prepared data and policy must yield identical reader JSON.

| Command to implement | Responsibility |
|---|---|
| `python -m pipeline.prepare` | Segment sources, run Bertalign then SimAlign, annotate and save raw evidence. |
| `python -m pipeline.evaluate` | Compare raw and filtered results against the versioned reference. |
| `python -m pipeline.apply_corrections FILE` | Validate/import corrections, rejecting stale or invalid references; identify affected recomputation. |
| `npm run validate` | Check data structure, offsets, decisions, policy/run references and release freshness. |
| `npm run generate` | Derive reader JSON deterministically from frozen outputs and current decisions. |
| `npm test` | Data, policy and rendering regression tests. |
| `npm run dev` | Local reader and editable workshop with import/export. |
| `npm run build` | Validate, generate and create a clean allowlisted `dist/`. |
| `npm run preview` | Serve the artifact mounted at `/macronic/`. |
| `npm run test:browser` | Check stage controls, explanations, correction persistence and asset paths. |

Test source round trips, sentence merges/splits/skips, model truncation rejection, apostrophes, repeated words, incompatible links, stale corrections, rejection precedence and phrase exclusion from single-word mode. Test import/export round trips and that changed passage boundaries invalidate downstream links. Test empty eligible sets without treating them as a successful product demonstration. Keep a negative fixture for the legacy “WAS” → “Comment” error. Structural tests verify the gates; the reference sample evaluates linguistic quality.

On PRs, run the small Python adapter tests with frozen model-output fixtures, Node tests, generation-diff checks and browser tests. Run real inference/evaluation explicitly when sources, models or pipeline policy change, and include the report in that PR. Use a dependency fingerprint so a relevant change cannot reuse an old evaluation/release report unnoticed.

For Pages, preserve the legacy root app through an explicit allowlist of `index.html`, `main.js`, `styles.css` and `candide_ch1_aligned.json`; put new assets under `dist/prototype/`. Publish only `dist/`, not the repository. Keep the workshop, model files and preparation data out of the web artifact. The Git repository itself remains public.

Use relative URLs and test `/macronic/prototype/`. Deploy only checked `main` commits, with deployment depending on successful checks, `github-pages` environment and deployment-only `pages: write` / `id-token: write` permissions. Guard manual dispatch to `main` if retained. Verify Pages settings at release; they were not inspected in this review. Keep the previous known-good revision for rollback. [GitHub Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

**9. Extras only when an observed error justifies them**

Do not add Vecalign, awesome-align, an LLM adjudicator, a second dictionary or a trained model initially. Bertalign plus SimAlign is the chosen baseline. Add one further component only after documenting the failure it addresses and showing improved precision, useful recall or reduced correction time on a fixed sample. Agreement between related models is not independent proof.

An LLM could later help diagnose idioms or propose phrase spans if those dominate residual errors. Its proposals must reference existing spans and pass the same checks. It must not generate its own evidence or promote its own confidence to human approval. Automatic phrase insertion is a later product capability, not a hidden fallback.

**10. Coding order and handoff**

1. Prepare verified sources and run Bertalign over the chapter. Deliver readable passage groups, diagnostics and a small reference comparison.
2. Add SimAlign and linguistic/dictionary checks. Deliver raw versus filtered precision/recall, candidate insertions and a correction-effort report. Resolve systemic failures before interface polish.
3. Build the correction workshop and ten-passage reader. Apply residual corrections and perform the bounded release reading.
4. Finish regression checks, the allowlisted Pages artifact and deployment workflow. Prepare the implementation PR for review.

Work in an implementation branch based on the specification; update conflicting specification language explicitly. Preserve the legacy app and history. No merge or publishing is part of this brief revision.

> Build the Macronic prototype around Bertalign for chapter-level passage alignment and SimAlign for contextual word links, following this revised brief. Start by producing and evaluating strong automatic output on the actual English/French text. Keep sentence-group and phrase relationships intact. Use automatic linguistic and dictionary checks to identify conservative insertions, with explicit machine provenance. Build a correction tool for residual errors, not a manual alignment production line. Preserve exact source text and allow abstention. Keep inference in a pinned Python preparation pipeline and the public reader static. Add further models only to address a demonstrated failure. Update conflicting PROTOTYPE_SPEC.md requirements, report actual quality and correction costs, and prepare a reviewable implementation without merging or deploying.
