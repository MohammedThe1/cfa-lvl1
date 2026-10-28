export const CATEGORIES = ["curriculum", "schweser", "les", "practice-pack"];
export const TOPICS = [
  "Ethical and Professional Standards",
  "Quantitative Methods",
  "Economics",
  "Financial Statement Analysis",
  "Corporate Issuers",
  "Equity Investments",
  "Fixed Income",
  "Derivatives",
  "Alternative Investments",
  "Portfolio Management",
];
export const fresh = () => ({
  version: 1,
  questions: [],
  attempts: [],
  bookmarks: [],
  reviews: {},
  sessions: [],
  active: null,
});
const sourceImage = value => typeof value==='string' && (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value)||/^question-assets\/[a-f0-9]{12}-p[1-9][0-9]*\.webp$/.test(value));
const recordObject = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const str = (x) => typeof x === "string" && x.trim().length > 0;
export function validateBank(bank) {
  const errors = [];
  if (bank?.version !== 1 || !Array.isArray(bank.questions))
    return ["Invalid file: expected version: 1 and a questions array."];
  const ids = new Set();
  bank.questions.forEach((q, i) => {
    const err = (m) =>
      errors.push(`Record ${i + 1} (${q?.id ?? "no ID"}): ${m}`);
    if (!recordObject(q)) {
      err("Expected an object.");
      return;
    }
    for (const key of ["id", "topic", "module", "text"])
      if (!str(q[key])) err(`Field ${key} is missing.`);
    if (!TOPICS.includes(q.topic)) err("Unknown topic.");
    if (
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(q.id) ||
      ["__proto__", "constructor", "prototype"].includes(q.id)
    )
      err(
        "Unsafe question ID: use ASCII letters, digits, dash, colon, underscore or dot.",
      );
    if (ids.has(q.id)) err("Duplicate ID in this file.");
    ids.add(q.id);
    if (!["validated", "review"].includes(q.status))
      err("Validation status must be validated or review.");
    if(q.presentation!==undefined && !['source','transcription'].includes(q.presentation))err('Unknown question presentation.');
    if(q.presentation==='source' && (!q.preserveOrder || !recordObject(q.conversion) || !str(q.conversion.candidateId) || !/-q[1-9][0-9]*$/.test(q.conversion.candidateId) || !q.materials?.some?.(m=>m?.type==='document') || !q.explanationMaterials?.some?.(m=>m?.type==='document')))err('Source-page practice requires fixed source option order, question identity, and original question/solution documents.');
    if (typeof q.preserveOrder !== "boolean")
      err("preserveOrder must be specified explicitly.");
    const opts = Array.isArray(q.options) ? q.options : [];
    if (
      opts.length < 2 ||
      opts.some((o) => !str(o?.id) || !str(o?.text)) ||
      new Set(opts.map((o) => o.id)).size !== opts.length
    )
      err("Invalid options or duplicate option IDs.");
    if (!opts.some((o) => o?.id === q.correctOptionId))
      err(
        "Correct answer is missing or does not reference an existing option.",
      );
    if (q.explanation !== null && typeof q.explanation !== "string")
      err("explanation must be a string or null.");
    if (!Array.isArray(q.sources) || !q.sources.length)
      err("Source reference is missing.");
    else
      q.sources.forEach((s) => {
        if (
          !s ||
          !CATEGORIES.includes(s.category) ||
          !["title", "edition", "year", "location", "answerLocation"].every(
            (k) => str(s[k]),
          )
        )
          err(
            "Source category, title, edition, year, question location and answer location are required.",
          );
      });
    if (q.status === "validated" && !str(q.verifiedBy))
      err("A verifiedBy reviewer record is required.");
    if (!Array.isArray(q.materials) || !Array.isArray(q.requiredMaterialIds))
      err("materials and requiredMaterialIds are required, even when empty.");
    else {
      if (new Set(q.materials.map((m) => m?.id)).size !== q.materials.length)
        err("Duplicate supporting-material IDs.");
      q.requiredMaterialIds.forEach((id) => {
        if (!q.materials.some((m) => m?.id === id))
          err(`Supporting material ${id} is missing.`);
      });
      if(q.explanationMaterials!==undefined&&!Array.isArray(q.explanationMaterials))err('Invalid source explanation materials.');
      const allMaterials=[...q.materials,...(Array.isArray(q.explanationMaterials)?q.explanationMaterials:[])];
      if(q.presentation==='source'){
        const questionImages=new Set(q.materials.flatMap(m=>m?.type==='document'&&Array.isArray(m.pages)?m.pages.map(p=>p?.src):[]));
        if((Array.isArray(q.explanationMaterials)?q.explanationMaterials:[]).some(m=>m?.type==='document'&&Array.isArray(m.pages)&&m.pages.some(p=>questionImages.has(p?.src))))err('Question pages must not expose original solution pages.');
      }
      if(new Set(allMaterials.map(m=>m?.id)).size!==allMaterials.length)err('Duplicate material IDs across question and explanation.');
      allMaterials.forEach((m) => {
        if (!recordObject(m)) {
          err("Invalid supporting material.");
          return;
        }
        if (
          !str(m.id) ||
          !["passage", "formula", "table", "image", "document"].includes(m.type)
        )
          err("Invalid supporting material.");
        if (["passage", "formula"].includes(m.type) && !str(m.text))
          err("Supporting-material text is missing.");
        if (
          m.type === "image" &&
          (!str(m.alt) ||
            !sourceImage(m.src))
        )
          err("Image must be an embedded PNG/JPEG/WebP or a local source asset with alt text.");
        if(m.type==='document' && (!str(m.title)||!Array.isArray(m.pages)||!m.pages.length||m.pages.some(p=>!recordObject(p)||!Number.isInteger(p.pdfPage)||p.pdfPage<1||!sourceImage(p.src))||new Set(m.pages.map(p=>p.pdfPage)).size!==m.pages.length||!m.pages.some(p=>p.pdfPage===m.initialPage)))err('Source document pages are missing or invalid.');
        if (
          m.type === "table" &&
          (!Array.isArray(m.headers) ||
            !m.headers.length ||
            !m.headers.every(str) ||
            !Array.isArray(m.rows) ||
            !m.rows.length ||
            !m.rows.every(
              (r) =>
                Array.isArray(r) &&
                r.length === m.headers.length &&
                r.every((v) => typeof v === "string"),
            ))
        )
          err("Incomplete table.");
      });
    }
  });
  return errors;
}
const canonical = (q) =>
  JSON.stringify({
    topic: q.topic,
    module: q.module,
    text: q.text,
    options: q.options,
    correctOptionId: q.correctOptionId,
    explanation: q.explanation,
    materials: q.materials,
    requiredMaterialIds: q.requiredMaterialIds,
    explanationMaterials:q.explanationMaterials,
    presentation:q.presentation,
    conversion:q.conversion,
    preserveOrder: q.preserveOrder,
    sources: q.sources,
    status: q.status,
    verifiedBy: q.verifiedBy,
  });
