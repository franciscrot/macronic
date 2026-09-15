export const STATES = ["proposed", "needs_review", "approved", "rejected"];
const fail = (condition, message) => {
  if (!condition) throw new Error(message);
};
export const cpSlice = (s, a, b) => Array.from(s).slice(a, b).join("");
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export function validateDataset(data) {
  fail(
    data?.schema_version === 1 && Array.isArray(data.passages),
    "Unsupported dataset schema",
  );
  fail(
    typeof data.fingerprint === "string" &&
      /^[a-f0-9]{64}$/.test(data.fingerprint),
    "Missing dataset fingerprint",
  );
  const ids = new Set();
  const seenSentences = { en: new Set(), fr: new Set() };
  for (const p of data.passages) {
    fail(
      typeof p.id === "string" && !ids.has(p.id),
      "Duplicate/missing passage ID",
    );
    ids.add(p.id);
    fail(Array.isArray(p.diagnostics), `Missing diagnostics: ${p.id}`);
    fail(
      p.similarity === null || Number.isFinite(p.similarity),
      "Invalid similarity",
    );
    for (const lang of ["en", "fr"]) {
      fail(Array.isArray(p[`${lang}_sentence_ids`]), "Missing sentence IDs");
      for (const id of p[`${lang}_sentence_ids`]) {
        fail(!seenSentences[lang].has(id), `Duplicate sentence: ${id}`);
        seenSentences[lang].add(id);
      }
      fail(
        typeof p[lang]?.text === "string" && Array.isArray(p[lang].tokens),
        "Invalid text/tokens",
      );
      let end = 0;
      for (const t of p[lang].tokens) {
        fail(typeof t.id === "string" && !ids.has(t.id), "Duplicate token ID");
        ids.add(t.id);
        fail(
          Number.isInteger(t.start) &&
            Number.isInteger(t.end) &&
            t.start >= end &&
            t.end > t.start &&
            t.end <= Array.from(p[lang].text).length,
          `Invalid token range: ${t.id}`,
        );
        fail(
          cpSlice(p[lang].text, t.start, t.end) === t.surface,
          `Surface mismatch: ${t.id}`,
        );
        end = t.end;
      }
    }
    fail(Array.isArray(p.links), "Missing links");
    for (const l of p.links) {
      fail(typeof l.id === "string" && !ids.has(l.id), "Duplicate link ID");
      ids.add(l.id);
      fail(!("decision" in l), "Raw links cannot contain editorial decisions");
      validateLink(p, l);
    }
  }
  return data;
}
export function validateLink(p, link) {
  for (const lang of ["en", "fr"]) {
    fail(
      Array.isArray(link[lang]) &&
        link[lang].length > 0 &&
        new Set(link[lang]).size === link[lang].length,
      "Links need distinct token IDs on both sides",
    );
    fail(
      link[lang].every((id) => p[lang].tokens.some((t) => t.id === id)),
      `Unknown ${lang} token in ${link.id}`,
    );
  }
}
export function emptyCorrections(data) {
  return {
    schema_version: 1,
    base_fingerprint: data.fingerprint,
    operations: [],
  };
}
export function validateCorrections(data, file) {
  fail(
    file?.schema_version === 1 && Array.isArray(file.operations),
    "Unsupported correction file",
  );
  fail(
    file.base_fingerprint === data.fingerprint,
    "Stale corrections: source/alignment dataset has changed",
  );
  const seen = new Set();
  const linked = new Map(
    data.passages.flatMap((p) => p.links.map((l) => [l.id, p.id])),
  );
  for (const op of file.operations) {
    fail(
      typeof op.id === "string" && !seen.has(op.id),
      "Duplicate operation ID",
    );
    seen.add(op.id);
    fail(
      typeof op.editor === "string" &&
        op.editor.trim().length > 0 &&
        typeof op.note === "string" &&
        op.note.trim().length > 0,
      "Corrections require an editor and a reason",
    );
    if (op.type === "regroup") {
      fail(
        Array.isArray(op.passage_ids) &&
          op.passage_ids.length &&
          new Set(op.passage_ids).size === op.passage_ids.length,
        "Invalid regroup passages",
      );
      const indexes = op.passage_ids.map((id) =>
        data.passages.findIndex((p) => p.id === id),
      );
      fail(
        indexes.every((n, i) => n >= 0 && (!i || n === indexes[i - 1] + 1)),
        "Regroup must affect adjacent ordered passages",
      );
      fail(
        Array.isArray(op.groups) && op.groups.length > 0,
        "Missing replacement groups",
      );
      for (const g of op.groups)
        fail(
          Array.isArray(g.en) &&
            Array.isArray(g.fr) &&
            g.en.length + g.fr.length > 0,
          "Empty or invalid group",
        );
      for (const lang of ["en", "fr"]) {
        const before = indexes.flatMap(
          (i) => data.passages[i][`${lang}_sentence_ids`],
        );
        const after = op.groups.flatMap((g) => g[lang]);
        fail(
          JSON.stringify(before) === JSON.stringify(after),
          "Regroup must preserve every sentence once, in order",
        );
      }
    } else if (op.type === "passage") {
      fail(
        data.passages.some((p) => p.id === op.passage_id),
        "Unknown passage",
      );
      fail(
        ["approved", "rejected"].includes(op.status),
        "Invalid passage decision",
      );
    } else if (op.type === "link") {
      const p = data.passages.find((p) => p.id === op.passage_id);
      fail(p, "Unknown passage");
      fail(typeof op.link?.id === "string", "Missing correction link ID");
      validateLink(p, op.link);
      if (op.link.id === `${p.id}-editor-sentence`) {
        fail(
          p.en_sentence_ids.length === 1 &&
            p.fr_sentence_ids.length === 1 &&
            ["en", "fr"].every(
              (l) =>
                canonical(op.link[l]) ===
                canonical(p[l].tokens.map((t) => t.id)),
            ),
          "Whole-sentence decision must cover the exact sentence pair",
        );
      }
      fail(
        !linked.has(op.link.id) || linked.get(op.link.id) === p.id,
        "Link ID belongs to another passage",
      );
      linked.set(op.link.id, p.id);
      fail(
        STATES.includes(op.status) &&
          typeof op.safe_for_substitution === "boolean",
        "Invalid decision state/safety",
      );
      fail(
        !op.safe_for_substitution || op.status === "approved",
        "Only approved links can be safe",
      );
    } else throw new Error("Unknown correction operation");
  }
  return file;
}
export function effectivePassages(data, corrections) {
  validateDataset(data);
  validateCorrections(data, corrections);
  const passages = structuredClone(data.passages);
  for (const op of corrections.operations) {
    if (op.type === "regroup") {
      for (const p of passages)
        if (op.passage_ids.includes(p.id)) {
          p.diagnostics.push("boundary_correction_requires_recompute");
          p.links = [];
        }
    } else if (op.type === "passage") {
      const p = passages.find((p) => p.id === op.passage_id);
      p.passage_decision = {
        status: op.status,
        decision_origin: "human",
        editor: op.editor,
        note: op.note,
      };
    } else {
      const p = passages.find((p) => p.id === op.passage_id);
      const link = {
        ...op.link,
        decision: {
          status: op.status,
          safe_for_substitution: op.safe_for_substitution,
          decision_origin: "human",
          editor: op.editor,
          note: op.note,
        },
      };
      const index = p.links.findIndex((l) => l.id === link.id);
      if (index < 0) p.links.push(link);
      else p.links[index] = link;
    }
  }
  return passages;
}
export function assess(p, link, dictionary, policy) {
  const manual = link.decision;
  if (
    manual &&
    (!STATES.includes(manual.status) ||
      typeof manual.safe_for_substitution !== "boolean")
  )
    throw new Error("Invalid decision");
  const result = {
    status: "needs_review",
    safe_for_substitution: false,
    decision_origin: "automatic",
    policy_id: policy.id,
    reasons: [],
    dictionary_ids: [],
  };
  const approved = p.passage_decision?.status === "approved";
  const warnings = p.diagnostics.filter(
    (x) => !approved || !["low_passage_similarity", "large_group"].includes(x),
  );
  const blocked =
    warnings.length ||
    p.passage_decision?.status === "rejected" ||
    p.similarity === null ||
    (!approved && p.similarity < policy.passage_similarity_min);
  if (blocked) result.reasons.push(...warnings, "passage_not_eligible");
  if (link.en.length !== 1 || link.fr.length !== 1)
    result.reasons.push("multiword");
  const en = p.en.tokens.find((t) => t.id === link.en[0]),
    fr = p.fr.tokens.find((t) => t.id === link.fr[0]);
  if (!en?.is_word || !fr?.is_word) result.reasons.push("not_simple_words");
  if (en?.surface.toLowerCase() === fr?.surface.toLowerCase())
    result.reasons.push("same_surface");
  const competitors = p.links.filter(
    (l) =>
      l.id !== `${p.id}-editor-sentence` &&
      l.id !== link.id &&
      l.decision?.status !== "rejected" &&
      (l.en.some((id) => link.en.includes(id)) ||
        l.fr.some((id) => link.fr.includes(id))),
  );
  if (competitors.length) result.reasons.push("competing_link");
  if (manual?.status === "rejected")
    return {
      ...result,
      ...manual,
      safe_for_substitution: false,
      reasons: ["editor_rejected"],
    };
  // A human may resolve linguistic uncertainty, never structural/boundary conflicts.
  if (manual)
    return {
      ...result,
      ...manual,
      safe_for_substitution:
        manual.safe_for_substitution && result.reasons.length === 0,
    };
  const adjectiveEvidence = dictionary.entries.find(
    (e) => e.link_id === link.id && e.kind === "adjective",
  );
  const checkedAdjective =
    !!adjectiveEvidence &&
    en?.upos === "ADJ" &&
    fr?.upos === "ADJ" &&
    en?.morph?.Degree === "Pos";
  if (
    (!policy.allowed_upos.includes(en?.upos) && !checkedAdjective) ||
    en?.upos !== fr?.upos
  )
    result.reasons.push("part_of_speech");
  if (
    !checkedAdjective &&
    (!en?.morph?.Number || en.morph.Number !== fr?.morph?.Number)
  )
    result.reasons.push("number");
  if (
    p.en.tokens.some((t) => t.dep === "compound" && t.head === en?.index) ||
    en?.dep === "compound"
  )
    result.reasons.push("compound");
  result.dictionary_ids = dictionary.entries
    .filter(
      (e) =>
        (!e.link_id || e.link_id === link.id) &&
        e.en === en?.lemma &&
        e.fr.some((f) => f.toLowerCase() === fr?.lemma),
    )
    .map((e) => e.id);
  const evidence = dictionary.entries.filter((e) =>
    result.dictionary_ids.includes(e.id),
  );
  result.evidence = evidence.filter((e) => e.link_id);
  result.min_stage = checkedAdjective
    ? adjectiveEvidence.min_stage
    : evidence.length
      ? Math.min(...evidence.map((e) => e.min_stage || 1))
      : 1;
  if (!result.dictionary_ids.length) result.reasons.push("dictionary_missing");
  if (!result.reasons.length) {
    result.status = "approved";
    result.safe_for_substitution = true;
  }
  return result;
}
export function languageName(code) {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code);
  } catch {
    return code;
  }
}
export const languageDirection = (code) =>
  /^(yi|he|ar|fa|ur)(-|$)/.test(code) ? "rtl" : "ltr";
