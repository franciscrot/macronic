import test from "node:test";
import assert from "node:assert/strict";
import {
  validateDataset,
  validateCorrections,
  emptyCorrections,
  makeReader,
  effectivePassages,
  assess,
  segments,
  cpSlice,
} from "../src/shared/data.js";
const token = (id, start, end, surface, lemma = surface) => ({
  id,
  start,
  end,
  surface,
  lemma,
  upos: "NOUN",
  morph: { Number: "Sing" },
  dep: "ROOT",
  head: 0,
  is_word: true,
});
function fixture() {
  return {
    schema_version: 1,
    fingerprint: "a".repeat(64),
    passages: [
      {
        id: "p1",
        en_sentence_ids: ["e1"],
        fr_sentence_ids: ["f1"],
        similarity: 0.9,
        diagnostics: [],
        en: {
          text: "😀 castle, castle.",
          paragraph_id: "ep1",
          tokens: [token("e", 2, 8, "castle"), token("e2", 10, 16, "castle")],
        },
        fr: {
          text: "château",
          paragraph_id: "fp1",
          tokens: [token("f", 0, 7, "château")],
        },
        links: [{ id: "l", en: ["e"], fr: ["f"], method: "simalign.inter" }],
      },
    ],
  };
}
const dictionary = {
  entries: [{ id: "entry", en: "castle", fr: ["château"] }],
};
const policy = {
  id: "test",
  passage_similarity_min: 0.7,
  allowed_upos: ["NOUN"],
};
const edit = (d, overrides = {}) => ({
  schema_version: 1,
  base_fingerprint: d.fingerprint,
  operations: [
    {
      id: "op",
      type: "link",
      passage_id: "p1",
      link: d.passages[0].links[0],
      status: "rejected",
      safe_for_substitution: false,
      editor: "Test editor",
      note: "Test correction",
      ...overrides,
    },
  ],
});
test("code-point ranges preserve emoji and exact untouched text", () => {
  const d = fixture();
  validateDataset(d);
  const r = makeReader(d, emptyCorrections(d), dictionary, policy);
  assert.equal(
    segments(r.passages[0], 0)
      .map((x) => x.text)
      .join(""),
    "😀 castle, castle.",
  );
  assert.equal(
    segments(r.passages[0], 2)
      .map((x) => x.text)
      .join(""),
    "😀 château, castle.",
  );
  assert.equal(cpSlice("😀a", 1, 2), "a");
});
test("all non-approved states and unsafe human decisions stay English", () => {
  for (const status of ["proposed", "needs_review", "rejected", "approved"]) {
    const d = fixture(),
      r = makeReader(d, edit(d, { status }), dictionary, policy);
    assert.equal(r.passages[0].replacements.length, 0);
  }
});
test("invalid states, stale files and missing references fail closed", () => {
  const d = fixture();
  assert.throws(() => validateCorrections(d, edit(d, { status: "sure" })));
  const c = edit(d);
  c.base_fingerprint = "b".repeat(64);
  assert.throws(() => validateCorrections(d, c), /Stale/);
  d.passages[0].links[0].en = ["missing"];
  assert.throws(() => validateDataset(d), /Unknown/);
});
test("repeated occurrences cannot compete for same French token", () => {
  const d = fixture();
  d.passages[0].links.push({ id: "l2", en: ["e2"], fr: ["f"] });
  assert.equal(
    makeReader(d, emptyCorrections(d), dictionary, policy).passages[0]
      .replacements.length,
    0,
  );
  assert.equal(
    makeReader(d, edit(d, { link: d.passages[0].links[1] }), dictionary, policy)
      .passages[0].replacements.length,
    1,
  );
});
test("phrases remain represented but are never single-word substitutions", () => {
  const d = fixture();
  d.passages[0].links[0].en = ["e", "e2"];
  assert.equal(
    makeReader(d, emptyCorrections(d), dictionary, policy).passages[0]
      .replacements.length,
    0,
  );
});
test("dictionary and passage checks never project missing links", () => {
  const d = fixture();
  assert.equal(
    makeReader(d, emptyCorrections(d), { entries: [] }, policy).passages[0]
      .replacements.length,
    0,
  );
  d.passages[0].similarity = 0.2;
  assert.equal(
    makeReader(d, emptyCorrections(d), dictionary, policy).passages[0]
      .replacements.length,
    0,
  );
});
test("legacy WAS to Comment cannot become a noun insertion", () => {
  const d = fixture(),
    p = d.passages[0];
  p.en.text = "WAS";
  p.en.tokens = [{ ...token("e", 0, 3, "WAS", "be"), upos: "AUX" }];
  p.fr.text = "Comment";
  p.fr.tokens = [{ ...token("f", 0, 7, "Comment", "comment"), upos: "ADV" }];
  assert.equal(
    makeReader(d, emptyCorrections(d), dictionary, policy).passages[0]
      .replacements.length,
    0,
  );
});
test("boundary edits preserve coverage and block old links until recompute", () => {
  const d = fixture();
  const c = {
    ...emptyCorrections(d),
    operations: [
      {
        id: "g",
        type: "regroup",
        passage_ids: ["p1"],
        groups: [
          { en: ["e1"], fr: [] },
          { en: [], fr: ["f1"] },
        ],
        editor: "Test editor",
        note: "Split",
      },
    ],
  };
  validateCorrections(d, c);
  assert.equal(
    makeReader(d, c, dictionary, policy).passages[0].replacements.length,
    0,
  );
  c.operations[0].groups[1].fr = [];
  assert.throws(() => validateCorrections(d, c));
});
test("correction export/import is lossless and rejects anonymous edits", () => {
  const d = fixture(),
    c = edit(d);
  assert.deepEqual(validateCorrections(d, JSON.parse(JSON.stringify(c))), c);
  c.operations[0].editor = "";
  assert.throws(() => validateCorrections(d, c));
});
test("raw data remains unchanged; stages are deterministic and nested", () => {
  const d = fixture(),
    before = JSON.stringify(d);
  const a = makeReader(d, emptyCorrections(d), dictionary, policy);
  assert.deepEqual(a, makeReader(d, emptyCorrections(d), dictionary, policy));
  assert.equal(JSON.stringify(d), before);
  assert.ok(
    a.passages[0].replacements.every((r) => r.stage >= 1 && r.stage <= 2),
  );
});
test("invalid offsets and duplicate sentences are rejected", () => {
  const d = fixture();
  d.passages[0].en.tokens[0].end = 99;
  assert.throws(() => validateDataset(d));
  const e = fixture();
  e.passages[0].en_sentence_ids.push("e1");
  assert.throws(() => validateDataset(e));
});
test("raw links cannot impersonate editorial decisions", () => {
  const d = fixture();
  d.passages[0].links[0].decision = { status: "approved" };
  assert.throws(() => validateDataset(d), /editorial/);
});
test("passage confirmation resolves similarity warnings but never structural failures", () => {
  const d = fixture();
  d.passages[0].similarity = 0.2;
  d.passages[0].diagnostics = ["low_passage_similarity"];
  const c = {
    ...emptyCorrections(d),
    operations: [
      {
        id: "p",
        type: "passage",
        passage_id: "p1",
        status: "approved",
        editor: "Tester",
        note: "Checked both sentences",
      },
    ],
  };
  assert.equal(
    makeReader(d, c, dictionary, policy).passages[0].replacements.length,
    1,
  );
  d.passages[0].diagnostics.push("word_model_limit");
  assert.equal(
    makeReader(d, c, dictionary, policy).passages[0].replacements.length,
    0,
  );
});

