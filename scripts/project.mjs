import { readFile, writeFile, mkdir, cp } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import {
  validateDataset,
  validateCorrections,
  validateReader,
  makeReader,
  canonical,
  withSupplement,
} from "../src/shared/data.js";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export async function exportProject(directory, correctionsFile) {
  const project = path.resolve(directory),
    read = async (p) =>
      JSON.parse(await readFile(path.join(project, p), "utf8"));
  const data = validateDataset(await read("data/candidates/dataset.json"));
  const { fingerprint, ...content } = data;
  if (
    createHash("sha256").update(canonical(content)).digest("hex") !==
    fingerprint
  )
    throw Error("Dataset fingerprint mismatch");
  const provenance = await read("data/sources/provenance.json");
  const sentences = await read("data/samples/sentences.json");
  for (const source of provenance.sources) {
    if (path.basename(source.file) !== source.file)
      throw Error("Invalid source path");
    const raw = await readFile(path.join(project, "data/sources", source.file));
    if (createHash("sha256").update(raw).digest("hex") !== source.sha256)
      throw Error("Source fingerprint mismatch");
    let text = raw.toString("utf8").replaceAll("\r\n", "\n");
    if (source.normalized_file) {
      if (path.basename(source.normalized_file) !== source.normalized_file)
        throw Error("Invalid source path");
      text = await readFile(
        path.join(project, "data/sources", source.normalized_file),
        "utf8",
      );
      if (
        createHash("sha256").update(text).digest("hex") !==
        source.normalized_sha256
      )
        throw Error("Normalized source fingerprint mismatch");
    }
    const lang = source.language,
      chars = Array.from(text);
    if (
      canonical(data.passages.flatMap((p) => p[`${lang}_sentence_ids`])) !==
      canonical(sentences.languages[lang].map((s) => s.id))
    )
      throw Error("Lost or reordered sentence");
    if (source.normalized_file && text.replace(/\s/g, "") !== sentences.languages[lang].map(s => s.text).join("").replace(/\s/g, ""))
      throw Error("Sentence segmentation lost source text");
    for (const p of data.passages)
      if (
        p[lang].text &&
        (p[lang].source_parts || [])
          .map((part) => chars.slice(part.start, part.end).join(""))
          .join("\n\n") !== p[lang].text
      )
        throw Error("Passage differs from source");
  }
  const corrections = correctionsFile
    ? JSON.parse(await readFile(correctionsFile, "utf8"))
    : await read("data/reviewed/corrections.json");
  validateCorrections(data, corrections);
  const dictionary = withSupplement(
    data,
    await read("data/evidence/dictionary.json"),
    await read("data/evidence/supplement.json"),
  );
  const reader = validateReader(
    makeReader(
      data,
      corrections,
      dictionary,
      await read("data/evidence/policy.json"),
    ),
  );
  const metadata = await read("project.json");
  reader.title = metadata.title;
  reader.chapter = metadata.chapter || "";
  reader.provenance.sources = provenance.sources;
  for (const directory of [
    "data/reader",
    "src/reader",
    "src/review",
    "src/shared",
  ])
    await mkdir(path.join(project, directory), { recursive: true });
  for (const [source, target] of [
    ["src/reader", "src/reader"],
    ["src/review", "src/review"],
    ["src/shared", "src/shared"],
    ["src/shared", "src/reader/shared"],
    ["src/guide", "src/guide"],
  ])
    await cp(path.join(root, source), path.join(project, target), {
      recursive: true,
    });
  await cp(
    path.join(root, "src/guide/index.html"),
    path.join(project, "src/reader/guide.html"),
  );
  await cp(path.join(root, "src/prepare"), path.join(project, "src/prepare"), {
    recursive: true,
  });
  const serialized = JSON.stringify(reader, null, 2) + "\n";
  await writeFile(path.join(project, "data/reader/reader.json"), serialized);
  await writeFile(path.join(project, "src/reader/reader.json"), serialized);
  if (correctionsFile) {
    const file = path.join(project, "data/reviewed/corrections.json");
    await cp(file, file + ".previous");
    await writeFile(file, JSON.stringify(corrections, null, 2) + "\n");
  }
  return reader;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] !== "export" || !process.argv[3])
      throw Error(
        "Usage: node scripts/project.mjs export PROJECT [CORRECTIONS.json]",
      );
    await exportProject(process.argv[3], process.argv[4]);
    console.log("Validated project and reading export saved.");
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