export function levelNames(languages) {
  const name = languageName(languages.learning);
  return [
    languageName(languages.base),
    `A little ${name}`,
    `More ${name}`,
    `Even more ${name}`,
    `So much ${name}`,
    name,
  ];
}
export function sentenceChoice(p, dictionary, policy) {
  const candidate = dictionary.supplement?.sentences?.find(
    (s) => s.passage_id === p.id,
  );
  const manual = p.links.find(
    (l) => l.id === `${p.id}-editor-sentence`,
  )?.decision;
  if (!candidate && !manual) return null;
  if (
    p.en_sentence_ids.length !== 1 ||
    p.fr_sentence_ids.length !== 1 ||
    p.diagnostics.length ||
    p.passage_decision?.status === "rejected" ||
    p.similarity < policy.passage_similarity_min
  )
    return null;
  if (manual && (manual.status !== "approved" || !manual.safe_for_substitution))
    return null;
  return {
    id: `${p.id}-sentence`,
    start: 0,
    end: Array.from(p.en.text).length,
    english: p.en.text,
    target: p.fr.text,
    stage: 4,
    kind: "sentence",
    decision: manual
      ? { ...manual, evidence: candidate ? [candidate] : [] }
      : {
          status: "approved",
          safe_for_substitution: true,
          decision_origin: "automatic",
          policy_id: policy.id,
          evidence: [candidate],
        },
  };
}
export function makeReader(
  data,
  corrections,
  dictionary,
  policy,
  limit = Infinity,
) {
  const passages = effectivePassages(data, corrections).slice(0, limit);
  const languages = data.languages || { base: "en", learning: "fr" };
  let rank = 0;
  return {
    schema_version: 2,
    base_fingerprint: data.fingerprint,
    title: data.title || "Candide",
    chapter: data.chapter ?? "Chapter I",
    languages,
    provenance: {
      policy_id: policy.id,
      corrections: corrections.operations.map((o) => ({
        id: o.id,
        editor: o.editor,
        note: o.note,
      })),
      supplement: dictionary.supplement || null,
    },
    stages: levelNames(languages),
    passages: passages.map((p) => ({
      id: p.id,
      text: p.en.text,
      translation: p.fr.text,
      paragraph_id: p.en.paragraph_id,
      target_paragraph_id: p.fr.paragraph_id,
      languages,
      replacements: p.links
        .filter((l) => l.id !== `${p.id}-editor-sentence`)
        .map((link) => ({
          link,
          decision: assess(p, link, dictionary, policy),
        }))
        .filter(
          (x) =>
            x.decision.status === "approved" &&
            x.decision.safe_for_substitution,
        )
        .map(({ link: l, decision }) => {
          const en = p.en.tokens.find((t) => t.id === l.en[0]),
            fr = p.fr.tokens.find((t) => t.id === l.fr[0]);
          return {
            id: l.id,
            start: en.start,
            end: en.end,
            english: en.surface,
            target: fr.surface,
            stage:
              decision.min_stage > 1
                ? decision.min_stage
                : rank++ % 3 === 0
                  ? 1
                  : 2,
            kind: "word",
            decision,
          };
        })
        .sort((a, b) => a.start - b.start),
      sentences: [sentenceChoice(p, dictionary, policy)].filter(Boolean),
    })),
  };
}
export function segments(p, stage) {
  if (stage === 5 && typeof p.translation === "string")
    return [{ text: p.translation, language: p.languages?.learning || "fr" }];
  const selected = p.sentences?.filter((r) => r.stage <= stage) || [];
  const replacements = [
    ...selected,
    ...p.replacements.filter(
      (r) =>
        r.stage <= stage &&
        !selected.some((s) => r.start < s.end && r.end > s.start),
    ),
  ].sort((a, b) => a.start - b.start);
  const parts = [];
  let end = 0;
  for (const r of replacements) {
    if (r.start < end) throw Error("Overlapping replacements");
    parts.push({ text: cpSlice(p.text, end, r.start) });
    parts.push({ text: r.target ?? r.french, replacement: r });
    end = r.end;
  }
  parts.push({ text: cpSlice(p.text, end) });
  return parts;
}
export function withSupplement(data, dictionary, supplement) {
  fail(
    supplement?.schema_version === 1 &&
      supplement.base_fingerprint === data.fingerprint &&
      Array.isArray(supplement.entries),
    "Stale or invalid supplemental evidence",
  );
  const ids = new Set(dictionary.entries.map((e) => e.id));
  for (const e of supplement.entries) {
    fail(
      !ids.has(e.id) &&
        [2, 3, 4].includes(e.min_stage) &&
        e.check_origin === "ai_context_check" &&
        typeof e.note === "string" &&
        e.note.length &&
        typeof e.source === "string" &&
        Array.isArray(e.fr),
      "Invalid supplemental evidence",
    );
    ids.add(e.id);
    const p = data.passages.find((p) =>
        p.links.some((l) => l.id === e.link_id),
      ),
      l = p?.links.find((l) => l.id === e.link_id);
    fail(
      l && l.en.length === 1 && l.fr.length === 1,
      "Unknown supplemental link",
    );
    fail(
      p.en.tokens.find((t) => t.id === l.en[0]).lemma === e.en &&
        e.fr.includes(p.fr.tokens.find((t) => t.id === l.fr[0]).lemma),
      "Supplement does not match occurrence",
    );
  }
  const sentences = supplement.sentences || [];
  for (const s of sentences) {
    const p = data.passages.find((p) => p.id === s.passage_id);
    fail(
      p &&
        p.en_sentence_ids.length === 1 &&
        p.fr_sentence_ids.length === 1 &&
        s.min_stage === 4 &&
        s.check_origin === "ai_context_check" &&
        s.source_text === p.en.text &&
        s.target_text === p.fr.text &&
        canonical(s.en_sentence_ids) === canonical(p.en_sentence_ids) &&
        canonical(s.fr_sentence_ids) === canonical(p.fr_sentence_ids),
      "Invalid sentence evidence",
    );
  }
  return {
    ...dictionary,
    supplement: {
      base_fingerprint: supplement.base_fingerprint,
      entries: supplement.entries,
      sentences,
    },
    entries: [...dictionary.entries, ...supplement.entries],
  };
}
export function validateReader(bundle) {
  const legacy = bundle?.schema_version === 1;
  fail(
    [1, 2].includes(bundle?.schema_version) &&
      Array.isArray(bundle.passages) &&
      bundle.passages.length > 0 &&
      Array.isArray(bundle.stages) &&
      bundle.stages.length === (legacy ? 3 : 6),
    "Invalid reading file",
  );
  if (!legacy)
    fail(
      typeof bundle.languages?.base === "string" &&
        typeof bundle.languages?.learning === "string" &&
        /^[a-z]{2,3}(-[A-Za-z0-9]+)*$/.test(bundle.languages.base) &&
        /^[a-z]{2,3}(-[A-Za-z0-9]+)*$/.test(bundle.languages.learning),
      "Invalid language metadata",
    );
  const ids = new Set();
  for (const p of bundle.passages) {
    fail(
      typeof p.id === "string" &&
        !ids.has(p.id) &&
        typeof p.text === "string" &&
        Array.isArray(p.replacements),
      "Invalid reading passage",
    );
    ids.add(p.id);
    if (!legacy)
      fail(
        typeof p.translation === "string" && Array.isArray(p.sentences),
        "Missing translated text",
      );
    for (const list of [p.replacements, p.sentences || []]) {
      let end = 0;
      for (const r of list) {
        fail(
          Number.isInteger(r.start) &&
            Number.isInteger(r.end) &&
            r.start >= end &&
            r.end > r.start &&
            r.end <= Array.from(p.text).length &&
            cpSlice(p.text, r.start, r.end) === r.english,
          "Invalid replacement range",
        );
        const target = legacy ? r.french : r.target;
        fail(
          typeof target === "string" &&
            target.length > 0 &&
            (legacy ? [1, 2] : [1, 2, 3, 4]).includes(r.stage) &&
            r.decision?.status === "approved" &&
            r.decision.safe_for_substitution === true,
          "Unsafe reading replacement",
        );
        if (list === p.sentences)
          fail(
            r.stage === 4 &&
              r.start === 0 &&
              r.end === Array.from(p.text).length &&
              r.target === p.translation,
            "Invalid sentence replacement",
          );
        end = r.end;
      }
    }
  }
  return bundle;
}
