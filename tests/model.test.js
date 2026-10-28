import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fresh,
  validateBank,
  importBank,
  orderOptions,
  startSession,
  select,
  submit,
  advance,
  finish,
  toggleBookmark,
  metrics,
  result,
  restoreBackup,
  eligible,
} from "../src/model.js";
import { fixture, loaded } from "./fixtures.js";
test("shuffled options score by stable ID; fixed options keep original order", () => {
  const q = fixture();
  assert.notDeepEqual(
    orderOptions(q, () => 0),
    q.options.map((o) => o.id),
  );
  assert.deepEqual(
    orderOptions(fixture("fixed", true), () => 0),
    ["option-x", "option-y", "option-z"],
  );
  for (let n = 0; n < 20; n++) {
    const state = loaded(q);
    startSession(state, [q.id], "practice", "__LABEL__", 100);
    select(state, "option-y", 101);
    submit(state, 102);
    assert.equal(state.attempts[0].correct, true);
  }
});
test("selection can change before submit; submitting twice and changing afterward cannot alter attempt", () => {
  const s = loaded();
  startSession(s, ["record-1"], "lesson", "__LABEL__", 100);
  select(s, "option-x");
  select(s, "option-y");
  submit(s);
  submit(s);
  select(s, "option-z");
  assert.equal(s.attempts.length, 1);
  assert.equal(s.attempts[0].selected, "option-y");
});
test("reload preserves selection, order, phase, session position and attempt IDs", () => {
  let s = loaded(fixture(), fixture("record-2"));
  startSession(s, ["record-1", "record-2"], "practice", "__LABEL__", 100);
  select(s, "option-y");
  const order = s.sessions[0].entries[0].order;
  s = restoreBackup(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(s.sessions[0].entries[0].order, order);
  submit(s);
  advance(s);
  s = restoreBackup(JSON.parse(JSON.stringify(s)));
  assert.equal(s.sessions[0].index, 1);
  assert.equal(s.sessions[0].entries[0].phase, "reviewed");
  assert.equal(s.attempts.length, 1);
});
test("wrong lesson question returns once; two eligible correct reviews a day apart clear weakness", () => {
  const s = loaded();
  const a = startSession(s, ["record-1"], "lesson", "__LABEL__", 100);
  select(s, "option-x", 101);
  submit(s, 102);
  assert.equal(a.entries.length, 2);
  advance(s, 103);
  select(s, "option-y", 104);
  submit(s, 105);
  assert.equal(s.reviews["record-1"].weak, true);
  assert.equal(s.reviews["record-1"].streak, 1);
  advance(s, 106);
  startSession(s, ["record-1"], "weak", "__LABEL__", 200);
  select(s, "option-y", 201);
  submit(s, 202);
  assert.equal(s.reviews["record-1"].streak, 1);
  advance(s, 203);
  startSession(s, ["record-1"], "weak", "__LABEL__", 86400106);
  select(s, "option-y", 86400107);
  submit(s, 86400108);
  assert.equal(s.reviews["record-1"].weak, false);
});
test("repeated wrong attempt is bounded, bookmarks persist and repeat stats stay separate", () => {
  let s = loaded();
  startSession(s, ["record-1"], "lesson", "__LABEL__", 100);
  select(s, "option-x");
  submit(s);
  advance(s);
  select(s, "option-x");
  submit(s);
  assert.equal(s.sessions[0].entries.length, 2);
  toggleBookmark(s, "record-1");
  s = restoreBackup(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(s.bookmarks, ["record-1"]);
  assert.deepEqual(metrics(s), {
    attempted: 1,
    total: 1,
    firstCorrect: 0,
    repeatCount: 1,
    repeatCorrect: 0,
    attempts: 2,
  });
  toggleBookmark(s, "record-1");
  assert.equal(s.bookmarks.length, 0);
});
test("invalid IDs, answer references, required materials, malformed tables and review statuses rejected", () => {
  for (const mutate of [
    (q) => (q.correctOptionId = null),
    (q) => (q.correctOptionId = "missing"),
    (q) => q.options.push(q.options[0]),
    (q) => q.requiredMaterialIds.push("absent"),
    (q) =>
      q.materials.push({ id: "m", type: "table", headers: ["a"], rows: [[]] }),
    (q) => (q.preserveOrder = undefined),
    (q) => (q.status = "unknown"),
  ]) {
    const q = fixture();
    mutate(q);
    assert.ok(validateBank({ version: 1, questions: [q] }).length);
  }
  assert.ok(
    validateBank({ version: 1, questions: [fixture(), fixture()] }).length,
  );
});
test("repeat imports preserve history, detect conflicts atomically and report likely duplicates", () => {
  let s = loaded();
  startSession(s, ["record-1"], "practice", "__LABEL__", 100);
  select(s, "option-y");
  submit(s);
  const saved = JSON.stringify(s);
  const r = importBank(s, { version: 1, questions: [fixture()] });
  assert.equal(r.unchanged, 1);
  assert.equal(JSON.stringify(r.state), saved);
  const changed = fixture();
  changed.text += " __CHANGE__";
  assert.throws(() =>
    importBank(s, { version: 1, questions: [fixture("new"), changed] }),
  );
  assert.equal(JSON.stringify(s), saved);
  const dup = fixture("duplicate");
  dup.text = fixture().text;
  assert.ok(importBank(s, { version: 1, questions: [dup] }).warnings.length);
});
test("timed tests conceal recorded attempts until finish; actual deadline survives reload and prevents late selection", () => {
  let s = loaded(fixture(), fixture("record-2"));
  const test = startSession(
    s,
    ["record-1", "record-2"],
    "timed",
    "__LABEL__",
    1000,
    1,
  );
  select(s, "option-y", 2000);
  submit(s, 2001);
  assert.equal(s.attempts.length, 0);
  advance(s, 3000);
  s = restoreBackup(JSON.parse(JSON.stringify(s)));
  assert.equal(s.sessions[0].deadline, 61000);
  select(s, "option-y", 61000);
  assert.equal(s.attempts.length, 1);
  assert.equal(s.sessions[0].entries[1].selected, null);
  assert.deepEqual(result(s, s.sessions[0]), {
    correct: 1,
    answered: 1,
    total: 2,
    unanswered: 1,
  });
  finish(s, 62000);
  assert.equal(s.attempts.length, 1);
  assert.equal(test.deadline, 61000);
});
test("unvalidated and mixed-year content cannot enter scored practice", () => {
  const q = fixture();
  q.status = "review";
  let s = loaded(q);
  assert.equal(eligible(s, "__YEAR__").length, 0);
  assert.throws(() => startSession(s, [q.id], "practice", "__LABEL__"));
  const other = fixture("other");
  other.sources[0].year = "__OTHER_YEAR__";
  s = loaded(fixture(), other);
  assert.throws(() =>
    startSession(s, ["record-1", "other"], "timed", "__LABEL__"),
  );
});
test("corrupt backup references fail safely", () => {
  const s = loaded();
  s.attempts.push({ id: "a", questionId: "absent" });
  assert.throws(() => restoreBackup(s));
  assert.throws(() => restoreBackup({ version: 1 }));
});

test('malformed nested records return understandable validation errors', () => {
  for (const mutate of [q => q.options = [null], q => q.materials = [null], q => q.sources = [null], q => q.id = 'constructor']) {
    const q = fixture(); mutate(q);
    assert.ok(validateBank({version:1,questions:[q]}).length);
  }
});
