# Current source status

> تحديث 2026-10-28: هذا المستند يتضمن سجل المراحل السابقة. طلب المستخدم لاحقًا بدء التحويل؛ الحالة الحالية ونتائج الإصدار في [حالة التحويل](conversion-status.md)، وهي المرجع للأعداد الحالية.

The later attachment review supersedes the initial missing-book status below: 14 PDFs (10 CFA + 4 Schweser), all 2027, now inventoried; 11 real source questions visually checked and browser-tested in an ephemeral profile. User approval of extraction quality remains pending. See `source-inventory.md`. LES still lacks a live browser connection.

# Implementation and evidence — 2026-10-27

## Scope and evidence

Reference: supplied 384×848 MP4, duration 286.798 seconds. Reviewed contact sheets sampled every 2 seconds across 00:00–04:46, supplemented by larger frames. This is sampled visual review, not frame-by-frame forensic analysis. No reference question bank was extracted, transcribed into the app, or used in tests. App Store reference supplied by the user: https://apps.apple.com/app/id1528921673 (listing not inspected).

| Timestamp | Observed behavior |
|---|---|
| 00:06–00:16 | Topic list, topic percentages, bottom Study/Tests/Progress/Arena navigation. |
| 00:18–00:32 | Diagnostic, numbered practice tests, final test, custom-tests heading. Test execution and timing rules are not shown. |
| 00:34–00:40 | Progress dashboard, saved/weak counts, answered count and accuracy. A passing-probability graphic is visible but its basis is unknown. |
| 00:50–00:56 | Equity topic lesson path, Core lessons, locks and Continue. |
| 00:58–01:10 | Question with a table, three answer choices, Continue and auxiliary controls. |
| 01:12–01:16 | Wrong choice marked red, correct choice green, source-like explanation and Continue. |
| 01:36–01:38 | Correct choice marked green, feedback about future repetition. |
| 02:12–02:18 | Long explanation can be scrolled. |
| 03:42–03:50 | Previously wrong question returns as LEARNING, “wrong last time” status, option order differs from its first presentation. |
| 03:52–04:22 | Additional wrong questions return; some explanations and correct feedback shown. |
| 04:24–04:26 | Returning to topic path shows partial lesson progress (60%) and overall topic progress (3%). |
| 04:38–04:42 | Updated accuracy and weak count; weak-question list shows answers, explanation toggles and Let's Review. |
| 00:04, 04:32, 04:44–04:46 | Promotional/subscription UI. Not reproduced. |

**Inferred, not demonstrated:** app likely tracks per-question history, lesson position and a review schedule. Reloading, long-term retention, exact mastery rules, saved-question interaction and timed-test operation are not demonstrated. No claim is made about internal algorithms.

**Our implementation:** original Arabic interface, English source content, topic → actual imported module → answer → explicit submit → feedback → continue; one bounded retry of each wrong lesson question at the end. Fixed option order is required when the source refers to labels/order. Other options shuffle once on creating an entry and persist. Future modules are never invented or artificially locked. All actual imported modules remain accessible. Lesson completion requires an ended lesson with all original entries submitted; accuracy and weakness are separate. Early exit preserves the entry and option order.

Weakness rule: wrong = due immediately; first due correct review leaves the question weak and schedules it 24 hours later; a second due correct review clears weakness. Early reviews do not advance this streak. Any wrong answer resets it. A single correct answer on a new question makes no mastery claim. A lesson retry can count as the first successful review. This is our deterministic rule, not reverse engineered.

Timed tests save selected answers without scoring/revealing until completion or absolute wall-clock deadline. Reloading cannot reset the deadline. Unanswered questions are excluded from attempt accuracy, but count in the test-score denominator. Local clock changes can affect timing; this is a personal study aid, not a proctored exam. Answers exist in local storage and are not protected against developer-tool inspection.

## Architecture

Vite + native JavaScript modules, no server-side account, paid API, database or external runtime dependency. `src/model.js` is pure data validation/study logic; `src/app.js` renders escaped text and performs persistence; `src/style.css` handles responsive presentation; `scripts/` is independent ingestion tooling. No bank or fixtures ship in `dist`.

