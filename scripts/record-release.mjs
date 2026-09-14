import { writeFile } from "node:fs/promises";
import { load, releaseFingerprint, root } from "./tasks.mjs";
const [editor, note] = process.argv.slice(2);
if (!editor?.trim() || !note?.trim())
  throw new Error(
    'Usage: node scripts/record-release.mjs "Your name" "What you personally checked in the rendered reader"',
  );
const data = await load();
await writeFile(
  root + "/data/reviewed/release.json",
  JSON.stringify(
    {
      schema_version: 1,
      status: "approved",
      decision_origin: "human",
      editor,
      note,
      input_fingerprint: await releaseFingerprint(data),
    },
    null,
    2,
  ) + "\n",
);
