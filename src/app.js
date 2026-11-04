import {dailyPlan, allocatePractice, allocateMock, MOCK_2027, BLUEPRINT_2027_SOURCE, BLUEPRINT_2027_CHECKED} from "./planning.js";
import {hasVerifiedSourceExplanation} from "./verified-solutions.js";
import {hydrate,personalData,studyDraft,saveHydrated} from "./persistence.js";
import {
  applyLanguage,
  translate,
  getLanguage,
  toggleLanguage,
} from "./i18n.js";
import "./style.css";
import {
  TOPICS,
  CATEGORIES,
  fresh,
  importBank,
  eligible,
  startSession,
  activeSession,
  select,
  submit,
  advance,
  finish,
  toggleBookmark,
  metrics,
  result,
  setReflection,
} from "./model.js";
const KEY = "madar-study-v1";
let state = fresh(),
  storageError = "",
  startupError = "",
  notice = "";
let bundledBank={version:1,questions:[],reviewQueue:[],coverage:[]};
let documentViews={};let libraryPage=0;let libraryTopic='all';let libraryStatus='all';
let practiceDraft={topic:'all', count:10, mode:'practice', minutes:30};
let year = "",
  route = location.hash.slice(1) || "study";
try {
  year = localStorage.getItem("madar-year") || "";
} catch {
  storageError =
    "Browser storage is unavailable. Enable site storage before studying.";
}
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const btn = (label, action, cls = "button", extra = "") =>
  `<button class="${cls}" data-action="${action}" ${extra}>${label}</button>`;
const pct = (n, d) => (d ? Math.round((n / d) * 100) + "%" : "—");
const years = () =>
  [
    ...new Set(state.questions.flatMap((q) => q.sources.map((s) => s.year))),
  ].sort();
