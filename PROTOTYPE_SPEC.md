# Precision-first macaronic reader — Bertalign prototype

This revision implements the user's choice to build sentence alignment around Bertalign. The implementation and executable commands are described in README.md; schema details are in DATA_FORMAT.md.

- Bertalign with pinned LaBSE establishes ordered passage groups, including unequal sentence counts and unmatched material. SimAlign intersection proposes occurrence-level word links inside those groups.
- The reader displays the whole of Candide Chapter I with previous/next navigation. Three deterministic nested stages replace only conservative, independently eligible noun links; unresolved text stays English.
- No positional projection, nearest-word fallback, coverage quota or sentence-length pairing heuristic may manufacture a link.
- Raw outputs, source snapshots, annotations, lexical evidence, corrections and reader output remain separate. Every inserted word retains evidence and decision origin.
- One-to-many and phrase relationships are retained for inspection but excluded from isolated substitutions. Approval of correspondence is distinct from substitution safety.
- Automatic selection is deliberately sparse. It requires dictionary corroboration, compatible annotations, an eligible passage and no competing occurrence link. Similarity is not calibrated confidence.
- The local workshop supports word and passage decisions, sentence regrouping, exact fingerprint-bound correction import/export and undo. Regrouped passages require recomputation; stale decisions cannot silently survive changed inputs.
- A static reader uses no models, APIs or backend at reading time. CI checks committed data and builds an explicit Pages artifact. Publication requires a named current human release check, after a main-branch build passes.
- Diagnostic evaluation is AI-authored and explicitly labelled. Independent human evaluation and real correction-time measurement remain future work; no human approval is fabricated.

## Historical proposal from PR #15

The following text preserves the original design record. Where it differs from the Bertalign revision above or README.md, it is superseded.

# Precision-first macaronic reader

## Purpose

Rebuild the project as a small, trustworthy prototype for reading an English
literary text that gradually incorporates carefully verified French words. The
first prototype will use approximately ten corresponding sentence pairs from
the opening of *Candide*.

The prototype optimises for precision, not coverage. Leaving a word in English
is always preferable to displaying a doubtful French substitute.

## Product principles

- Begin with an English reading text and introduce French words progressively.
- Use only simple, high-confidence, one-to-one word correspondences at first.
- Never infer a correspondence by projecting token positions, selecting a
  nearby word, or filling a coverage target.
- Permit tokens and spans to remain unaligned.
- Preserve phrase, idiom, one-to-many, and many-to-many relationships in the
  data model for later work, but do not use them for prototype substitutions.
- Require every usable alignment to carry evidence, a review status, and an
  explicit indication that it is safe for substitution.
- Keep the public reader separate from an alignment-review interface.
- Run as a static site: no backend and no external API calls at reading time.
- Make a fixed input produce a fixed reading experience.

## Initial scope

The prototype contains two interfaces:

1. **Reader:** presents the short text, advances through its progressive
   English-to-French stages, and explains substituted French words on hover or
   keyboard focus.
2. **Alignment review:** presents the paired sentences, proposed token links,
   their evidence and status, and allows an editor to inspect the small sample.

The prototype does not attempt full machine translation, complete bilingual
alignment, automatic phrase replacement, or support for a complete novel.

## Evidence and decisions

Automatic alignment produces candidates, not truth. A candidate can become
reader-usable only after conservative verification, including:

- agreement from the selected alignment method or methods;
- lemma-aware bilingual dictionary evidence;
- compatible parts of speech;
- absence of a competing or conflicting link;
- an editorial decision that the isolated substitution remains intelligible in
  its English sentence.

The minimum alignment states are:

- `proposed`
- `needs_review`
- `approved`
- `rejected`

Approval and substitution safety are separate. Only an `approved` alignment
with `safe_for_substitution: true` may appear in the reader. Evidence must name
its source and retain enough detail to reproduce or audit the decision.

## Data flow

```text
source texts
  -> corresponding sentence pairs
  -> language-specific tokens, lemmas, and parts of speech
  -> raw alignment candidates
  -> dictionary and linguistic verification
  -> editorial review
  -> approved reader data
  -> static reader
```

Each stage must be stored separately. Raw tool output must not be silently
rewritten as reviewed data, and the reader must not generate new alignments at
runtime.

## Proposed repository structure

```text
data/
  sources/          exact source text and provenance
  samples/          selected sentence pairs and stable token identifiers
  candidates/       raw output from each alignment method
  evidence/         dictionary and linguistic verification
  reviewed/         editorial statuses and notes
  reader/           generated, approved static data
scripts/            reproducible preparation and validation commands
src/
  reader/           public reading interface
  review/           alignment-review interface
tests/              data and interface checks
```

The exact build tooling will be selected in the next phase. It should remain
small, documented, and suitable for GitHub Pages.

## Current repository audit

### Potentially reusable

- `texts.json` contains substantial English and French *Candide* source text.
  Its wording may be reusable after its editions, provenance, boundaries, and
  pairing are established.
- `candide_ch1_aligned.json` contains 27 English/French sentence records with
  surface sentences, token arrays, coarse parts of speech, and token links. The
  sentence texts and tokenisation are useful inputs for inspection, not trusted
  ground truth.
- Stable-looking record identifiers such as `candide_000001` may be retained if
  the corresponding sentences survive validation.
- The existing deterministic rendering idea is useful: identical reader data
  should yield identical substitutions.
- Previous/next navigation, progressive disclosure, and explanations of French
  substitutions are useful interface ideas.
- The GitHub Pages workflow is a plausible static deployment basis.
- The repository history, especially commit `d45c360`, documents earlier
  failure modes and should remain available as design evidence.

### Untrusted or misleading

- The existing `align` links are not verified and include records whose English
  and French sentences do not correspond. They must not be inherited as
  approved alignments.
- The coarse `N`, `V`, and `O` annotations are visibly unreliable and must be
  regenerated or reviewed with language-appropriate tools.
- `mappedFrenchTokenByProjection()` manufactures replacements from nearby
  positions. This is prohibited in the rebuild.
- Whole-sentence substitution currently bypasses word-level verification and
  is outside the initial scope.
- The displayed “mapping report” combines direct and projected hits, presenting
  guessed coverage as success. It is unsuitable for the new reader.
- `texts.json` is plain text rather than JSON. Its filename is malformed and
  misleading, although the file is retained during this phase.
- There is no README, source provenance, test suite, validation command,
  documented local server command, or alignment-review interface.
- CSS for `.lexicon-inspector` remains although the current HTML has no such
  interface.

No existing file is deleted in this phase. The old implementation remains
intact on `main` and in repository history while the prototype is developed on
this branch.

## Acceptance criteria for the prototype

- Approximately ten validated, corresponding sentence pairs are readable.
- Every displayed French word traces to an approved and substitution-safe
  alignment with recorded evidence.
- Unsupported and rejected candidates remain English.
- The review interface makes uncertainty and provenance visible.
- Data validation catches missing references and invalid decision states.
- The site operates without runtime network services and deploys under its
  GitHub Pages subpath.