const normalized = (q) =>
  (q.text + " " + q.options.map((o) => o.text).join(" "))
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
export function importBank(state, bank) {
  const errors = validateBank(bank);
  if (errors.length) throw Error(errors.join("\n"));
  let added = 0,
    unchanged = 0;
  const warnings = [];
  const next = structuredClone(state);
  for (const q of bank.questions) {
    const existing = next.questions.find((x) => x.id === q.id);
    if (existing) {
      if (canonical(existing) !== canonical(q))
        throw Error(
          `ID ${q.id} already exists with different content; use a new revision ID to protect study history.`,
        );
      unchanged++;
      continue;
    }
    for (const old of next.questions) {
      const a = normalized(old),
        b = normalized(q);
      const tokens = new Set(a.split(" ")),
        other = new Set(b.split(" "));
      const similarity =
        [...tokens].filter((t) => other.has(t)).length /
        new Set([...tokens, ...other]).size;
      if (a === b || similarity > 0.85)
        warnings.push(
          `${old.id} ↔ ${q.id}: ${a === b ? "Exact text match" : "Possible duplicate"}; records and sources were kept separate.`,
        );
    }
    next.questions.push(structuredClone(q));
    added++;
  }
  const years = new Set(
    next.questions.flatMap((q) => q.sources.map((s) => s.year)),
  );
  if (years.size > 1)
    warnings.push(
      "Multiple source years found. Select one year. Conflicting-year records are excluded from study.",
    );
  return { state: next, added, unchanged, warnings };
}
export function eligible(state, year) {
  return state.questions.filter(
    (q) => q.status === "validated" && q.sources.every((s) => s.year === year),
  );
}
export function orderOptions(q, random = Math.random) {
  const ids = q.options.map((o) => o.id);
  if (!q.preserveOrder)
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
  return ids;
}
export function startSession(
  state,
  ids,
  mode,
  label,
  now = Date.now(),
  minutes = 30,
) {
  if (!ids.length) throw Error("No verified questions match this selection.");
  if (state.sessions.some((s) => !s.finished))
    throw Error(
      "Resume or finish your current session before starting another.",
    );
  const qs = ids.map((id) => state.questions.find((q) => q.id === id));
  if (
    qs.some((q) => !q || q.status !== "validated") ||
    new Set(qs.flatMap((q) => q.sources.map((s) => s.year))).size !== 1
  )
    throw Error("Questions are unverified or from different years.");
  if (
    !["lesson", "saved", "weak", "practice", "timed"].includes(mode) ||
    !Number.isFinite(minutes) ||
    minutes < 1 ||
    minutes > 240
  )
    throw Error("Invalid session settings.");
  const id = crypto.randomUUID();
  const s = {
    id,
    mode,
    label,
    created: now,
    deadline: mode === "timed" ? now + minutes * 60000 : null,
    index: 0,
    finished: null,
    initialCount: ids.length,
    entries: qs.map((q) => ({
      questionId: q.id,
      order: orderOptions(q),
      selected: null,
      phase: "unanswered",
      attemptId: null,
    })),
    repeated: [],
  };
  state.sessions.push(s);
  state.active = id;
  return s;
}
export const activeSession = (state) =>
  state.sessions.find((s) => s.id === state.active);
