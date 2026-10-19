import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, cp, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { exportProject } from "../scripts/project.mjs";
test("saved chapter project exports exact content and persists validated amendments", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "macronic-project-"));
  try {
    await cp("data", path.join(dir, "data"), { recursive: true });
    await writeFile(
      path.join(dir, "project.json"),
      JSON.stringify({ title: "Imported edition", chapter: "Chapter I" }),
    );
    const actual = await exportProject(dir),
      original = JSON.parse(await readFile("data/reader/reader.json", "utf8"));
    assert.equal(actual.title, "Imported edition");
    assert.deepEqual(actual.passages, original.passages);
    const correction = JSON.parse(
      await readFile(path.join(dir, "data/reviewed/corrections.json"), "utf8"),
    );
    const p = actual.passages.find((p) => p.replacements.length),
      id = p.replacements[0].id;
    const dataset = JSON.parse(
      await readFile(path.join(dir, "data/candidates/dataset.json"), "utf8"),
    );
    correction.operations.push({
      id: "test-edit",
      type: "link",
      passage_id: p.id,
      link: dataset.passages
        .find((x) => x.id === p.id)
        .links.find((l) => l.id === id),
      status: "rejected",
      safe_for_substitution: false,
      editor: "Test editor",
      note: "Correction persistence test",
    });
    const file = path.join(dir, "amendments.json");
    await writeFile(file, JSON.stringify(correction));
    const edited = await exportProject(dir, file);
    assert.ok(
      !edited.passages
        .find((x) => x.id === p.id)
        .replacements.some((r) => r.id === id),
    );
    assert.deepEqual(
      JSON.parse(
        await readFile(
          path.join(dir, "data/reviewed/corrections.json"),
          "utf8",
        ),
      ),
      correction,
    );
    assert.ok(await readFile(path.join(dir, "src/reader/guide.html"), "utf8"));
    correction.base_fingerprint = "stale";
    await writeFile(file, JSON.stringify(correction));
    await assert.rejects(exportProject(dir, file), /Stale/);
    const provenance = JSON.parse(
      await readFile(path.join(dir, "data/sources/provenance.json"), "utf8"),
    );
    await writeFile(
      path.join(dir, "data/sources", provenance.sources[0].file),
      "Changed text",
    );
    await assert.rejects(exportProject(dir), /Source fingerprint/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