const qs = () => eligible(state, year);
const nav = (r) => {
  location.hash = r;
};
function commit(fn) {
  if (storageError)
    throw Error("Saving is paused to protect your original data.");
  const next = studyDraft(state);
  fn(next);
  try {
    localStorage.setItem(KEY, JSON.stringify(personalData(next,bundledBank)));
  } catch {
    throw Error(
      "Unable to save: storage is full or blocked. Export a backup. This action was not recorded.",
    );
  }
  state = next;
}
function download(data, name) {
  const url = URL.createObjectURL(
    new Blob([data], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}
const empty = (title, text) =>
  `<div class="empty"><div class="empty-icon">◇</div><h2>${title}</h2><p>${text}</p>${btn("Manage study sources →", "sources")}</div>`;
const progress = (m) =>
  `<div class="bar"><span style="width:${m.total ? (m.attempted / m.total) * 100 : 0}%"></span></div>`;
function stats(ids = qs().map((q) => q.id)) {
  const m = metrics(state, ids);
  const delayed = state.attempts.filter(a => ids.includes(a.questionId) && a.delayed === true);
  return `<div class="stats"><article><small>Questions attempted</small><strong>${m.attempted}<em> / ${m.total}</em></strong></article><article><small>First-attempt accuracy</small><strong>${pct(m.firstCorrect, m.attempted)}</strong><span>${m.firstCorrect} correct out of ${m.attempted}</span></article><article><small>Repeat-attempt accuracy</small><strong>${pct(m.repeatCorrect, m.repeatCount)}</strong><span>${m.repeatCorrect} correct out of ${m.repeatCount}</span></article><article><small>Delayed-retention accuracy</small><strong>${pct(delayed.filter(a => a.correct).length, delayed.length)}</strong><span>${delayed.length} due reviews${delayed.length < 10 ? " · small sample" : ""}</span></article></div>`;
}
function study() {
  const active = state.sessions.find((s) => !s.finished);
  const plan = dailyPlan(qs(), state.attempts, state.reviews, state.plan);
  const ar = getLanguage() === "ar";
  const tr = (en, arabic) => ar ? arabic : en;
  return `<section class="hero"><div><div class="eyebrow">YOUR NEXT CHAPTER</div><h1>A little progress today.<br><span>A deeper understanding tomorrow.</span></h1><p>Your quiet space to prepare for <bdi>CFA Level I</bdi>.<br>Learn from your sources. Revisit what needs attention.</p>${active ? btn("Resume your session →", "resume", "button light") : plan.due.length ? btn(`Review ${plan.due.length} due →`, "review-start", "button light", `data-mode="weak"`) : plan.next ? btn("Open your next module →", "topic", "button light", `data-topic="${esc(plan.next.topic)}"`) : btn("Browse sources →", "sources", "button light")}</div><div class="orb" aria-hidden="true"><div>I<small>CFA LEVEL</small></div></div></section><section class="panel" dir="${ar ? 'rtl' : 'ltr'}"><span class="eyebrow">${tr("TODAY'S SEQUENCE", "خطة اليوم")}</span><h2>${tr(`A plan for ${plan.minutes} minutes`, `خطة لمدة ${plan.minutes} دقيقة`)}</h2><p>${plan.examDate ? `${tr('Exam:', 'الاختبار:')} ${esc(plan.examDate)} ${plan.days >= 0 ? `· ${plan.days} ${tr('days remaining', 'يومًا متبقيًا')}` : `· ${tr('date has passed', 'مضى الموعد')}`}` : tr('Set your exam date and available time below.', 'حدد موعد الاختبار والوقت المتاح أدناه.')}</p>${plan.paceGap > 0 ? `<p>${tr(`At ${plan.practiceCount} questions per day, at least ${plan.paceGap} currently unseen questions would remain by the exam date, even if every practice question were new.`, `بمعدل ${plan.practiceCount} أسئلة يوميًا، سيبقى ${plan.paceGap} سؤالًا غير مجاب عنه على الأقل بحلول الاختبار، حتى لو كانت كل أسئلة التدريب جديدة.`)}</p>` : ''}<ol><li>${plan.due.length} ${tr('reviews due', 'مراجعات مستحقة')} ${plan.due.length && !active ? btn(tr('Review due', 'راجع المستحق'), 'review-start', 'secondary', 'data-mode="weak"') : ''}</li><li>${plan.next ? `${tr('Next module:', 'الوحدة التالية:')} <strong dir="ltr">${esc(plan.next.module)}</strong> (${esc(plan.next.topic)}; ${plan.next.attempted}/${plan.next.total} ${tr('questions attempted', 'أسئلة أُجيب عنها')}). ${tr('Chosen for the lowest available-question coverage; review needs break ties.', 'اختيرت لأقل تغطية للأسئلة المتاحة، وتُستخدم الحاجة للمراجعة عند التساوي.')}` : tr('No verified source modules available for this year.', 'لا توجد وحدات موثقة متاحة لهذه السنة.')}</li><li>${tr('Targeted practice: about', 'تدريب موجّه: نحو')} ${plan.practiceCount} ${tr('questions', 'أسئلة')} ${plan.next && !active ? btn(tr('Practice this topic', 'تدرّب على الموضوع'), 'daily-practice', 'secondary', `data-topic="${esc(plan.next.topic)}" data-count="${plan.practiceCount}"`) : ''}</li><li>${tr('Review errors and add a brief note.', 'راجع الأخطاء وأضف ملاحظة قصيرة.')}</li><li>${tr('Return for scheduled revisits.', 'عُد للمراجعات المجدولة.')}</li></ol><p class="footnote">${tr('Coverage measures attempted questions, not mastery. Module mapping follows the available source records; learning-outcome coverage is not yet verified.', 'تقيس التغطية الأسئلة التي أُجيب عنها ولا تعني الإتقان. تتبع الوحدات سجلات المصادر المتاحة؛ ولم تُتحقق تغطية مخرجات التعلم بعد.')}</p><details><summary>${tr('Adjust study plan', 'تعديل خطة الدراسة')}</summary><form id="plan-form" class="form-grid"><label>${tr('Exam date', 'موعد الاختبار')} <input type="date" name="examDate" value="${esc(state.plan?.examDate || '')}"></label><label>${tr('Minutes available per day', 'الدقائق المتاحة يوميًا')} <input type="number" name="minutes" min="10" max="480" value="${plan.minutes}" required></label><button class="button">${tr('Save plan', 'حفظ الخطة')}</button></form></details></section>${stats()}<div class="section-head"><div><span class="eyebrow">THE CURRICULUM</span><h2>Your study path</h2></div><span class="muted">10 topics · coverage follows your sources</span></div><div class="topics">${TOPICS.map(
    (t, i) => {
      const group = qs().filter((q) => q.topic === t),
        m = metrics(
          state,
          group.map((q) => q.id),
        );
      return `<button class="topic" data-action="topic" data-topic="${esc(t)}"><span class="topic-number">${String(i + 1).padStart(2, "0")}</span><div><h3 dir="ltr">${t}</h3><span>${group.length ? `${group.length} source-linked questions · ${m.attempted} attempted` : "No source questions imported yet"}</span>${progress(m)}</div><span class="arrow">‹</span></button>`;
    },
  ).join(
    "",
  )}</div><p class="footnote">2027 source books inspected. Question coverage is limited to the verified records loaded here.</p>`;
}
function topic(name) {
  const group = qs().filter((q) => q.topic === name),
    modules = [...new Set(group.map((q) => q.module))];
  return `${btn("→ All topics", "study", "text-button")}<div class="page-heading"><span class="eyebrow">STUDY PATH</span><h1 dir="ltr">${esc(name)}</h1><p>Lesson completion means answering its questions; it does not imply mastery.</p></div>${stats(group.map((q) => q.id))}${
    modules.length
      ? `<div class="lessons">${modules
          .map((m, i) => {
            const ids = group.filter((q) => q.module === m).map((q) => q.id),
              metric = metrics(state, ids),
              completed = state.sessions.some(
                (s) =>
                  s.mode === "lesson" &&
                  s.finished &&
                  s.label === m &&
                  s.entries.slice(0, s.initialCount).length === ids.length &&
                  s.entries
                    .slice(0, s.initialCount)
                    .every((e) => ids.includes(e.questionId) && e.attemptId),
              );
            return `<article class="lesson"><div class="step">${i + 1}</div><div><h2 dir="ltr">${esc(m)}</h2><p>${metric.attempted} / ${ids.length} questions attempted · ${completed ? "Lesson complete" : "Lesson incomplete"}</p>${progress(metric)}</div>${btn("Start lesson", "lesson", "button", `data-topic="${esc(name)}" data-module="${esc(m)}"`)}</article>`;
          })
          .join("")}</div>`
      : empty(
          "Your lessons start with your books",
          "No verified questions for this topic and year yet. Actual source modules appear after import.",
        )
  }`;
}
function timedTestInProgress() {
  return state.sessions.some(s => s.mode === 'timed' && !s.finished);
}
const embeddedSourceImages = new Map();
function sourceImageUrl(src) {
  const encoded = globalThis.MADAR_BUNDLED_ASSETS?.[src];
  if (!encoded) return src;
  if (!embeddedSourceImages.has(src)) {
    const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
    embeddedSourceImages.set(src, URL.createObjectURL(new Blob([bytes], {type: 'image/webp'})));
  }
  return embeddedSourceImages.get(src);
}
function sourceDocument(m, required = false, viewScope = '') {
  const session = activeSession(state);
  const viewKey = [viewScope || `${session?.id || 'none'}:${session?.index ?? 0}`, m.id].join(':');
  const chosen = documentViews[viewKey] ?? m.initialPage;
  const page = m.pages.find(p => p.pdfPage === Number(chosen)) || m.pages.find(p => p.pdfPage === m.initialPage) || m.pages[0];
  return `<section class="source-document"><label>${translate('Original source · PDF page')} <select aria-label="${translate('Original source page')}" class="source-page-select" data-view-key="${esc(viewKey)}">${m.pages.map(p => `<option value="${p.pdfPage}" data-src="${esc(p.src)}" ${p.pdfPage === page.pdfPage ? 'selected' : ''}>${p.pdfPage}</option>`).join('')}</select></label><p class="footnote" data-original>${esc(m.title)}</p><p class="footnote">${translate('Other section pages are available above for shared passages and tables.')}</p><figure class="source-figure"><img loading="${required ? 'eager' : 'lazy'}" class="source-image ${required ? 'required-source-image' : ''}" src="${esc(sourceImageUrl(page.src))}" alt="Original source PDF page ${page.pdfPage}"><details><summary>${translate('Enlarge source page')}</summary><div class="image-pan" tabindex="0"><img loading="lazy" src="${esc(sourceImageUrl(page.src))}" alt="Original source page ${page.pdfPage}, enlarged"></div></details></figure><p class="source-error" role="alert"></p></section>`;
}
function material(m) {
  if(m.type==='document')return sourceDocument(m,true);
  if (m.type === "table")
    return `<div class="table-wrap" tabindex="0" aria-label="Source table"><table><thead><tr>${m.headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${m.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  if (m.type === "image")
    return `<figure class="source-figure"><img class="source-image required-source-image" src="${esc(m.src)}" alt="${esc(m.alt)}"><details><summary>Enlarge source image</summary><div class="image-pan" tabindex="0"><img src="${esc(m.src)}" alt="${esc(m.alt)}"></div></details><p class="source-error" role="alert"></p></figure>`;
  return `<div class="material ${m.type}">${esc(m.text)}</div>`;
}
function provenance(q) {
  return `<details class="provenance"><summary>Source and verification</summary><div dir="ltr" data-original>${q.sources.map((s) => `<p><b>${esc(s.title)}</b><br>${esc(s.category)} · ${esc(s.edition)} · ${esc(s.year)}<br>Question: ${esc(s.location)}<br>Answer: ${esc(s.answerLocation)}</p>`).join("")}<small>Verified by: ${esc(q.verifiedBy)}</small></div></details>`;
}
function feedback(q, selected) {
  const skipped = !selected;
  const option = q.options.find(o => o.id === q.correctOptionId);
  const verified = hasVerifiedSourceExplanation(q);
  return `<div class="feedback ${skipped ? "" : selected === q.correctOptionId ? "success" : "error"}" role="status"><b>${skipped ? "Skipped" : selected === q.correctOptionId ? "Correct answer" : "Incorrect answer"}</b><p dir="ltr">Correct answer: ${esc(q.correctOptionId)}${option ? `. ${esc(option.text)}` : ''}</p></div><section class="explanation"><h3>Source explanation</h3>${verified ? `<div dir="ltr" data-original>${esc(q.explanation)}</div>` : '<p>Shared solution pages are withheld until the explanation for this question can be verified without revealing other answers.</p>'}</section>`;
}
function session() {
  const s = activeSession(state);
  if (!s)
    return empty(
      "No active session",
      "Choose a topic or verified question collection to start.",
    );
  if (s.finished) return results(s);
  const e = s.entries[s.index],
    q = state.questions.find((q) => q.id === e.questionId),
    revealed = !!e.attemptId && s.mode !== "timed";
  return `<div class="session-top">${btn("Save and exit", "study", "text-button")}<span>${esc(s.label)}</span>${s.deadline ? '<b id="timer" class="timer"></b>' : `<span dir="ltr">${s.index + 1} / ${s.entries.length}</span>`}</div><div class="bar"><span style="width:${(s.index / s.entries.length) * 100}%"></span></div><article class="question"><div class="section-head"><span class="eyebrow">${s.index >= s.initialCount ? "Reviewing a previous mistake" : "QUESTION " + (s.index + 1)}</span>${btn(state.bookmarks.includes(q.id) ? "★ Saved" : "☆ Save", "bookmark", "text-button", `data-id="${esc(q.id)}" aria-pressed="${state.bookmarks.includes(q.id)}"`)}</div><small class="muted" dir="ltr">${esc(q.topic)} / ${esc(q.module)}</small><div dir="ltr" class="question-text" data-original><h2>${esc(q.text)}</h2>${q.presentation==='source'?'<p class="footnote">Searchable transcription; compare with the original source below. Layout and wording may need verification.</p>':''}${q.presentation !== 'source' ? q.materials.map(material).join("") : ""}<fieldset aria-label="Answer options" ${revealed ? "disabled" : ""}>${e.order
    .map((id, i) => {
      const o = q.options.find((o) => o.id === id);
      return `<label class="option ${e.selected === id ? "selected" : ""} ${revealed && id === q.correctOptionId ? "correct" : ""} ${revealed && e.selected === id && id !== q.correctOptionId ? "incorrect" : ""}"><input type="radio" name="answer" value="${esc(id)}" ${e.selected === id ? "checked" : ""}><span class="letter">${esc(o.id)}</span><span>${esc(o.text)}</span>${revealed && id === q.correctOptionId ? '<b aria-label="Correct">✓</b>' : ""}</label>`;
    })
    .join(
      "",
    )}</fieldset>${q.presentation === 'source' ? q.materials.map(material).join("") : ""}</div>${s.mode !== "timed" ? `<div class="panel"><label>Confidence <select id="confidence" ${revealed ? "disabled" : ""}><option value="" ${!e.reflection?.confidence?'selected':''}>Not specified</option><option value="sure" ${e.reflection?.confidence==='sure'?'selected':''}>Sure</option><option value="uncertain" ${e.reflection?.confidence==='uncertain'?'selected':''}>Uncertain</option><option value="guessed" ${e.reflection?.confidence==='guessed'?'selected':''}>Guessed</option></select></label><label>Error label <input id="error-label" maxlength="80" value="${esc(e.reflection?.errorLabel || '')}" placeholder="Optional concept or error type"></label><label>Personal note <textarea id="error-note" maxlength="500">${esc(e.reflection?.note || '')}</textarea></label></div>` : ""}${revealed ? feedback(q, e.selected) : ""}${provenance(q)}<div class="question-actions">${s.mode === "timed" ? `${btn("Previous", "previous", "secondary", s.index === 0 ? "disabled" : "")}${btn(s.index === s.entries.length - 1 ? "Finish test" : "Next / skip", "next")}` : revealed ? btn(s.index === s.entries.length - 1 ? "Finish session" : "Continue →", "next") : btn("Submit answer", "submit", "button", e.selected ? "" : "disabled")}</div>${s.mode === "timed" ? '<p class="footnote">Answers stay hidden until the test ends. The timer continues when you leave.</p>' : btn("End session early", "end", "text-button")}</article>`;
}
function questionLabel(q) {
  return q.text;
}
function results(s) {
  const r = result(state, s);
  const conceal = timedTestInProgress();
  return `<div class="page-heading"><span class="eyebrow">SESSION COMPLETE</span><h1>Every attempt builds understanding.</h1><p>${esc(s.label)}</p></div><div class="result-card"><span class="eyebrow">${s.mode === "timed" ? "Score across the full test" : "Accuracy of recorded answers"}</span><strong>${pct(r.correct, s.mode === "timed" ? r.total : r.answered)}</strong><p>${r.correct} / ${s.mode === "timed" ? r.total : r.answered} correct · ${r.unanswered} unanswered</p><small>Scores are calculated from saved entries; historical attempts are unchanged. Accuracy among answered questions: ${pct(r.correct, r.answered)} (${r.correct}/${r.answered}). Unanswered questions are included in the full-test score.</small></div><div class="question-actions">${btn("Back to study", "study")}${btn("Open review queue", "weak", "secondary")}</div>${s.entries
    .map((e, i) => {
      const q = state.questions.find((q) => q.id === e.questionId);
      return `<details class="review-item"><summary><span>${i + 1}. ${esc(questionLabel(q))}</span><b>${conceal ? "" : e.selected ? (e.selected === q.correctOptionId ? "✓" : "×") : "—"}</b></summary><div dir="ltr">${q.presentation === "source" ? '<p class="footnote">Searchable transcription; compare with the original source. Layout and wording may need verification.</p>' : ""}${q.materials.map(material).join("")}${conceal ? "" : q.options.map((o) => `<p>${o.id === q.correctOptionId ? "✓ " : ""}${esc(o.id)}. ${esc(o.text)}</p>`).join("")}</div>${conceal ? "<p>Answers are hidden while a timed test is active.</p>" : feedback(q, e.selected)}<label>Personal note <textarea class="result-note" data-entry-index="${i}" maxlength="500">${esc(e.reflection?.note || '')}</textarea></label><label>Error label <input class="result-label" data-entry-index="${i}" maxlength="80" value="${esc(e.reflection?.errorLabel || '')}"></label>${btn(state.bookmarks.includes(q.id) ? "★ Saved" : "☆ Save", "bookmark", "text-button", `data-id="${esc(q.id)}"`)}${provenance(q)}</details>`;
    })
    .join("")}`;
}
function review(mode) {
  const group = qs().filter((q) =>
      mode === "saved"
        ? state.bookmarks.includes(q.id)
        : state.reviews[q.id]?.weak,
    ),
    due = group.filter((q) => state.reviews[q.id]?.due <= Date.now());
  return `<div class="page-heading"><span class="eyebrow">FOCUSED REVIEW</span><h1>${mode === "saved" ? "Your saved questions" : "Review queue"}</h1><p>${mode === "saved" ? "Return to questions worth another look." : "Incorrect, skipped, uncertain and guessed answers enter review. Due reviews continue on increasing intervals; same-session retries do not advance the schedule."}</p></div>${group.length ? `${btn(mode === "saved" ? "Review saved questions" : `Review due now (${due.length})`, "review-start", "button", `data-mode="${mode}" ${mode === "weak" && !due.length ? "disabled" : ""}`)}<div class="review-list">${group.map((q) => `<article class="review-item"><h3 dir="ltr">${esc(q.text)}</h3><small dir="ltr">${esc(q.module)}</small><p>${mode === "weak" ? `Reason: ${esc(state.reviews[q.id].reason || "previous review")} · Next review: ${new Date(state.reviews[q.id].due).toLocaleString(getLanguage() === "ar" ? "ar-SA" : "en-GB")}` : ""}</p>${btn(state.bookmarks.includes(q.id) ? "★ Remove bookmark" : "☆ Save", "bookmark", "text-button", `data-id="${esc(q.id)}"`)}${provenance(q)}</article>`).join("")}</div>` : empty(mode === "saved" ? "No saved questions yet" : "No scheduled reviews yet", mode === "saved" ? "Use the star while studying to save a question." : "Due and scheduled reviews appear here. No recorded mistakes does not imply mastery.")}`;
}
function tests() {
  return `<div class="page-heading"><span class="eyebrow">PRACTICE WITH PURPOSE</span><h1>Practice at your pace.</h1><p>Topic practice or a timed test from your verified source questions.</p></div><form id="practice-form" class="panel"><label>Topic<select name="topic"><option value="all" ${practiceDraft.topic === "all" ? "selected" : ""}>All available topics</option>${TOPICS.map((t) => `<option ${practiceDraft.topic === t ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></label><div class="form-grid"><label>Question count<input name="count" type="number" min="1" max="180" value="${esc(practiceDraft.count)}" required></label><label>Session mode<select name="mode"><option value="practice" ${practiceDraft.mode === "practice" ? "selected" : ""}>Practice with immediate feedback</option><option value="timed" ${practiceDraft.mode === "timed" ? "selected" : ""}>Timed test</option></select></label><label>Test duration in minutes<input name="minutes" type="number" min="1" max="240" value="${esc(practiceDraft.minutes)}" required></label></div><p class="muted">Questions with fewer previous attempts are selected first. All-topic practice rotates evenly across available topics; it is not an official exam-weighted mock. When fewer questions are available, the session uses the available count.</p><button class="button" ${qs().length ? "" : "disabled"}>Start session →</button>${!qs().length ? "<p>Import verified questions before starting practice.</p>" : ""}</form><form id="mock-form" class="panel"><h2>2027 mock session</h2><p>Each session contains 90 fresh questions in 135 minutes. Allocation is one fixed choice within the published 2027 topic-weight ranges across the two sessions; it is not a passing-score prediction. Previously shown questions, including skipped items, and exact normalized stem-and-choice duplicates are excluded. Similar variants may remain undetected.</p><label>Session <select name="preset"><option value="session1">Session 1</option><option value="session2">Session 2</option></select></label><div class="form-grid">${Object.entries(MOCK_2027).map(([name, allocation]) => `<div><b>${name === 'session1' ? 'Session 1' : 'Session 2'}</b><ul>${Object.entries(allocation).map(([topic,count]) => `<li>${esc(topic)}: ${count}</li>`).join('')}</ul></div>`).join('')}</div><p>Source: <a href="${BLUEPRINT_2027_SOURCE}" target="_blank" rel="noopener noreferrer">CFA Institute Level I exam</a> · checked ${BLUEPRINT_2027_CHECKED}. A session starts only when every allocated topic has enough fresh source questions.</p><button class="button" ${year === '2027' ? '' : 'disabled'}>Prepare mock session →</button>${year !== '2027' ? '<p>Select 2027 as the source year to use this preset.</p>' : ''}</form>`;
}
function progressPage() {
  return `<div class="page-heading"><span class="eyebrow">YOUR STUDY, IN NUMBERS</span><h1>Progress you can measure.</h1><p>First accuracy: correct first attempts ÷ distinct questions attempted. Repeats are counted separately.</p></div>${stats()}<p class="footnote">Percentages based on fewer than 10 questions are a limited signal. Delayed retention counts only attempts made in a later session when a review was due.</p><h2>Coverage by topic</h2><div class="review-list">${TOPICS.map(t => { const group=qs().filter(q=>q.topic===t); const m=metrics(state,group.map(q=>q.id)); return `<article class="review-item"><strong>${esc(t)}</strong><p>${m.attempted}/${m.total} questions attempted · first-attempt accuracy ${pct(m.firstCorrect,m.attempted)}${m.attempted<10 ? " · small sample" : ""}</p></article>`; }).join("")}</div><div class="review-links">${btn("☆ Saved questions", "saved", "panel")}${btn("↻ Review queue", "weak", "panel")}</div><h2>Session history</h2>${
    state.sessions
      .filter((s) => s.finished)
      .reverse()
      .map((s) => {
        const r = result(state, s);
        return `<button class="history" data-action="history" data-id="${s.id}"><span>${esc(s.label)}<small>${new Date(s.finished).toLocaleString(getLanguage() === "ar" ? "ar-SA" : "en-GB")}</small></span><b>${r.correct} / ${s.mode === "timed" ? r.total : r.answered} correct${s.mode === "timed" ? ` · ${pct(r.correct, r.total)} full-test score (calculated from saved entries)` : ""}</b></button>`;
      })
      .join("") ||
    '<p class="muted">Completed session results will appear here.</p>'
  }`;
}
const sourceNames = {
  curriculum: "CFA Curriculum",
  schweser: "Schweser",
  les: "LES Practice",
  "practice-pack": "LES Practice Pack",
};
function library(){
 if(timedTestInProgress())return `<div class="page-heading"><h1>Source library</h1><p>The source library is unavailable while a timed test is active. Finish the test to browse original question and solution pages.</p>${btn('Resume your session →','resume')}</div>`;
 const records=[...state.questions,...(bundledBank.reviewQueue||[])];
 const selected=records.filter(q=>(libraryTopic==='all'||q.topic===libraryTopic)&&(libraryStatus==='all'||(libraryStatus==='ready'?q.status==='validated':libraryStatus==='unresolved'?q.correctOptionId===null:q.status!=='validated'&&q.correctOptionId!==null)));
 const pageCount=Math.max(1,Math.ceil(selected.length/20));libraryPage=Math.min(libraryPage,pageCount-1);
 const timed=timedTestInProgress();
 return `<div class="page-heading"><span class="eyebrow">YOUR SOURCE LIBRARY</span><h1>Questions connected to their sources.</h1><p>Original-page practice keeps tables, figures and formulas intact. Searchable transcriptions below may still need layout review. Pending records are excluded from scored sessions.</p></div><div class="panel form-grid"><label>Topic<select id="library-topic"><option value="all">All topics</option>${TOPICS.map(t=>`<option ${libraryTopic===t?'selected':''}>${esc(t)}</option>`).join('')}</select></label><label>Status<select id="library-status">${[['all','All records'],['ready','Ready for practice'],['review','Needs verification'],['unresolved','Missing answer or options']].map(([id,t])=>`<option value="${id}" ${libraryStatus===id?'selected':''}>${t}</option>`).join('')}</select></label><p>${selected.length} records · Page ${libraryPage+1} / ${pageCount}</p></div>${selected.slice(libraryPage*20,libraryPage*20+20).map(q=>`<details class="review-item library-record"><summary><span>${esc(q.text.slice(0,220))}</span><small>${q.status==='validated'?'Ready for practice':'Needs verification'}</small></summary><p dir="ltr">${esc(q.topic)} · ${esc(q.module)}</p><p class="footnote">Searchable source transcription</p><div data-original dir="ltr"><p>${esc(q.text)}</p>${q.options.map(o=>`<p>${esc(o.id)}. ${esc(o.text)}</p>`).join('')}</div>${q.materials?.length?q.materials.map(m=>m.type==='document'?sourceDocument(m,false,q.id):material(m)).join(''):q.conversion?.questionPages?.length?sourceDocument({id:q.id+'-reference',type:'document',title:q.sources[0].title,initialPage:q.conversion.questionPages[0],pages:(q.conversion.sectionPages||q.conversion.questionPages).map(n=>({pdfPage:n,src:'question-assets/'+q.conversion.sourceSha256.slice(0,12)+'-p'+n+'.webp'}))}):''}${timed?'<p>Answers are hidden while a timed test is active.</p>':`<details><summary>Source answer and explanation</summary><div data-original dir="ltr"><p>${q.correctOptionId?'Source answer: '+esc(q.correctOptionId):'No unambiguous source answer linked. Excluded from scored practice.'}</p><p>${esc(q.explanation||'No source explanation linked.')}</p></div>${(q.explanationMaterials||[]).map(m=>sourceDocument(m,false,q.id)).join('')}</details>`}<details><summary>Verification notes</summary><p>${esc(q.verifiedBy||'Not approved for scored practice.')}</p><ul>${(q.conversion?.issues||[]).map(i=>`<li>${esc(i)}</li>`).join('')}</ul></details>${provenance(q)}</details>`).join('')}<div class="question-actions">${btn('Previous page','library-prev','secondary',libraryPage?'':'disabled')}${btn('Next page','library-next','secondary',libraryPage<pageCount-1?'':'disabled')}</div>`;
}
function sources() {
  const groups = new Map();
  state.questions.forEach((q) =>
    q.sources.forEach((s) => {
      const key = [s.category, s.year, q.topic, q.module].join(" | ");
      if (!groups.has(key)) groups.set(key, new Set());
      groups.get(key).add(q.id);
    }),
  );
  return `<div class="page-heading"><span class="eyebrow">A LIBRARY YOU CAN TRUST</span><h1>Your sources, intact.</h1><p>Original questions from your books and account, with their source references.</p></div><div class="panel"><h2>Converted question library</h2><p>${state.questions.filter(q=>q.status==='validated').length} ready for practice · ${state.questions.filter(q=>q.status!=='validated').length+(bundledBank.reviewQueue?.length||0)} awaiting verification. Original source-page mode uses the printed question and solution, with independently matched answer keys.</p>${btn('Browse all converted questions','library','button')}</div><div class="source-grid">${CATEGORIES.map(
    (c) => {
      const count = state.questions.filter((q) =>
        q.sources.some((s) => s.category === c),
      ).length;
      return `<article class="panel"><span class="source-mark">▤</span><h3 dir="ltr">${sourceNames[c]}</h3><p>${count} imported records</p><small>${count ? "Source total not yet reconciled" : "Source access pending"}</small></article>`;
    },
  ).join(
    "",
  )}</div><div class="panel"><h2>Import verified questions</h2><p>Choose a JSON question package. Structural checks do not replace comparison against original pages.</p><label class="file-label">Choose question file<input id="bank-file" type="file" accept=".json,application/json"></label><p class="footnote">Records under review or with conflicting source years are excluded from scored practice.</p></div><div class="panel"><h2>Source and module coverage</h2><p>Coverage totals remain unverified outside the checked sample. See the source inventory for inspected books and modules.</p>${
    groups.size
      ? `<div class="table-wrap"><table><thead><tr><th>Source / year / topic / module</th><th>Imported</th><th>Verified</th><th>Pending</th></tr></thead><tbody>${[
          ...groups,
        ]
          .map(([key, ids]) => {
            const valid = state.questions.filter(
              (q) =>
                ids.has(q.id) &&
                q.status === "validated" &&
                new Set(q.sources.map((s) => s.year)).size === 1,
            ).length;
            return `<tr><td dir="ltr">${esc(key)}</td><td>${ids.size}</td><td>${valid}</td><td>${ids.size - valid}</td></tr>`;
          })
          .join("")}</tbody></table></div>`
      : '<p class="muted">No extracted modules yet. Book counts do not establish question coverage.</p>'
  }</div><div class="panel"><h2>Typography</h2><p>Thmanyah fonts load automatically with the application.</p></div><div class="panel"><h2>Protect your progress</h2><p>Stored in this browser only. Clearing site data removes progress. Export regular backups to move between devices.</p>${btn("Export questions and progress", "export", "secondary")}<label class="file-label">Restore a backup<input id="backup-file" type="file" accept=".json,application/json"></label><p class="footnote">Restore replaces this browser's study data after confirmation. Export your current backup first.</p></div>`;
}
function render() {
  if (startupError) {
    document.querySelector('#app').innerHTML=`<main class="panel" style="max-width:680px;margin:60px auto;padding:32px"><h1>Your questions could not load</h1><p>Your saved progress has not been replaced. Retry loading the question library.</p><p class="footnote" role="alert">${esc(startupError)}</p><div class="question-actions">${btn('Retry loading questions','reload-library')}${btn('Export raw data','raw','secondary')}${btn(getLanguage()==='en'?'العربية':'English','language','secondary language-toggle')}</div></main>`;
    applyLanguage(document.querySelector('#app'));
    return;
  }
  if (!years().includes(year)) year = years()[0] || "";
  const section = route.startsWith("topic:") ? "study" : route;
  const tabs = [
    ["study", "◫", "Study"],
    ["tests", "◷", "Practice"],
    ["progress", "▥", "Progress"],
    ["saved", "☆", "Saved"],
    ["sources", "▤", "Sources"],
  ];
  document.querySelector("#app").innerHTML =
    `<aside><a class="brand" href="#study"><span class="brand-symbol">M</span><div>Madar<small>CFA LEVEL I</small></div></a><p class="nav-caption">Your study space</p><nav>${tabs.map(([id, icon, label]) => `<a href="#${id}" class="${section === id ? "active" : ""}" ${section === id ? 'aria-current="page"' : ""}><span>${icon}</span>${label}</a>`).join("")}</nav><div class="side-note"><span>◉</span><b>Learn with confidence.</b><p>Clear sources.<br>Progress saved.<br>One step at a time.</p></div><small class="local-note">◌ Saved on this device</small></aside><div class="workspace"><header><button class="secondary language-toggle" data-action="language" aria-label="Translate interface">${getLanguage() === "en" ? "العربية" : "English"}</button><span><b>Madar</b> · Your path to <bdi>CFA Level I</bdi></span><label>Source year <select id="year" aria-label="Curriculum year">${
      years().length
        ? years()
            .map(
              (y) =>
                `<option ${y === year ? "selected" : ""}>${esc(y)}</option>`,
            )
            .join("")
        : "<option>Awaiting sources</option>"
    }</select></label></header><main id="main">${storageError ? `<div class="alert">${esc(storageError)}${btn("Export raw data", "raw", "secondary")}</div>` : ""}${state.pinnedQuestionIds?.length ? `<div class="alert" role="status">${state.pinnedQuestionIds.length} saved question versions are retained for history. Changed source content needs a new question revision ID.</div>` : ""}${state.legacyUnverifiedQuestionIds?.length ? `<div class="alert" role="status">Earlier question versions could not be verified for ${state.legacyUnverifiedQuestionIds.length} historical records. Restore a prior full backup if available; historical attempts have not been changed.</div>` : ""}${notice ? `<div class="alert" role="status">${esc(notice)}${btn("Close", "dismiss", "text-button")}</div>` : ""}${route.startsWith("topic:") ? topic(decodeURIComponent(route.slice(6))) : ({ study, tests, progress: progressPage, saved: () => review("saved"), weak: () => review("weak"),
        library, sources, session }[route] || study)()}</main><footer>Madar · Independent study from your personal sources</footer></div>`;
  applyLanguage(document.querySelector("#app"));
  checkSourceReadiness();
  tick();
}
let launching = false;
async function launch(ids, mode, label, minutes) {
  if (launching) return;
  launching = true;
  try {
    if (mode === "timed") {
      notice = "Preparing assessment pages before starting the clock…"; render();
      const selected = ids.map(id => state.questions.find(q => q.id === id)).filter(Boolean);
      const urls = [...new Set(selected.flatMap(q => q.materials.flatMap(m => m.type === 'document' ? m.pages.map(p => p.src) : m.type === 'image' ? [m.src] : [])))];
      await Promise.all(urls.map(src => new Promise((resolve, reject) => {
        const img = new Image();
        const timer = setTimeout(() => reject(Error("A source page timed out. Check your connection and retry; the test has not started.")), 30000);
        img.onload = () => { clearTimeout(timer); resolve(); };
        img.onerror = () => { clearTimeout(timer); reject(Error("A source page could not load. Check your connection and retry; the test has not started.")); };
        img.src = sourceImageUrl(src);
      })));
    }
    notice = "";
    commit((s) => startSession(s, ids, mode, label, Date.now(), minutes));
    nav("session");
    if (route === "session") render();
  } finally { launching = false; }
}
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-action]");
  if (!b) return;
  try {
    const a = b.dataset.action;
    if (a === 'reload-library') {
      initialize();
      return;
    }
    if (a === "language") {
      toggleLanguage();
      render();
      return;
    }
    if (["study", "tests", "sources", "saved", "weak", "progress", "library"].includes(a))
      nav(a);
    else if(a==='library-prev'||a==='library-next'){libraryPage+=a==='library-prev'?-1:1;render();window.scrollTo(0,0);}
    else if (a === "topic") nav("topic:" + encodeURIComponent(b.dataset.topic));
    else if (a === "lesson")
      await launch(
        qs()
          .filter(
            (q) => q.topic === b.dataset.topic && q.module === b.dataset.module,
          )
          .map((q) => q.id),
        "lesson",
        b.dataset.module,
      );
    else if (a === "resume") {
      commit((s) => {
        s.active = s.sessions.find((x) => !x.finished).id;
      });
      nav("session");
    } else if (a === "bookmark") {
      commit((s) => toggleBookmark(s, b.dataset.id));
      render();
    } else if (a === "submit") {
      if(!sourceReady())throw Error("Wait for the original source page to load before submitting.");
      commit((s) => submit(s));
      render();
    } else if (a === "next") {
      commit((s) => advance(s));
      render();
      window.scrollTo(0, 0);
    } else if (a === "previous") {
      commit((s) => {
        const t = activeSession(s);
        if (t.deadline && Date.now() >= t.deadline) finish(s);
        else if (!t.finished && t.index > 0) t.index--;
      });
      render();
    } else if (a === "end") {
      if (
        confirm(
          translate(
            "End this session now? Your recorded answers will remain saved.",
          ),
        )
      ) {
        commit((s) => finish(s));
        render();
      }
    } else if (a === "daily-practice") {
      await launch(allocatePractice(qs(), state.attempts, Number(b.dataset.count), b.dataset.topic), "practice", `Targeted practice: ${b.dataset.topic}`);
    } else if (a === "review-start") {
      const mode = b.dataset.mode;
      await launch(
        qs()
          .filter((q) =>
            mode === "saved"
              ? state.bookmarks.includes(q.id)
              : state.reviews[q.id]?.weak &&
                state.reviews[q.id].due <= Date.now(),
          )
          .map((q) => q.id),
        mode,
        mode === "saved" ? "Saved" : "Due review",
      );
    } else if (a === "history") {
      commit((s) => {
        s.active = b.dataset.id;
      });
      nav("session");
    } else if (a === "export")
      download(JSON.stringify(state, null, 2), "madar-backup.json");
    else if (a === "raw")
      download(localStorage.getItem(KEY) || "", "madar-recovery.json");
    else if (a === "dismiss") {
      notice = "";
      render();
    }
  } catch (err) {
    notice = err.message;
    render();
  }
});
document.addEventListener("change", async (e) => {
  try {
    if(e.target.id==='library-topic'||e.target.id==='library-status'){if(e.target.id==='library-topic')libraryTopic=e.target.value;else libraryStatus=e.target.value;libraryPage=0;render();return;}
    if(e.target.classList.contains('source-page-select')){
      const key=e.target.dataset.viewKey;documentViews[key]=e.target.value;
      const option=e.target.selectedOptions[0];for(const image of e.target.closest('.source-document').querySelectorAll('img'))image.src=sourceImageUrl(option.dataset.src);
      checkSourceReadiness();return;
    }
    if (e.target.classList.contains("result-note") || e.target.classList.contains("result-label")) {
      const index = Number(e.target.dataset.entryIndex), value = e.target.value;
      commit(s => setReflection(s, e.target.classList.contains("result-note") ? {note:value} : {errorLabel:value}, index));
      return;
    }
    if (["confidence", "error-label", "error-note"].includes(e.target.id)) {
      const value = e.target.value;
      commit((s) => { const current = activeSession(s).entries[activeSession(s).index].reflection || {}; setReflection(s, {...current, ...(e.target.id === "confidence" ? {confidence:value || null} : e.target.id === "error-label" ? {errorLabel:value} : {note:value})}); });
      return;
    }
    if (e.target.name === "answer") {
      if(!sourceReady())throw Error("Wait for the original source page to load before selecting an answer.");
      commit((s) => select(s, e.target.value));
      render();
    }
    if (e.target.id === "year") {
      year = e.target.value;
      localStorage.setItem("madar-year", year);
      render();
    }
    if (["bank-file", "backup-file"].includes(e.target.id)) {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 12000000)
        throw Error(
          "This file exceeds 12 MB. Split the import into smaller batches.",
        );
      const data = JSON.parse(await file.text());
      if (e.target.id === "bank-file") {
        const res = importBank(state, data);
        commit((s) => Object.assign(s, res.state));
        notice =
          `Added ${res.added} records. ${res.unchanged} already present.\n` +
          res.warnings.join("\n");
      } else {
        const restored = hydrate(data, bundledBank);
        if (
          !confirm(
            translate(
              "Replace current progress and personal questions with this backup?",
            ),
          )
        )
          return;
        commit((s) => Object.assign(s, restored));
        notice = "Backup restored.";
      }
      render();
    }
  } catch (err) {
    notice = err.message;
    render();
  }
});
document.addEventListener("submit", async (e) => {
  if (!["practice-form", "plan-form", "mock-form"].includes(e.target.id)) return;
  e.preventDefault();
  try {
    const f = new FormData(e.target);
    if (e.target.id === "mock-form") {
      if (year !== '2027') throw Error('Select source year 2027 to use these mock presets.');
      const preset = String(f.get('preset'));
      const mock = allocateMock(qs(), state.sessions, preset, state.questions);
      if (mock.shortages.length) throw Error('Not enough fresh questions to start: ' + mock.shortages.map(x => `${x.topic}: ${x.available}/${x.required}`).join('; ') + '. Previously seen questions and exact normalized stem-and-choice duplicates are excluded; similar variants may remain undetected.');
      await launch(mock.ids, 'timed', preset === 'session1' ? '2027 mock session 1' : '2027 mock session 2', 135);
      return;
    }
    if (e.target.id === "plan-form") {
      const minutes = Number(f.get("minutes"));
      if (!Number.isFinite(minutes) || minutes < 10 || minutes > 480) throw Error("Enter a study time between 10 and 480 minutes.");
      commit(s => { s.plan = {examDate:String(f.get("examDate") || ""), minutes}; });
      render(); return;
    }
    practiceDraft = {topic:String(f.get("topic")), count:Number(f.get("count")), mode:String(f.get("mode")), minutes:Number(f.get("minutes"))};
    const ids = allocatePractice(qs(), state.attempts, practiceDraft.count, practiceDraft.topic);
    await launch(
      ids.slice(0, Number(f.get("count"))),
      f.get("mode"),
      f.get("mode") === "timed" ? "Timed test" : "Topic practice",
      Number(f.get("minutes")),
    );
  } catch (err) {
    notice = err.message;
    render();
  }
});
function tick() {
  const running = state.sessions.find((s) => !s.finished && s.deadline);
  if (running && Date.now() >= running.deadline && !storageError) {
    try {
      commit((s) => {
        const previous = s.active;
        s.active = running.id;
        finish(s);
        s.active = previous;
      });
      render();
      return;
    } catch (e) {
      storageError = e.message;
      render();
      return;
    }
  }
  const s = activeSession(state),
    el = document.querySelector("#timer");
  if (el && s?.deadline) {
    const secs = Math.max(0, Math.ceil((s.deadline - Date.now()) / 1000));
    el.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  }
}
window.addEventListener("hashchange", () => {
  route = location.hash.slice(1) || "study";
  render();
  window.scrollTo(0, 0);
});
window.addEventListener("storage", (e) => {
  if (e.key === KEY) {
    try {
      state = hydrate(e.newValue?JSON.parse(e.newValue):null,bundledBank);
      render();
    } catch {
      storageError = "Data changed in another tab and could not be read.";
      render();
    }
  }
});
function sourceReady(){return [...document.querySelectorAll('.question .required-source-image')].every(img=>img.complete&&img.naturalWidth>0);}
function checkSourceReadiness(){const button=document.querySelector('[data-action="submit"]');if(button){const s=activeSession(state),selected=s?.entries[s.index]?.selected;button.disabled=!selected||!sourceReady();}}
document.addEventListener('load',e=>{if(e.target.matches?.('.required-source-image')){const warning=(e.target.closest('.source-document')||e.target.closest('.source-figure'))?.querySelector('.source-error');if(warning)warning.textContent='';checkSourceReadiness();}},true);
document.addEventListener('error',e=>{if(e.target.matches?.('.source-image')){const warning=(e.target.closest('.source-document')||e.target.closest('.source-figure'))?.querySelector('.source-error');if(warning)warning.textContent='The source page could not load. Keep the question-assets folder beside Madar.html. This question cannot be submitted without its source.';checkSourceReadiness();}},true);
async function initialize(){
 startupError='';storageError='';
 document.querySelector('#app').innerHTML='<p style="padding:40px">Loading your source library…</p>';
 try{
  const embedded=document.getElementById('bundled-questions');
  if(embedded)bundledBank=JSON.parse(embedded.textContent);
  else {
    const response=await fetch(new URL('question-bank.json',document.baseURI),{cache:'no-cache'});
    if(!response.ok)throw Error('Question library request failed (HTTP '+response.status+').');
    bundledBank=await response.json();
  }
  const raw=localStorage.getItem(KEY);
  const saved = raw ? JSON.parse(raw) : null;
  state=hydrate(saved,bundledBank);
  saveHydrated(localStorage, KEY, raw, state, bundledBank);
 }catch(error){startupError=error.message;storageError='Unable to load your source library. Original stored data was preserved: '+error.message;}
 render();
}

setInterval(tick, 1000);
initialize();
