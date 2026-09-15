import {
  validateDataset,
  validateCorrections,
  emptyCorrections,
  effectivePassages,
  assess,
  makeReader,
  withSupplement,
} from "../shared/data.js";
import { renderPassage } from "../shared/render.js";
const $ = (id) => document.getElementById(id);
let data,
  dictionary,
  policy,
  corrections,
  sentences,
  index = 0,
  active = null,
  selected = { en: [], fr: [] },
  history = [],
  dirty = false,
  groupIds = [];
function message(text, error = false) {
  $("message").textContent = text;
  $("message").className = "status" + (error ? " error" : "");
}
function current() {
  return effectivePassages(data, corrections)[index];
}
function clear() {
  active = null;
  selected = { en: [], fr: [] };
  $("safe").checked = false;
  $("decision").value = "needs_review";
  $("evidence").textContent = "Select a link.";
  render();
}
function snapshot() {
  history.push(structuredClone(corrections));
  dirty = true;
}
function append(op) {
  const next = structuredClone(corrections);
  next.operations.push({
    ...op,
    id: crypto.randomUUID(),
    editor: $("editor").value.trim(),
    note: $("note").value.trim(),
  });
  validateCorrections(data, next);
  snapshot();
  corrections = next;
  message("Session correction saved. Export to keep your changes.");
  render();
}
function render() {
  const p = current();
  $("passage").value = String(index);
  $("previous").disabled = index === 0;
  $("next").disabled = index === data.passages.length - 1;
  $("undo").disabled = !history.length;
  $("diagnostics").textContent =
    `${p.id} · ${p.en_sentence_ids.length}:${p.fr_sentence_ids.length} sentences · similarity ${p.similarity ?? "unmatched"} · ${p.diagnostics.join(", ") || "No passage warning"} · ${dirty ? "Unsaved export" : "Saved/imported state"}`;
  for (const lang of ["en", "fr"]) {
    $(lang).replaceChildren();
    for (const t of p[lang].tokens) {
      const b = document.createElement("button");
      b.className =
        "token" + (selected[lang].includes(t.id) ? " selected" : "");
      b.textContent = t.surface;
      b.title = `${t.id} · ${t.lemma} · ${t.upos}`;
      b.setAttribute("aria-pressed", String(selected[lang].includes(t.id)));
      b.onclick = () => {
        active = null;
        selected[lang] = selected[lang].includes(t.id)
          ? selected[lang].filter((x) => x !== t.id)
          : [...selected[lang], t.id];
        render();
      };
      $(lang).append(b, document.createTextNode(" "));
    }
  }
  $("selection").textContent = ["en", "fr"]
    .map((l) =>
      p[l].tokens
        .filter((t) => selected[l].includes(t.id))
        .map((t) => t.surface)
        .join(" "),
    )
    .join(" ↔ ");
  $("links").replaceChildren();
  for (const link of p.links) {
    const d = assess(p, link, dictionary, policy);
    if (
      $("uncertain").checked &&
      d.status === "approved" &&
      d.safe_for_substitution
    )
      continue;
    const row = document.createElement("div");
    row.className = "link-row";
    const b = document.createElement("button");
    b.textContent = ["en", "fr"]
      .map((l) =>
        link[l]
          .map((id) => p[l].tokens.find((t) => t.id === id).surface)
          .join(" "),
      )
      .join(" ↔ ");
    b.onclick = () => {
      active = link.id;
      selected = { en: [...link.en], fr: [...link.fr] };
      $("decision").value = d.status === "proposed" ? "needs_review" : d.status;
      $("safe").checked = d.safe_for_substitution;
      const entries = dictionary.entries.filter((e) =>
        d.dictionary_ids.includes(e.id),
      );
      $("evidence").textContent = JSON.stringify(
        {
          link,
          decision: d,
          dictionary_entries: entries,
          dictionary_source: dictionary.source,
        },
        null,
        2,
      );
      render();
    };
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = d.safe_for_substitution ? "Eligible" : d.status;
    row.append(b, badge);
    $("links").append(row);
  }
  const full = makeReader(data, corrections, dictionary, policy, Infinity);
  const preview = full.passages.find((x) => x.id === p.id);
  $("preview").replaceChildren();
  if (preview) renderPassage($("preview"), preview, Number($("stage").value));
}
function resetGroups() {
  const p = data.passages[index];
  groupIds = [p.id];
  $("groups").value = JSON.stringify(
    [{ en: p.en_sentence_ids, fr: p.fr_sentence_ids }],
    null,
    2,
  );
  $("sentences").textContent = ["en", "fr"]
    .map((l) =>
      sentences.languages[l]
        .filter((s) => p[`${l}_sentence_ids`].includes(s.id))
        .map((s) => `${s.id}: ${s.text}`)
        .join("\n"),
    )
    .join("\n\n");
}
function go(n) {
  index = n;
  active = null;
  selected = { en: [], fr: [] };
  resetGroups();
  render();
}
$("previous").onclick = () => go(index - 1);
$("next").onclick = () => go(index + 1);
$("passage").onchange = () => go(Number($("passage").value));
$("uncertain").onchange = render;
$("stage").onchange = render;
$("clear").onclick = clear;
for (const [id, status] of [
  ["approve-passage", "approved"],
  ["reject-passage", "rejected"],
])
  $(id).onclick = () => {
    try {
      append({ type: "passage", passage_id: current().id, status });
    } catch (e) {
      message(e.message, true);
    }
  };
