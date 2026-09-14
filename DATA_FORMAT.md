# Prototype data contract (schema version 1)

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

Reader replacements store exact English ranges, French surface, English gloss, stage and decision evidence. Only approved, safe, structurally noncompeting single-word links appear. Stages are deterministic and nested; uncovered text is copied exactly.
