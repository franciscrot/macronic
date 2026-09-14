import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
import { root, load } from "./tasks.mjs";
import { validateCorrections } from "../src/shared/data.js";
try {
  const file = process.argv[2];
  if (!file) throw new Error("Usage: node scripts/import-corrections.mjs FILE");
  const { data } = await load();
  const corrections = JSON.parse(await readFile(file, "utf8"));
  validateCorrections(data, corrections);
  await mkdir(path.join(root, "data/reviewed/history"), { recursive: true });
  const archive = `${Date.now()}-${data.fingerprint.slice(0, 12)}.json`;
  await copyFile(
    path.join(root, "data/reviewed/corrections.json"),
    path.join(root, "data/reviewed/history", archive),
  );
  await writeFile(
    path.join(root, "data/reviewed/corrections.json"),
    JSON.stringify(corrections, null, 2) + "\n",
  );
  console.log(
    "Corrections imported. Run npm run generate. Boundary changes require python -m pipeline.prepare --apply-boundaries; they are excluded until recomputed.",
  );
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