test("supplemental evidence is occurrence-bound, stale-safe and highest-stage only", async () => {
  const { withSupplement, validateReader } = await import(
    "../src/shared/data.js"
  );
  const d = fixture(),
    s = {
      schema_version: 1,
      base_fingerprint: d.fingerprint,
      entries: [
        {
          id: "extra",
          en: "castle",
          fr: ["château"],
          link_id: "l",
          source: "https://example.org/dictionary",
          note: "Fixture evidence",
          check_origin: "ai_context_check",
          min_stage: 2,
        },
      ],
    };
  const r = makeReader(
    d,
    emptyCorrections(d),
    withSupplement(d, { entries: [] }, s),
    policy,
  );
  assert.equal(r.passages[0].replacements[0].stage, 2);
  validateReader(JSON.parse(JSON.stringify(r)));
  s.base_fingerprint = "stale";
  assert.throws(() => withSupplement(d, { entries: [] }, s), /Stale/);
  r.passages[0].replacements[0].start = 99;
  assert.throws(() => validateReader(r), /range/);
});
test("whole-chapter export contains every passage and preserves lower-stage baseline", async () => {
  const { load } = await import("../scripts/tasks.mjs");
  const { data, dictionary, policy, corrections } = await load();
  const full = makeReader(data, corrections, dictionary, policy),
    base = makeReader(
      data,
      corrections,
      { entries: dictionary.entries.filter((e) => !e.link_id) },
      policy,
    );
  assert.equal(full.passages.length, 24);
  assert.equal(
    full.passages.reduce((n, p) => n + p.replacements.length, 0),
    67,
  );
  const low = (r) =>
    r.passages.flatMap((p) =>
      p.replacements.filter((x) => x.stage === 1).map((x) => x.id),
    );
  assert.deepEqual(low(full), low(base));
});

