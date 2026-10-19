import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readingSections } from "../src/shared/sections.js";
test("chapter sections give context and preserve every alignment unit in order", () => {
  const passages = JSON.parse(readFileSync("data/reader/reader.json")).passages;
  const sections = readingSections(passages);
  assert.equal(sections.length, 4);
  assert.deepEqual(sections.flat(), passages);
  for (const s of sections)
    assert.ok(
      s
        .map((p) => p.text)
        .join(" ")
        .split(/\s+/u).length >= 170,
    );
  assert.ok(sections[0].length > 1);
});
test("short endings merge into the previous section; tiny imports still work", () => {
  const a = { text: "word ".repeat(180) },
    b = { text: "Ending." };
  assert.deepEqual(readingSections([a, b]), [[a, b]]);
  assert.deepEqual(readingSections([b]), [[b]]);
});