Original text, options and source metadata remain stored separately from presentation. Material types: source passage, Unicode/plain-text formula, table, embedded PNG/JPEG/WebP. For complex math, preserve a source-page crop alongside extracted text rather than guessing or silently repairing notation. Formula strings are literal source notation; this version does not typeset LaTeX. The recorded app's AI tutor and subscription screens are omitted.

Browser state is saved transactionally before UI state is replaced. Failed quota writes produce visible errors. Corrupt stored data are retained with a raw recovery download. Backup files include questions and study history and are private; restore is explicitly confirmed. Identical imports are no-ops; same ID with changed content is rejected. Distinct IDs with similar text produce duplicate warnings and remain distinct, with all provenance intact. Years are selectable; mixed-year individual records cannot enter scored sessions. Use one active browser tab for study; storage events refresh other tabs, but storage is not a distributed database and simultaneous cross-tab writes are not supported.

## REA assessment

User-provided project: https://github.com/morluto/rea . Inspected its official README and `docs/browser-observation.md` on 2026-10-27. No `rea`/`REA` executable or REA MCP tools were found in this environment. The README currently requires Node 22 >=22.23.4, 24 >=24.22.1 or 26.12.1+; current Node is 24.19.0, below its stated 24.x minimum. We did not install or claim to execute REA.

REA offers native analysis through Hopper/Ghidra/IDA and passive browser observation through an explicit user-owned Chrome CDP connection. It is not a video-to-source-code tool and has no concrete advantage for the supplied MP4. FFmpeg supplied duration/frames; visual inspection supplied behavioral evidence. No original application binary was inspected. If internal analysis became necessary, an authorized extracted iOS app/Mach-O executable (and compatible provider such as Ghidra/Hopper/IDA) would be required; an App Store link or recording is insufficient. This is not a dependency for the requested workflow. LES could be inspected through a user-connected authenticated browser; REA alone does not provide the user's session or an official export.

## Validation and limits

`npm test`: model tests for score IDs, fixed/shuffled order, selection/submission immutability, reload, bounded retries, deterministic review timing, bookmarks, invalid data, repeat imports/history, timed deadlines, year boundaries and corrupt backups.

`npm run test:browser`: Chromium, isolated ephemeral profile, opaque technical records only (not invented financial questions). Covers import → topic → lesson → answer → feedback → reload → fixed-order question → repeat → result, bookmarks, reimport, invalid import, timed concealment/expiry. Checks 320, 390, 768, 1024 pixel viewports across seven routes, plus console errors. Active question controls and supporting tables also checked at 320 and 768 pixels. This is browser emulation, not physical iPhone/iPad Safari validation. Existing installed `/usr/bin/chromium` was used after bundled Playwright Chromium was absent.

Real extraction quality, financial formulas/tables against original pages, full real-question sessions, LES exports and device Safari have NOT been verified. Those require the missing sources/access. No pass-probability estimate exists. No user-facing cloud preview is exposed by the current onboarding UI.

Final results: frozen `npm ci` succeeded; production build succeeded; 11 model tests passed; Chromium workflow and 28 route/viewport checks passed, with active-question layout checks at 320/768 pixels. PDF evidence helper captured and resumed a one-page opaque-token fixture successfully; this verifies checkpoint mechanics only, not extraction from any study source.

## Later UI and question-bank update

User requested an English interface with a translation key and questions in the application. English is now the primary interface; the persisted Arabic toggle affects interface phrases only. Original question content, source explanations and provenance remain untouched. The 11 visually verified source records are loaded idempotently from the private local `public/question-bank.json`; existing attempts and known IDs are preserved. This is not a full import of the 14 books. Source images now have a keyboard-accessible expandable horizontal view for phone readability.

The requested Thmanyah font asset was not supplied and official-site access returned a proxy CONNECT 403. A personal licensed font loader validates font signatures and FontFace parsing, then retains the file in this browser. The app uses the system fallback until a real font is provided; no claim is made that Thmanyah has been installed. No live LES browser tools were available when rechecked.

Validation: production build and 11 model tests passed. Existing browser workflow passed with 28 viewport/route checks. A new browser check passed automatic inclusion of 11 real records, English default, Arabic toggle/reload, unchanged original text, expandable source image, stable attempts, rejection of invalid font files and 18 additional viewport/route checks.
