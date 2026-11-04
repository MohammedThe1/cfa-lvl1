// Planning is based only on available questions and the learner's own history.
// It is not a CFA Institute syllabus or exam-weighting model.
export function dailyPlan(questions, attempts, reviews, settings = {}, now = Date.now()) {
  const first = new Map();
  for (const attempt of attempts) if (!first.has(attempt.questionId)) first.set(attempt.questionId, attempt);
  const due = questions.filter(q => reviews[q.id]?.weak && reviews[q.id].due <= now);
  const groups = new Map();
  for (const q of questions) {
    const key = `${q.topic}\0${q.module}`;
    if (!groups.has(key)) groups.set(key, {topic:q.topic, module:q.module, total:0, attempted:0, needsReview:0});
    const group = groups.get(key); group.total++; if (first.has(q.id)) group.attempted++; if (['incorrect','skipped','uncertain','guessed'].includes(reviews[q.id]?.reason)) group.needsReview++;
  }
  const modules = [...groups.values()].sort((a,b) => a.attempted/a.total - b.attempted/b.total || b.needsReview-a.needsReview || a.attempted-b.attempted || a.topic.localeCompare(b.topic) || a.module.localeCompare(b.module));
  const minutes = Math.max(10, Math.min(480, Number(settings.minutes) || 60));
  const examDate = /^\d{4}-\d{2}-\d{2}$/.test(settings.examDate || '') ? settings.examDate : '';
  const local = new Date(now);
  const today = Date.UTC(local.getFullYear(), local.getMonth(), local.getDate());
  const days = examDate ? Math.round((Date.parse(`${examDate}T00:00:00Z`) - today)/86400000) : null;
  const practiceCount = Math.max(1, Math.min(30, Math.floor(minutes/6)));
  const unseen = questions.filter(q => !first.has(q.id)).length;
  const paceGap = days !== null && days > 0 ? Math.max(0, unseen - days * practiceCount) : null;
  return {due, next:modules[0] || null, minutes, examDate, days, practiceCount, unseen, paceGap};
}

// Equal topic rotation, with the least-practised questions first within each topic.
// This is deliberately not called exam-balanced without an official year-specific blueprint.
export function allocatePractice(questions, attempts, count, topic = 'all') {
  const counts = new Map();
  for (const a of attempts) counts.set(a.questionId,(counts.get(a.questionId)||0)+1);
  const groups = new Map();
  for (const q of questions) {
    if (topic !== 'all' && q.topic !== topic) continue;
    if (!groups.has(q.topic)) groups.set(q.topic, []);
    groups.get(q.topic).push(q);
  }
  for (const group of groups.values()) group.sort((a,b)=>(counts.get(a.id)||0)-(counts.get(b.id)||0)||a.id.localeCompare(b.id));
  const buckets=[...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([,group])=>group);
  const selected=[]; const limit=Math.max(0,Math.floor(Number(count)||0));
  while (selected.length < limit && buckets.some(bucket=>bucket.length)) {
    for (const bucket of buckets) {
      if (bucket.length && selected.length < limit) selected.push(bucket.shift().id);
    }
  }
  return selected;
}

// 2027 CFA Level I session allocation; totals reflect a specific point within
// CFA Institute's published ranges across both 90-question sessions.
export const MOCK_2027 = {
  session1: {'Ethical and Professional Standards':22,'Quantitative Methods':22,'Economics':13,'Financial Statement Analysis':21,'Corporate Issuers':12},
  session2: {'Equity Investments':22,'Fixed Income':22,'Derivatives':13,'Alternative Investments':15,'Portfolio Management':18},
};
export const BLUEPRINT_2027_SOURCE = 'https://www.cfainstitute.org/programs/cfa-program/candidate-resources/level-i-exam';
export const BLUEPRINT_2027_CHECKED = '2026-11-04';
// Match exact normalized stems and choices across source IDs. This catches exact
// duplicates but cannot establish semantic equivalence or detect every variant.
export function questionFingerprint(q) {
  const normal = value => String(value ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
  const stem = normal(q.text);
  const choices = (q.options || []).map(o => normal(o.text)).sort();
  // Missing text cannot safely establish equivalence; preserve the source ID.
  if (!stem || !choices.length || choices.some(c => !c)) return `id:${q.id}`;
  return JSON.stringify([stem, choices]);
}
export function allocateMock(questions, sessions, preset, allQuestions = questions) {
  const allocation = MOCK_2027[preset];
  if (!allocation) throw Error('Unknown mock preset.');
  // Previously exposed question IDs and exact content duplicates are not fresh.
  const seen = new Set(sessions.flatMap(s => s.entries.map(e => e.questionId)));
  const excluded = new Set(allQuestions.filter(q => seen.has(q.id)).map(questionFingerprint));
  const ids = [], shortages = [];
  for (const [topic, count] of Object.entries(allocation)) {
    const candidates = questions.filter(q => q.topic === topic && !seen.has(q.id)).sort((a,b)=>a.id.localeCompare(b.id));
    const available = [], fingerprints = new Set(excluded);
    for (const q of candidates) {
      const fingerprint = questionFingerprint(q);
      if (!fingerprints.has(fingerprint)) { available.push(q); fingerprints.add(fingerprint); }
    }
    if (available.length < count) shortages.push({topic, required:count, available:available.length});
    const selected = available.slice(0,count);
    for (const q of selected) excluded.add(questionFingerprint(q));
    ids.push(...selected.map(q=>q.id));
  }
  return {ids:shortages.length ? [] : ids, shortages, allocation};
}
