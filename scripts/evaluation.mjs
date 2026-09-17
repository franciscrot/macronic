import { writeFile } from "node:fs/promises";
import path from "node:path";
import { load, root } from "./tasks.mjs";
import {
  assess,
  makeReader,
  emptyCorrections,
  segments,
} from "../src/shared/data.js";
const { data, dictionary, policy, corrections } = await load();
const reasons = {};
let approved = 0,
  links = 0;
for (const p of data.passages)
  for (const l of p.links) {
    links++;
    const d = assess(p, l, dictionary, policy);
    if (d.safe_for_substitution) approved++;
    for (const r of d.reasons) reasons[r] = (reasons[r] || 0) + 1;
  }
const r = makeReader(data, emptyCorrections(data), dictionary, policy),
  c = makeReader(data, corrections, dictionary, policy);
const result = {
  raw_word_links: links,
  passage_groups: data.passages.length,
  chapter_eligible_insertions: approved,
  demo_insertions: r.passages.reduce((n, p) => n + p.replacements.length, 0),
  corrected_demo_insertions: c.passages.reduce(
    (n, p) => n + p.replacements.length,
    0,
  ),
  demo_distribution: r.passages.map((p) => ({
    id: p.id,
    count: p.replacements.length,
    insertions: p.replacements.map((r) => [r.english, r.target ?? r.french]),
  })),
  exclusion_reasons: reasons,
  levels: c.stages.map((label, stage) => ({
    label,
    stage,
    word_insertions: c.passages
      .flatMap((p) => segments(p, stage))
      .filter((s) => s.replacement && s.replacement.kind !== "sentence").length,
    sentence_insertions: c.passages
      .flatMap((p) => segments(p, stage))
      .filter((s) => s.replacement?.kind === "sentence").length,
    full_target_text: stage === 5,
  })),
};
await writeFile(
  path.join(root, "data/evidence/automatic-counts.json"),
  JSON.stringify(result, null, 2) + "\n",
);
console.log(
  `Automatic: ${links} links; ${approved} chapter insertions; ${result.demo_insertions} demo insertions.`,
);