$("save").onclick = () => {
  try {
    append({
      type: "link",
      passage_id: current().id,
      link: {
        id: active || `${current().id}-editor-${crypto.randomUUID()}`,
        en: selected.en,
        fr: selected.fr,
        method: "editor",
      },
      status: $("decision").value,
      safe_for_substitution: $("safe").checked,
    });
  } catch (e) {
    message(e.message, true);
  }
};
$("undo").onclick = () => {
  if (history.length) {
    corrections = history.pop();
    dirty = true;
    message("Edit undone. Export to save this state.");
    render();
  }
};
$("merge").onclick = () => {
  const next = data.passages[index + 1];
  if (!next) return;
  const p = data.passages[index];
  groupIds = [p.id, next.id];
  $("groups").value = JSON.stringify(
    [
      {
        en: [...p.en_sentence_ids, ...next.en_sentence_ids],
        fr: [...p.fr_sentence_ids, ...next.fr_sentence_ids],
      },
    ],
    null,
    2,
  );
};
$("regroup").onclick = () => {
  try {
    append({
      type: "regroup",
      passage_ids: groupIds,
      groups: JSON.parse($("groups").value),
    });
  } catch (e) {
    message(e.message, true);
  }
};
$("export").onclick = () => {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(corrections, null, 2) + "\n"], {
      type: "application/json",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "macronic-corrections.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  dirty = false;
  message(
    "Corrections exported. Import them into the preparation pipeline to commit them.",
  );
  render();
};
$("import").onchange = async () => {
  try {
    const file = $("import").files[0];
    if (!file) return;
    const next = JSON.parse(await file.text());
    validateCorrections(data, next);
    snapshot();
    corrections = next;
    dirty = false;
    message("Correction file imported.");
    clear();
  } catch (e) {
    message(e.message, true);
  } finally {
    $("import").value = "";
  }
};
addEventListener("beforeunload", (e) => {
  if (dirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});
try {
  const values = await Promise.all(
    [
      "candidates/dataset.json",
      "evidence/dictionary.json",
      "evidence/policy.json",
      "reviewed/corrections.json",
      "samples/sentences.json",
    ].map(async (p) => {
      const r = await fetch("../../data/" + p);
      if (!r.ok) throw new Error("Data unavailable");
      return r.json();
    }),
  );
  [data, dictionary, policy, corrections, sentences] = values;
  dictionary = withSupplement(
    data,
    dictionary,
    await (await fetch("../../data/evidence/supplement.json")).json(),
  );
  validateDataset(data);
  validateCorrections(data, corrections);
  data.passages.forEach((p, i) => {
    const o = document.createElement("option");
    o.value = i;
    o.textContent = `${p.id} · ${p.en.text.slice(0, 45) || "French only"}`;
    $("passage").append(o);
  });
  message(
    "Automatic alignments loaded. Corrections remain separate from the original run.",
  );
  go(0);
} catch (e) {
  message(e.message, true);
  document.querySelectorAll("button").forEach((b) => (b.disabled = true));
}

$("export-reader").onclick = () => {
  try {
    const file = makeReader(data, corrections, dictionary, policy);
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(file, null, 2) + "\n"], {
        type: "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "candide-chapter-1.reader.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    message(
      "Reading file exported. Export corrections separately to preserve your editable work.",
    );
  } catch (e) {
    message(e.message, true);
  }
};
