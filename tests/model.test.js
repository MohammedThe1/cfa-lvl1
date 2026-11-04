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
  setReflection,
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
test("same-session and early retries do not advance retrieval; due reviews increase intervals and continue maintenance", () => {
  let s = loaded();
  const a = startSession(s, ["record-1"], "lesson", "__LABEL__", 100);
  select(s, "option-x", 101);
  submit(s, 102);
  assert.equal(a.entries.length, 2);
  advance(s, 103);
  select(s, "option-y", 104);
  submit(s, 105);
  assert.equal(s.reviews["record-1"].weak, true);
  assert.equal(s.reviews["record-1"].streak, 0);
  assert.equal(s.reviews["record-1"].due, 102 + 86400000);
  assert.equal(s.attempts[1].delayed, false);
  advance(s, 106);
  startSession(s, ["record-1"], "weak", "__LABEL__", 200);
  select(s, "option-y", 201);
  submit(s, 202);
  assert.equal(s.reviews["record-1"].streak, 0);
  advance(s, 203);
  s = restoreBackup(JSON.parse(JSON.stringify(s)));
  const due = s.reviews["record-1"].due;
  startSession(s, ["record-1"], "weak", "__LABEL__", due);
  select(s, "option-y", due + 1);
  submit(s, due + 2);
  assert.equal(s.attempts.at(-1).delayed, true);
  assert.equal(s.reviews["record-1"].due, due + 2 + 3 * 86400000);
  assert.equal(s.reviews["record-1"].delayedCount, 1);
  assert.equal(s.reviews["record-1"].delayedCorrect, 1);
  assert.equal(s.reviews["record-1"].weak, true);
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
  assert.equal(s.reviews['record-2'].reason, 'skipped');
  assert.equal(s.reviews['record-2'].due, 61000 + 86400000);
  finish(s, 62000);
  assert.equal(s.attempts.length, 1);
  assert.equal(test.deadline, 61000);
});

test('confidence, correctness, and delayed retention remain separate', () => {
  const s = loaded();
  startSession(s, ['record-1'], 'practice', 'practice', 100);
  setReflection(s, {confidence: 'guessed'});
  setReflection(s, {note: 'Check the definition'});
  setReflection(s, {errorLabel: 'concept'});
  select(s, 'option-y', 101); submit(s, 102); advance(s, 103);
  assert.equal(s.attempts[0].correct, true);
  assert.equal(s.attempts[0].confidence, 'guessed');
  assert.equal(s.attempts[0].note, 'Check the definition');
  assert.equal(s.attempts[0].errorLabel, 'concept');
  assert.equal(s.reviews['record-1'].reason, 'guessed');
  const due = s.reviews['record-1'].due;
  startSession(s, ['record-1'], 'weak', 'review', due);
  setReflection(s, {confidence: 'uncertain'});
  select(s, 'option-y', due + 1); submit(s, due + 2);
  assert.equal(s.attempts[1].delayed, true);
  assert.equal(s.reviews['record-1'].delayedCorrect, 1);
  assert.equal(s.reviews['record-1'].reason, 'uncertain');
  assert.equal(s.reviews['record-1'].due, due + 2 + 86400000);
});

test('review due instants survive reload and a time-zone change', () => {
  const before = process.env.TZ;
  try {
    process.env.TZ = 'Asia/Riyadh';
    let s = loaded();
    const when = Date.parse('2026-12-31T23:30:00Z');
    startSession(s, ['record-1'], 'practice', 'practice', when);
    select(s, 'option-x', when + 1); submit(s, when + 2);
    const due = s.reviews['record-1'].due;
    s = restoreBackup(JSON.parse(JSON.stringify(s)));
    process.env.TZ = 'America/Los_Angeles';
    assert.equal(s.reviews['record-1'].due, due);
    assert.equal(new Date(due).toISOString(), new Date(when + 2 + 86400000).toISOString());
  } finally {
    if (before === undefined) delete process.env.TZ; else process.env.TZ = before;
  }
});

test('a skipped due item is queued again without fabricating retention evidence', () => {
  const s = loaded();
  startSession(s, ['record-1'], 'practice', 'practice', 100);
  select(s, 'option-y', 101); submit(s, 102); advance(s, 103);
  const due = s.reviews['record-1'].due;
  startSession(s, ['record-1'], 'timed', 'test', due);
  finish(s, due + 1);
  assert.equal(s.attempts.length, 1);
  assert.equal(s.reviews['record-1'].reason, 'skipped');
  assert.equal(s.reviews['record-1'].delayedCount, 0);
  assert.equal(s.reviews['record-1'].due, due + 1 + 86400000);
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