test("six levels add checked adjectives, nouns and an exact full sentence", async () => {
  const { load } = await import("../scripts/tasks.mjs");
  const { validateReader, levelNames, languageDirection } = await import(
    "../src/shared/data.js"
  );
  const { data, corrections, dictionary, policy } = await load();
  const r = validateReader(makeReader(data, corrections, dictionary, policy));
  const count = (stage) =>
    r.passages
      .flatMap((p) => segments(p, stage))
      .filter((s) => s.replacement?.kind === "word").length;
  assert.deepEqual([1, 2, 3, 4].map(count), [17, 56, 65, 67]);
  assert.equal(r.passages.flatMap((p) => p.sentences).length, 1);
  const p = r.passages.find((p) => p.id === "p018");
  assert.equal(
    segments(p, 4)
      .map((s) => s.text)
      .join(""),
    p.translation,
  );
  for (let i = 0; i < r.passages.length; i++)
    assert.equal(
      segments(r.passages[i], 5)
        .map((s) => s.text)
        .join(""),
      data.passages[i].fr.text,
    );
  assert.deepEqual(levelNames({ base: "en", learning: "yi" }), [
    "English",
    "A little Yiddish",
    "More Yiddish",
    "Even more Yiddish",
    "So much Yiddish",
    "Yiddish",
  ]);
  assert.equal(languageDirection("yi"), "rtl");
});
test("sentence exclusion is independent of word edits; forged sentence decisions fail", async () => {
  const { load } = await import("../scripts/tasks.mjs");
  const { data, dictionary, policy } = await load();
  const p = data.passages.find((p) => p.id === "p018");
  const c = emptyCorrections(data);
  c.operations.push({
    id: "sentence-test",
    type: "link",
    passage_id: p.id,
    link: {
      id: `${p.id}-editor-sentence`,
      en: p.en.tokens.map((t) => t.id),
      fr: p.fr.tokens.map((t) => t.id),
    },
    status: "rejected",
    safe_for_substitution: false,
    editor: "Tester",
    note: "Testing exclusion",
  });
  assert.equal(
    makeReader(data, c, dictionary, policy).passages.find((q) => q.id === p.id)
      .sentences.length,
    0,
  );
  c.operations[0].link.en.pop();
  assert.throws(() => validateCorrections(data, c), /Whole-sentence/);
});
