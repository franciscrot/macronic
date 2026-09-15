# Authoring and corpus workflow

Use two interfaces with one versioned data contract: a developer/editor workshop prepares and corrects texts; a later consumer reader loads its exported reading bundles. Keep the current reader as a preview of that same contract.

## Proposed import flow (not implemented yet)

1. Load the English source and an existing translation of the same work. Start with UTF-8 plain text; retain original bytes, edition/translator, language codes, source URLs and rights metadata. Raw uploads are not reading bundles and should have a separate control from Open a reading file.
2. Select the target language, normalize a derived copy, segment sentences with stable IDs, and check chapter/paragraph coverage. Show missing sections before alignment.
3. Run a reproducible Python preparation job: Bertalign sentence groups, then supported word alignment, morphology and dictionary checks. Record model versions, settings, source hashes and diagnostics. Store every correspondence and uncertainty, not only accepted insertions.
4. Open results in the workshop. Inspect low-confidence/structurally problematic groups, edit links or boundaries, and approve/exclude word and sentence substitutions. Named amendments remain separate from immutable model output. Boundary edits trigger recomputation.
5. Save the editable project (sources, candidates, evidence and amendments) and export a smaller versioned reading JSON. Reopening an editable project must restore amendments; exporting only a reading file is not an authoring backup.
6. Validate and commit corpus changes through a PR, preserving the existing separate human publication check. The eventual native reader consumes the same reading JSON without models or an authoring server.

## Smallest next implementation

First add a local CLI that accepts two file paths and language/edition metadata and writes an authoring project directory. Then connect the workshop's import form to a local Python worker with job progress and persistent project storage. The static reader and GitHub Pages cannot themselves host Python model jobs. A shared hosted worker/queue is a later deployment decision, not a prerequisite for corpus preparation.

French remains the working preparation adapter. Reader labels and text direction now support Yiddish, but choosing a code does not enable reliable Yiddish inference. Upstream Bertalign's standard supported-language list does not include Yiddish: https://github.com/bfsujason/bertalign. Before enabling that import option, establish a small independently reviewed English/Yiddish sample, verify sentence segmentation and embedding alignment, and evaluate word alignment, normalization and morphological/lexical evidence. Start with checked whole sentences if word substitutions cannot meet the precision bar; never silently use French rules.

Codex should develop the pipeline and help prepare batches, while the corpus and evidence live in durable versioned project files. That makes preparation reproducible outside a conversation. These are complementary activities: build the import workflow against real corpus batches, with the existing chapter as a regression fixture. Do not postpone the data contract until the consumer app, or make a chat session the only way to reproduce the corpus.
