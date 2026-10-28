import {hydrate,personalData,studyDraft} from "./persistence.js";
import {
  applyLanguage,
  translate,
  getLanguage,
  toggleLanguage,
} from "./i18n.js";
import { loadPersonalFont, choosePersonalFont } from "./personal-font.js";
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
} from "./model.js";
const KEY = "madar-study-v1";
let state = fresh(),
  storageError = "",
  notice = "";
let bundledBank={version:1,questions:[],reviewQueue:[],coverage:[]};
let documentViews={};let libraryPage=0;let libraryTopic='all';let libraryStatus='all';
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
  return `<div class="stats"><article><small>Questions attempted</small><strong>${m.attempted}<em> / ${m.total}</em></strong></article><article><small>First-attempt accuracy</small><strong>${pct(m.firstCorrect, m.attempted)}</strong><span>${m.firstCorrect} correct out of ${m.attempted}</span></article><article><small>Repeat-attempt accuracy</small><strong>${pct(m.repeatCorrect, m.repeatCount)}</strong><span>${m.repeatCorrect} correct out of ${m.repeatCount}</span></article></div>`;
}
function study() {
  const active = state.sessions.find((s) => !s.finished);
  return `<section class="hero"><div><div class="eyebrow">YOUR NEXT CHAPTER</div><h1>A little progress today.<br><span>A deeper understanding tomorrow.</span></h1><p>Your quiet space to prepare for <bdi>CFA Level I</bdi>.<br>Learn from your sources. Revisit what needs attention.</p>${active ? btn("Resume your session →", "resume", "button light") : btn("Start studying →", "topic", "button light", `data-topic="Fixed Income"`)}</div><div class="orb" aria-hidden="true"><div>I<small>CFA LEVEL</small></div></div></section>${stats()}<div class="section-head"><div><span class="eyebrow">THE CURRICULUM</span><h2>Your study path</h2></div><span class="muted">10 topics · coverage follows your sources</span></div><div class="topics">${TOPICS.map(
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
  return `<div class="feedback ${selected === q.correctOptionId ? "success" : "error"}" role="status"><b>${selected === q.correctOptionId ? "Correct answer" : "Incorrect answer"}</b><p dir="ltr">Correct answer: ${q.presentation==='source'?esc(q.correctOptionId):esc(q.options.find((o) => o.id === q.correctOptionId).text)}</p></div><section class="explanation"><h3>Source explanation</h3><div dir="ltr" data-original>${q.presentation==='source'&&q.explanationMaterials?.length?q.explanationMaterials.map(m=>sourceDocument(m)).join(''):q.explanation ? esc(q.explanation) : '<span class="muted">No source explanation is available for this record.</span>'}</div></section>`;
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
  return `<div class="session-top">${btn("Save and exit", "study", "text-button")}<span>${esc(s.label)}</span>${s.deadline ? '<b id="timer" class="timer"></b>' : `<span dir="ltr">${s.index + 1} / ${s.entries.length}</span>`}</div><div class="bar"><span style="width:${(s.index / s.entries.length) * 100}%"></span></div><article class="question"><div class="section-head"><span class="eyebrow">${s.index >= s.initialCount ? "Reviewing a previous mistake" : "QUESTION " + (s.index + 1)}</span>${btn(state.bookmarks.includes(q.id) ? "★ Saved" : "☆ Save", "bookmark", "text-button", `data-id="${esc(q.id)}" aria-pressed="${state.bookmarks.includes(q.id)}"`)}</div><small class="muted" dir="ltr">${esc(q.topic)} / ${esc(q.module)}</small><div dir="ltr" class="question-text" data-original>${q.materials.map(material).join("")}<h2>${q.presentation==='source'?`Answer source question ${q.conversion.candidateId.split('-q').pop()}`:esc(q.text)}</h2><fieldset aria-label="Answer options" ${revealed ? "disabled" : ""}>${e.order
    .map((id, i) => {
      const o = q.options.find((o) => o.id === id);
      return `<label class="option ${e.selected === id ? "selected" : ""} ${revealed && id === q.correctOptionId ? "correct" : ""} ${revealed && e.selected === id && id !== q.correctOptionId ? "incorrect" : ""}"><input type="radio" name="answer" value="${esc(id)}" ${e.selected === id ? "checked" : ""}><span class="letter">${String.fromCharCode(65 + i)}</span><span>${q.presentation==='source'?`Option ${esc(o.id)} on the original page`:esc(o.text)}</span>${revealed && id === q.correctOptionId ? '<b aria-label="Correct">✓</b>' : ""}</label>`;
    })
    .join(
      "",
    )}</fieldset></div>${revealed ? feedback(q, e.selected) : ""}${provenance(q)}<div class="question-actions">${s.mode === "timed" ? `${btn("Previous", "previous", "secondary", s.index === 0 ? "disabled" : "")}${btn(s.index === s.entries.length - 1 ? "Finish test" : "Next / skip", "next")}` : revealed ? btn(s.index === s.entries.length - 1 ? "Finish session" : "Continue →", "next") : btn("Submit answer", "submit", "button", e.selected ? "" : "disabled")}</div>${s.mode === "timed" ? '<p class="footnote">Answers stay hidden until the test ends. The timer continues when you leave.</p>' : btn("End session early", "end", "text-button")}</article>`;
}
function questionLabel(q) {
  return q.presentation === 'source'
    ? `${translate('Source question')} ${q.conversion.candidateId.split('-q').pop()} · ${q.module}`
    : q.text;
}
function results(s) {
  const r = result(state, s);
  const conceal = timedTestInProgress();
  return `<div class="page-heading"><span class="eyebrow">SESSION COMPLETE</span><h1>Every attempt builds understanding.</h1><p>${esc(s.label)}</p></div><div class="result-card"><span class="eyebrow">${s.mode === "timed" ? "Score across the full test" : "Accuracy of recorded answers"}</span><strong>${pct(r.correct, s.mode === "timed" ? r.total : r.answered)}</strong><p>${r.correct} correct · ${r.answered} answered · ${r.unanswered} unanswered</p><small>Unanswered questions are excluded from attempt accuracy, but included in the test-score denominator.</small></div><div class="question-actions">${btn("Back to study", "study")}${btn("Review weak questions", "weak", "secondary")}</div>${s.entries
    .map((e, i) => {
      const q = state.questions.find((q) => q.id === e.questionId);
      return `<details class="review-item"><summary><span>${i + 1}. ${esc(questionLabel(q))}</span><b>${conceal ? "" : e.selected ? (e.selected === q.correctOptionId ? "✓" : "×") : "—"}</b></summary><div dir="ltr">${q.materials.map(material).join("")}${conceal ? "" : q.options.map((o) => `<p>${o.id === q.correctOptionId ? "✓ " : ""}${q.presentation==='source'?esc(o.id):esc(o.text)}</p>`).join("")}</div>${conceal ? "<p>Answers are hidden while a timed test is active.</p>" : e.selected ? feedback(q, e.selected) : "<p>No answer recorded.</p>"}${btn(state.bookmarks.includes(q.id) ? "★ Saved" : "☆ Save", "bookmark", "text-button", `data-id="${esc(q.id)}"`)}${provenance(q)}</details>`;
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
  return `<div class="page-heading"><span class="eyebrow">FOCUSED REVIEW</span><h1>${mode === "saved" ? "Your saved questions" : "Room to improve"}</h1><p>${mode === "saved" ? "Return to questions worth another look." : "Wrong answers stay in review until two successful due reviews, at least a day apart."}</p></div>${group.length ? `${btn(mode === "saved" ? "Review saved questions" : `Review due now (${due.length})`, "review-start", "button", `data-mode="${mode}" ${mode === "weak" && !due.length ? "disabled" : ""}`)}<div class="review-list">${group.map((q) => `<article class="review-item"><h3 dir="ltr">${esc(q.text)}</h3><small dir="ltr">${esc(q.module)}</small><p>${mode === "weak" ? `Next review: ${new Date(state.reviews[q.id].due).toLocaleString(getLanguage() === "ar" ? "ar-SA" : "en-GB")}` : ""}</p>${btn(state.bookmarks.includes(q.id) ? "★ Remove bookmark" : "☆ Save", "bookmark", "text-button", `data-id="${esc(q.id)}"`)}${provenance(q)}</article>`).join("")}</div>` : empty(mode === "saved" ? "No saved questions yet" : "No weak questions right now", mode === "saved" ? "Use the star while studying to save a question." : "Questions you answer incorrectly appear here. No recorded mistakes does not imply mastery.")}`;
}
function tests() {
  return `<div class="page-heading"><span class="eyebrow">PRACTICE WITH PURPOSE</span><h1>Practice at your pace.</h1><p>Topic practice or a timed test from your verified source questions.</p></div><form id="practice-form" class="panel"><label>Topic<select name="topic"><option value="all">All available topics</option>${TOPICS.map((t) => `<option>${esc(t)}</option>`).join("")}</select></label><div class="form-grid"><label>Question count<input name="count" type="number" min="1" max="180" value="10" required></label><label>Session mode<select name="mode"><option value="practice">Practice with immediate feedback</option><option value="timed">Timed test</option></select></label><label>Test duration in minutes<input name="minutes" type="number" min="1" max="240" value="30" required></label></div><p class="muted">When fewer questions are available, the session uses the available count.</p><button class="button" ${qs().length ? "" : "disabled"}>Start session →</button>${!qs().length ? "<p>Import verified questions before starting practice.</p>" : ""}</form>`;
}
function progressPage() {
  return `<div class="page-heading"><span class="eyebrow">YOUR STUDY, IN NUMBERS</span><h1>Progress you can measure.</h1><p>First accuracy: correct first attempts ÷ distinct questions attempted. Repeats are counted separately.</p></div>${stats()}<div class="review-links">${btn("☆ Saved questions", "saved", "panel")}${btn("↻ Weak questions", "weak", "panel")}</div><h2>Session history</h2>${
    state.sessions
      .filter((s) => s.finished)
      .reverse()
      .map((s) => {
        const r = result(state, s);
        return `<button class="history" data-action="history" data-id="${s.id}"><span>${esc(s.label)}<small>${new Date(s.finished).toLocaleString(getLanguage() === "ar" ? "ar-SA" : "en-GB")}</small></span><b>${r.correct} / ${r.answered} correct</b></button>`;
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
  }</div><div class="panel"><h2>Thmanyah font</h2><p>Load your licensed Thmanyah font file (WOFF2, WOFF or TTF). It stays in this browser. Until then, the interface uses the system font.</p>${btn("Load Thmanyah font", "font", "secondary")}</div><div class="panel"><h2>Protect your progress</h2><p>Stored in this browser only. Clearing site data removes progress. Export regular backups to move between devices.</p>${btn("Export questions and progress", "export", "secondary")}<label class="file-label">Restore a backup<input id="backup-file" type="file" accept=".json,application/json"></label><p class="footnote">Restore replaces this browser's study data after confirmation. Export your current backup first.</p></div>`;
}
function render() {
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
    }</select></label></header><main id="main">${storageError ? `<div class="alert">${esc(storageError)}${btn("Export raw data", "raw", "secondary")}</div>` : ""}${notice ? `<div class="alert" role="status">${esc(notice)}${btn("Close", "dismiss", "text-button")}</div>` : ""}${route.startsWith("topic:") ? topic(decodeURIComponent(route.slice(6))) : ({ study, tests, progress: progressPage, saved: () => review("saved"), weak: () => review("weak"),
        library, sources, session }[route] || study)()}</main><footer>Madar · Independent study from your personal sources</footer></div>`;
  applyLanguage(document.querySelector("#app"));
  checkSourceReadiness();
  tick();
}
function launch(ids, mode, label, minutes) {
  commit((s) => startSession(s, ids, mode, label, Date.now(), minutes));
  nav("session");
  if (route === "session") render();
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-action]");
  if (!b) return;
  try {
    const a = b.dataset.action;
    if (a === "language") {
      toggleLanguage();
      render();
      return;
    }
    if (a === "font") {
      awaitFont();
      return;
    }
    if (["study", "tests", "sources", "saved", "weak", "progress", "library"].includes(a))
      nav(a);
    else if(a==='library-prev'||a==='library-next'){libraryPage+=a==='library-prev'?-1:1;render();window.scrollTo(0,0);}
    else if (a === "topic") nav("topic:" + encodeURIComponent(b.dataset.topic));
    else if (a === "lesson")
      launch(
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
    } else if (a === "review-start") {
      const mode = b.dataset.mode;
      launch(
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
document.addEventListener("submit", (e) => {
  if (e.target.id !== "practice-form") return;
  e.preventDefault();
  try {
    const f = new FormData(e.target);
    const ids = qs()
      .filter((q) => f.get("topic") === "all" || q.topic === f.get("topic"))
      .map((q) => q.id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    launch(
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
 document.querySelector('#app').innerHTML='<p style="padding:40px">Loading your source library…</p>';
 try{
  const embedded=document.getElementById('bundled-questions');
  if(embedded)bundledBank=JSON.parse(embedded.textContent);
  else {const response=await fetch('/question-bank.json');if(response.ok)bundledBank=await response.json();}
  const raw=localStorage.getItem(KEY);state=hydrate(raw?JSON.parse(raw):null,bundledBank);
  localStorage.setItem(KEY,JSON.stringify(personalData(state,bundledBank)));
 }catch(error){storageError='Unable to load your source library. Original stored data was preserved: '+error.message;}
 render();
}
async function awaitFont() {
  try {
    await choosePersonalFont();
    notice = "Personal font loaded on this browser.";
  } catch (e) {
    notice = e.message;
  }
  render();
}
loadPersonalFont();
setInterval(tick, 1000);
initialize();
