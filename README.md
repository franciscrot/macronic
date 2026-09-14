# Macronic: Bertalign-led reader prototype

A precision-first English/French Candide reader with a local correction workshop. Bertalign establishes passage correspondences; SimAlign proposes occurrence-level word links. Conservative linguistic and dictionary checks select isolated noun substitutions. Unresolved links remain English. Models run offline during preparation; the browser serves static JSON and makes no model or API requests.

## Try it

Use Node 24 (`.nvmrc`). The committed dataset is enough; no Python models are needed for the reader.

```sh
npm ci
npm run build
npm run dev
```

Open http://127.0.0.1:4173/src/reader/ or http://127.0.0.1:4173/src/review/ for the workshop. `npm run preview` serves the built project at http://127.0.0.1:4173/macronic/prototype/.

The original app remains at the project root. The prototype has three nested stages, exact English source slices, and English glosses on hover, focus or tap; Escape closes a gloss.

## Actual output and limits

Chapter I produces 24 Bertalign passage groups and 746 SimAlign word links. The noun pilot admits 50 chapter insertions and 15 across the first ten demo passages. The policy requires compatible noun/number annotations, dictionary lemma support, distinct noncompeting occurrence links, simple nonidentical words, and an eligible passage. Phrase links remain inspectable but cannot become single-word replacements. Dictionary evidence corroborates model links; it never invents them or projects unmatched words.

`data/evidence/evaluation.json` compares the output against an AI-authored diagnostic reference: 24/24 passage groups and 36 selected word cases. This reference was written after inspecting model output. It is neither held out nor independent human evaluation; its scores do not establish corpus accuracy. The similarity threshold 0.70 is an uncalibrated pilot setting, not a probability. Human correction time and release review remain unmeasured/pending.

After a workspace rollback, the checked-in model results were recovered from an earlier snapshot. Exact source text, token annotations, scores and links were preserved; metadata and adapter safeguards were restored. `data/candidates/run.json` records this recovery separately from the original inference run. No fresh inference run is claimed for the recovery.

## Review and correction

The workshop shows both texts, occurrence IDs, model links, diagnostics and dictionary evidence. Editors may approve/reject a correspondence, select new word/phrase links, confirm/reject a passage pairing, and merge or split sentence groups. Every edit needs a name and reason. Correspondence approval and suitability for isolated substitution are separate decisions. Passage confirmation can resolve low-similarity or large-group warnings; it cannot override truncation, unmatched text or a boundary correction awaiting recomputation.

Export corrections before leaving. The browser does not write to GitHub or retain changes automatically. Import the exported JSON with:

```sh
node scripts/import-corrections.mjs /path/to/macronic-corrections.json
npm run build
```

Commit the correction file and generated reader in a PR. Boundary changes also require `python -m pipeline.prepare --apply-boundaries` followed by dictionary/evaluation/build steps. Sentence coverage must remain ordered and complete. Changed groups lose their old links until recomputed. Only untouched groups with matching inference configuration and exact tokens can retain decisions. Other decisions are archived or listed in `data/reviewed/invalidated.json`.

## Reproduce model preparation

Use Python 3.12 on a CPU machine with several GB of available memory and disk. Python inference dependencies are separate from the static reader and CI tests.

```sh
python3.12 -m venv .venv
. .venv/bin/activate
pip install --extra-index-url https://download.pytorch.org/whl/cpu -r pipeline/requirements.lock.txt
export HF_HOME="$PWD/.cache/huggingface"
python -m pipeline.download_models
python -m pipeline.prepare
python -m pipeline.evaluate
npm run build
```

Model downloads are an explicit setup step. Preparation reads pinned local LaBSE/mBERT revisions from `pipeline/models.json`, uses spaCy 3.8.0 language models, runs Bertalign's two-pass dynamic program and SimAlign intersection links, and rejects inputs that exceed model limits. The vendored Bertalign algorithm is from commit `df8c63f51aa203faed9f2fe45ae39e6fca75e667`; the adapter avoids upstream import-time downloads and online language detection. Source snapshots and hashes are in `data/sources/`. `pipeline/dictionary.py --help` describes rebuilding the FreeDict subset when new vocabulary is added; the committed evidence suffices for this chapter.

## Checks and publication

```sh
npm test
python3 -m unittest discover -s tests -p 'test_*.py'
npm run build
npx playwright install chromium
npm run test:browser
```

Tests cover exact Unicode offsets, stale/corrupt references, conflicts, editorial precedence, phrase exclusion, source grouping, the legacy WAS→Comment regression, correction import/export, accessibility interactions, mobile width and Pages project paths. CI builds from committed data; it does not download models.

Pages uploads only `dist`, containing the legacy app and the generated reader. The workshop, sources, inference dependencies and correction history are excluded. PRs run checks without deployment. A passing main build deploys only when `data/reviewed/release.json` contains a current release fingerprint and a named human release check. After personally reading the rendered demo, an editor records that check with `node scripts/record-release.mjs "Name" "What I checked"` and commits it. Source, correction, policy, dictionary or reader-code changes invalidate it. The initial release is pending; creating this PR does not publish the prototype.

## Provenance and licenses

English: Project Gutenberg 19942, Boni and Liveright 1918, introduction Philip Littell; translator unspecified in the ebook. French: Gutenberg 4650. Full downloaded notices and source hashes are retained. Narrative extraction normalizes line endings and omits standalone editorial-note paragraphs while retaining wording and embedded note markers.

The relevant FreeDict English–French TEI entries and original header are preserved in `data/evidence/freedict-subset.tei`; evidence records source commit/version/license. FreeDict is GPL-2.0-or-later. Bertalign and its Python integration are GPL-3.0 (see `pipeline/vendor/BERTALIGN_LICENSE`). New browser/build/test code is MIT under `LICENSE-PROTOTYPE`; no relicensing of legacy files or third-party models/data is implied. Model usage remains subject to each model's own license.
