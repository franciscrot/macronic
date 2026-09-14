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
  if (!policy.allowed_upos.includes(en?.upos) || en?.upos !== fr?.upos)
    result.reasons.push("part_of_speech");
  if (!en?.morph?.Number || en.morph.Number !== fr?.morph?.Number)
    result.reasons.push("number");
  if (
    p.en.tokens.some((t) => t.dep === "compound" && t.head === en?.index) ||
    en?.dep === "compound"
  )
    result.reasons.push("compound");
  result.dictionary_ids = dictionary.entries
    .filter(
      (e) =>
        e.en === en?.lemma && e.fr.some((f) => f.toLowerCase() === fr?.lemma),
    )
    .map((e) => e.id);
  if (!result.dictionary_ids.length) result.reasons.push("dictionary_missing");
  if (!result.reasons.length) {
    result.status = "approved";
    result.safe_for_substitution = true;
  }
  return result;
}
export function makeReader(data, corrections, dictionary, policy, limit = 10) {
  const passages = effectivePassages(data, corrections)
    .filter((p) => p.en.text)
    .slice(0, limit);
  let rank = 0;
  return {
    schema_version: 1,
    base_fingerprint: data.fingerprint,
    title: "Candide",
    stages: ["English", "A little French", "More French"],
    passages: passages.map((p) => ({
      id: p.id,
      text: p.en.text,
      paragraph_id: p.en.paragraph_id,
      replacements: p.links
        .map((l) => ({ link: l, decision: assess(p, l, dictionary, policy) }))
        .filter(
          (x) =>
            x.decision.safe_for_substitution &&
            x.decision.status === "approved",
        )
        .map(({ link: l, decision }) => {
          const en = p.en.tokens.find((t) => t.id === l.en[0]),
            fr = p.fr.tokens.find((t) => t.id === l.fr[0]);
          return {
            id: l.id,
            start: en.start,
            end: en.end,
            english: en.surface,
            french: fr.surface,
            stage: rank++ % 3 === 0 ? 1 : 2,
            decision,
          };
        })
        .sort((a, b) => a.start - b.start),
    })),
  };
}
export function segments(p, stage) {
  const parts = [];
  let end = 0;
  for (const r of p.replacements.filter((r) => r.stage <= stage)) {
    if (r.start < end) throw new Error("Overlapping replacements");
    parts.push({ text: cpSlice(p.text, end, r.start) });
    parts.push({ text: r.french, replacement: r });
    end = r.end;
  }
  parts.push({ text: cpSlice(p.text, end) });
  return parts;
}