export function select(state, option, now = Date.now()) {
  const s = activeSession(state);
  if (!s || s.finished) return;
  if (s.deadline && now >= s.deadline) {
    finish(state, now);
    return;
  }
  const e = s.entries[s.index];
  if (e.attemptId) return;
  if (!e.order.includes(option)) throw Error("Unknown option.");
  e.selected = option;
  e.phase = "selected";
}
function record(state, s, e, index, now) {
  if (e.attemptId || !e.selected) return;
  const q = state.questions.find((q) => q.id === e.questionId);
  const id = `${s.id}:${index}`;
  const correct = e.selected === q.correctOptionId;
  if (!state.attempts.some((a) => a.id === id))
    state.attempts.push({
      id,
      questionId: q.id,
      selected: e.selected,
      correct,
      at: now,
      sessionId: s.id,
      mode: s.mode,
    });
  e.attemptId = id;
  e.phase = "submitted";
  const r = state.reviews[q.id];
  if (!correct) state.reviews[q.id] = { streak: 0, due: now, weak: true };
  else if (r?.weak && now >= r.due) {
    r.streak++;
    r.weak = r.streak < 2;
    r.due = now + 86400000;
  }
  if (!correct && s.mode === "lesson" && !s.repeated.includes(q.id)) {
    s.repeated.push(q.id);
    s.entries.push({
      questionId: q.id,
      order: orderOptions(q),
      selected: null,
      phase: "unanswered",
      attemptId: null,
    });
  }
}
export function submit(state, now = Date.now()) {
  const s = activeSession(state);
  if (!s || s.finished || s.mode === "timed") return;
  record(state, s, s.entries[s.index], s.index, now);
}
export function finish(state, now = Date.now()) {
  const s = activeSession(state);
  if (!s || s.finished) return;
  if (s.mode === "timed")
    s.entries.forEach((e, i) =>
      record(state, s, e, i, Math.min(now, s.deadline)),
    );
  s.finished = now;
}
export function advance(state, now = Date.now()) {
  const s = activeSession(state);
  if (!s || s.finished) return;
  if (s.deadline && now >= s.deadline) {
    finish(state, now);
    return;
  }
  const e = s.entries[s.index];
  if (s.mode !== "timed" && !e.attemptId) return;
  if (e.attemptId) e.phase = "reviewed";
  if (s.index < s.entries.length - 1) s.index++;
  else finish(state, now);
}
export function toggleBookmark(state, id) {
  if (state.bookmarks.includes(id))
    state.bookmarks = state.bookmarks.filter((x) => x !== id);
  else state.bookmarks.push(id);
}
export function metrics(state, ids = state.questions.map((q) => q.id)) {
  const as = state.attempts.filter((a) => ids.includes(a.questionId));
  const first = new Map();
  as.forEach((a) => {
    if (!first.has(a.questionId)) first.set(a.questionId, a);
  });
  const firsts = [...first.values()];
  const repeats = as.filter((a) => first.get(a.questionId).id !== a.id);
  return {
    attempted: firsts.length,
    total: ids.length,
    firstCorrect: firsts.filter((a) => a.correct).length,
    repeatCount: repeats.length,
    repeatCorrect: repeats.filter((a) => a.correct).length,
    attempts: as.length,
  };
}
export function result(state, s) {
  const attempts = state.attempts.filter((a) => a.sessionId === s.id);
  return {
    correct: attempts.filter((a) => a.correct).length,
    answered: attempts.length,
    total: s.entries.length,
    unanswered: s.entries.length - attempts.length,
  };
}
export function restoreBackup(value) {
  if (!recordObject(value) || value.version !== 1 ||
      !Array.isArray(value.questions) || !Array.isArray(value.attempts) ||
      !Array.isArray(value.sessions) || !Array.isArray(value.bookmarks) ||
      !recordObject(value.reviews) || (value.active!==null&&!str(value.active)))
    throw Error("Invalid backup.");
  const errors=validateBank(value);
  if(errors.length)throw Error(errors.join("\n"));
  const questions=new Map(value.questions.map(q=>[q.id,q]));
  const attempts=new Map();
  for(const attempt of value.attempts){
    if(!recordObject(attempt)||!str(attempt.id)||!str(attempt.sessionId)||
       !['lesson','saved','weak','practice','timed'].includes(attempt.mode)||
       attempts.has(attempt.id)||!Number.isFinite(attempt.at))throw Error('Invalid attempt history.');
    const q=questions.get(attempt.questionId);
    if(!q||!q.options.some(o=>o.id===attempt.selected)||
       typeof attempt.correct!=='boolean'||attempt.correct!==(attempt.selected===q.correctOptionId))throw Error('Invalid attempt history.');
    attempts.set(attempt.id,attempt);
  }
  const sessions=new Map();const linkedAttempts=new Set();
  for(const session of value.sessions){
    if(!recordObject(session)||!str(session.id)||sessions.has(session.id)||
       !['lesson','saved','weak','practice','timed'].includes(session.mode)||
       !str(session.label)||!Number.isFinite(session.created)||
       (session.finished!==null&&(!Number.isFinite(session.finished)||session.finished<session.created))||
       !Array.isArray(session.entries)||!session.entries.length||
       !Number.isInteger(session.index)||session.index<0||session.index>=session.entries.length||
       !Number.isInteger(session.initialCount)||session.initialCount<1||session.initialCount>session.entries.length||
       !Array.isArray(session.repeated)||new Set(session.repeated).size!==session.repeated.length||
       session.repeated.some(id=>!questions.has(id))||
       (session.mode==='timed'?(!Number.isFinite(session.deadline)||session.deadline<=session.created):session.deadline!==null))throw Error('Invalid session.');
    for(const [index,entry] of session.entries.entries()){
      if(!recordObject(entry))throw Error('Invalid question state.');
      const q=questions.get(entry.questionId),attempt=attempts.get(entry.attemptId);
      if(!q||!Array.isArray(entry.order)||entry.order.length!==q.options.length||
         new Set(entry.order).size!==entry.order.length||entry.order.some(id=>!q.options.some(o=>o.id===id))||
         (q.preserveOrder&&entry.order.some((id,i)=>id!==q.options[i].id))||
         (entry.selected!==null&&!entry.order.includes(entry.selected))||
         !['unanswered','selected','submitted','reviewed'].includes(entry.phase)||
         (entry.attemptId!==null&&!str(entry.attemptId)))throw Error('Invalid question state.');
      if(entry.attemptId!==null){
        if(!attempt||linkedAttempts.has(entry.attemptId)||entry.attemptId!==`${session.id}:${index}`||
           attempt.sessionId!==session.id||attempt.mode!==session.mode||
           attempt.questionId!==entry.questionId||attempt.selected!==entry.selected||
           !['submitted','reviewed'].includes(entry.phase)||
           session.mode==='timed'&&session.finished===null)throw Error('Invalid attempt references.');
        linkedAttempts.add(entry.attemptId);
      }else if(entry.phase!==(entry.selected===null?'unanswered':'selected'))throw Error('Invalid question state.');
    }
    sessions.set(session.id,session);
  }
  if(linkedAttempts.size!==attempts.size||
     value.sessions.filter(s=>s.finished===null).length>1||
     value.active!==null&&!sessions.has(value.active)||
     new Set(value.bookmarks).size!==value.bookmarks.length||
     value.bookmarks.some(id=>!questions.has(id)))throw Error('Invalid saved references.');
  for(const [id,review]of Object.entries(value.reviews))
    if(!questions.has(id)||!recordObject(review)||typeof review.weak!=='boolean'||
       !Number.isFinite(review.due)||!Number.isInteger(review.streak)||review.streak<0)throw Error('Invalid review schedule.');
  return structuredClone(value);
}
