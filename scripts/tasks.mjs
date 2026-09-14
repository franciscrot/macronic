import { readFile, writeFile, mkdir, rm, cp, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateDataset,
  validateCorrections,
  makeReader,
  canonical,
} from "../src/shared/data.js";
export const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export const json = async (p) =>
  JSON.parse(await readFile(path.join(root, p), "utf8"));
const hash = (s) => createHash("sha256").update(s).digest("hex");
export const inferenceFiles = [
  "pipeline/fingerprints.py",
  "pipeline/prepare.py",
  "pipeline/sources.py",
  "pipeline/corrections.py",
  "pipeline/vendor/bertalign_core.py",
  "pipeline/models.json",
  "pipeline/requirements.lock.txt",
];
export async function inferenceFingerprint() {
  const h = createHash("sha256");
  for (const p of inferenceFiles) {
    h.update(p + "\0");
    h.update(await readFile(path.join(root, p)));
    h.update("\0");
  }
  return h.digest("hex");
}
export async function load() {
  const data = await json("data/candidates/dataset.json");
  validateDataset(data);
  const { fingerprint, ...content } = data;
  if (hash(canonical(content)) !== fingerprint)
    throw new Error("Dataset fingerprint mismatch");
  if (data.inference_fingerprint !== (await inferenceFingerprint()))
    throw new Error("Inference inputs changed; rerun preparation");
  const corrections = await json("data/reviewed/corrections.json");
  validateCorrections(data, corrections);
  const dictionary = await json("data/evidence/dictionary.json"),
    policy = await json("data/evidence/policy.json");
  const sources = await json("data/sources/provenance.json");
  for (const s of sources.sources)
    if (
      hash(await readFile(path.join(root, "data/sources", s.file))) !== s.sha256
    )
      throw new Error("Source changed; rerun preparation");
  const sentences = await json("data/samples/sentences.json");
  for (const lang of ["en", "fr"]) {
    const expected = sentences.languages[lang].map((s) => s.id),
      actual = data.passages.flatMap((p) => p[`${lang}_sentence_ids`]);
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      throw new Error("Lost/reordered sentence");
    const source = await readFile(
      path.join(
        root,
        "data/sources",
        sources.sources.find((s) => s.language === lang).file,
      ),
      "utf8",
    );
    const chars = Array.from(source.replaceAll("\r\n", "\n"));
    for (const p of data.passages)
      if (
        p[lang].text &&
        p[lang].source_parts
          .map((x) => chars.slice(x.start, x.end).join(""))
          .join("\n\n") !== p[lang].text
      )
        throw new Error("Passage differs from source");
  }
  return { data, corrections, dictionary, policy };
}
export async function generate() {
  const d = await load();
  const result = makeReader(d.data, d.corrections, d.dictionary, d.policy);
  await mkdir(path.join(root, "data/reader"), { recursive: true });
  await writeFile(
    path.join(root, "data/reader/reader.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  return result;
}
export async function releaseFingerprint(d) {
  const files = [
    "src/shared/data.js",
    "src/shared/render.js",
    "src/shared/style.css",
    "src/reader/index.html",
    "src/reader/reader.js",
    "scripts/tasks.mjs",
  ];
  const code = await Promise.all(
    files.map(async (p) => [p, hash(await readFile(path.join(root, p)))]),
  );
  return hash(
    canonical({
      data: d.data.fingerprint,
      corrections: d.corrections,
      dictionary: d.dictionary,
      policy: d.policy,
      code,
    }),
  );
}
export async function releaseCheck() {
  const d = await load();
  const release = await json("data/reviewed/release.json");
  const input = await releaseFingerprint(d);
  if (
    release.status !== "approved" ||
    release.input_fingerprint !== input ||
    !release.editor?.trim() ||
    !release.note?.trim() ||
    release.decision_origin !== "human"
  )
    throw new Error(
      "Release check pending or stale. Use the local preview; publication requires a real dataset-level release check.",
    );
}
export async function build() {
  await generate();
  await rm(path.join(root, "dist"), { recursive: true, force: true });
  await mkdir(path.join(root, "dist/prototype"), { recursive: true });
  for (const f of [
    "index.html",
    "main.js",
    "styles.css",
    "candide_ch1_aligned.json",
    "texts.json",
  ])
    await cp(path.join(root, f), path.join(root, "dist", f));
  for (const [source, target] of [
    ["src/reader/index.html", "prototype/index.html"],
    ["src/reader/reader.js", "prototype/reader.js"],
    ["src/shared", "prototype/shared"],
    ["data/reader/reader.json", "prototype/reader.json"],
  ])
    await cp(path.join(root, source), path.join(root, "dist", target), {
      recursive: true,
    });
  await writeFile(path.join(root, "dist/.nojekyll"), "");
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const command = process.argv[2];
    if (command === "validate") await load();
    else if (command === "generate") await generate();
    else if (command === "build") await build();
    else if (command === "release") await releaseCheck();
    else throw new Error("Unknown command");
    console.log(`${command}: passed`);
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
