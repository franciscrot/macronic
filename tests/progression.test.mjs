import test from "node:test";
import assert from "node:assert/strict";
import {
  newProgress,
  moveProgress,
  chooseStage,
  toggleProgress,
} from "../src/shared/progression.js";
test("progress rises at passages 4,7,10,13 and caps below full target", () => {
  let s = newProgress();
  for (let i = 0; i < 24; i++) {
    s = moveProgress(s, i);
    assert.equal(s.stage, Math.min(4, Math.floor(i / 3)));
  }
});
test("revisiting passages never earns extra increments; disabling freezes progress", () => {
  let s = moveProgress(newProgress(), 3);
  for (let i = 0; i < 20; i++) {
    s = moveProgress(s, 2);
    s = moveProgress(s, 3);
  }
  assert.equal(s.stage, 1);
  s = toggleProgress(s, false);
  s = moveProgress(s, 12);
  assert.equal(s.stage, 1);
  s = toggleProgress(s, true);
  s = moveProgress(s, 14);
  assert.equal(s.stage, 1);
  s = moveProgress(s, 15);
  assert.equal(s.stage, 2);
});
test("manual choices restart interval; explicit full target remains selected", () => {
  let s = chooseStage(moveProgress(newProgress(), 9), 2);
  s = moveProgress(s, 11);
  assert.equal(s.stage, 2);
  s = moveProgress(s, 12);
  assert.equal(s.stage, 3);
  s = chooseStage(s, 5);
  s = moveProgress(s, 23);
  assert.equal(s.stage, 5);
});
