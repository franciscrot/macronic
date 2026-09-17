# Prototype data contracts

All JSON is UTF-8. Ranges are half-open Unicode code-point offsets, not JavaScript UTF-16 offsets. CRLF is normalized to LF for source addressing. Preserve original source bytes in the snapshots.

| File | Purpose |
| --- | --- |
| `sources/provenance.json` | Edition, URL, byte hash, transformations and rights |
| `samples/sentences.json` | Ordered sentence IDs and source ranges |
| `candidates/dataset.json` | Immutable passages, occurrence tokens, model links and diagnostics |
| `candidates/run.json` | Model/configuration/run provenance, including recovery record |
| `evidence/dictionary.json` | Relevant lexical evidence and source IDs |
| `evidence/policy.json` | Versioned conservative noun selection policy |
| `reviewed/corrections.json` | Ordered editor operations against an exact dataset fingerprint |
| `reviewed/invalidated.json` | Decisions requiring renewed review after preparation |
| `reviewed/release.json` | Separate dataset-level publication check |
| `reader/reader.json` | Deterministic reader-only output |

Paths in this table are relative to `data/`. A dataset fingerprint hashes canonical JSON excluding the fingerprint field itself. Inference inputs have a separate code/configuration fingerprint. IDs identify occurrences in that dataset, never global words; corrections cannot apply to a different fingerprint.

Each passage contains ordered English/French sentence IDs, source parts grouped by paragraph, text, tokens, similarity, diagnostics and links. Source parts join with two newlines to exclude editorial material between narrative paragraphs. Tokens retain exact surface/range, lemma, POS, morphology and dependency fields. Links contain arrays of occurrence IDs on both sides; one-to-many and many-to-many links remain representable. Null sentence correspondences are represented by an empty side and a diagnostic.

Raw links cannot contain editorial decisions. `link` operations record status (`proposed`, `needs_review`, `approved`, `rejected`) plus an independent `safe_for_substitution` flag. `passage` operations approve or reject a sentence pairing. `regroup` operations replace adjacent sentence groups while preserving each sentence once and in order. Every operation has an ID, editor and reason. Corrections are applied in sequence, with later decisions replacing earlier decisions on the same link/passage. Boundary changes block substitution until recomputation.

Candidate and correction schemas remain version 1. Reader output is version 2. Word replacements retain exact base-text ranges, target-language surface (`target`), original gloss (`english`, retained for compatibility), stage and decision evidence. Only approved, safe, structurally noncompeting word links appear. Uncovered text is copied exactly.

## Reading-file handoff

The current `schema_version: 2` reader export includes all Chapter I passage groups, chapter/language metadata, the source dataset fingerprint, policy ID, amendment attribution and per-insertion decisions/evidence. The workshop exports this contract; the reader imports it. Consumers should reject unsupported versions and invalid ranges rather than silently interpret them. Navigation is consumer state, not alignment metadata.

`evidence/supplement.json` is an occurrence-specific evidence layer. It is bound to a dataset fingerprint, keeps URLs and AI context-check notes, and is combined with the unchanged FreeDict evidence. It does not create model links. Supplemental words specify their minimum level (2, 3 or 4). Only individually checked positive-degree adjectives can bypass the noun POS/number gate; structural checks still apply. Human corrections remain distinct and take precedence.


Version 2 uses `languages: {base: "en", learning: "fr"}` and six levels (0–5). Labels are generated from language codes, and target spans support right-to-left languages including `yi`. Each passage contains exact `text` and `translation`, word `replacements`, and `sentences`. The `sentences` array contains at most one whole-passage replacement at level 4, allowed only for a checked one-to-one sentence group. The sentence suppresses overlapping word replacements when rendered. Level 5 renders the exact translation, including groups unsuitable for isolated substitution. The workshop can approve or exclude a whole sentence through a named, reasoned `link` operation with reserved ID `<passage-id>-editor-sentence`; validation requires all tokens on both sides, in order. This decision is separate from ordinary word links.

Readers still accept version 1 files with their original three levels and `french` field, with gradual progression disabled. Re-exporting from the workshop generates version 2. Language-aware reader output is not a claim that the preparation pipeline supports every language; current raw candidate fields and inference adapters remain English/French.
