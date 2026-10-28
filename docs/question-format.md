# Question package v1

An import file is an object with `version: 1` and `questions: []`. The local private build includes converted original-source questions; a clean checkout without the ignored bank starts empty. `npm run validate -- /absolute/path/package.json` validates structure without importing or touching history. Structural validation does not establish content authenticity.

Each question has these required fields:

| Field | Contract |
|---|---|
| id | Stable ASCII source/edition/module/question ID; letters, numbers, dot, underscore, colon, dash, max 200. Never reuse an ID for changed text or answer. |
| topic | One of `TOPICS` exported by `src/model.js`. |
| module | Exact module identity verified in the source; do not invent a lesson name. |
| text | Verbatim source question text, no HTML interpretation. |
| options | At least two objects with stable `id` and verbatim `text`; unique IDs. |
| correctOptionId | Explicit source answer, referencing an existing option. |
| preserveOrder | Explicit boolean. True when options depend on order/labels; do not guess false. |
| explanation | Verbatim explanation string, or null when unavailable. |
| status | `validated` for the stated reviewed presentation, or `review` for records awaiting review. Only validated enters practice. Source-page mode validates page identity and printed answer mapping; it does not certify every extracted word. |
| verifiedBy | Nonempty description of the reviewer or actual verification method and its limits. Never imply human word-by-word review from automated agreement. |
| materials | Array of source materials (empty if none). |
| requiredMaterialIds | IDs for every material needed to answer; all must exist. |
| sources | Nonempty array of provenance records; never drop references during duplicate review. |

Every source record requires string fields `category` (curriculum/schweser/les/practice-pack), `title`, `edition`, `year`, `location` (page + question number or LES identifier/location), and `answerLocation` (source of explicit answer). Different editions must use different IDs. The UI reports year differences; mixed-year records are excluded from scored practice. Source editions remain visible even within a year and are not automatically merged.

Material types:

- passage/formula: `id`, `type`, `text` verbatim. Unicode formulas display literally. LaTeX is not typeset; preserve difficult math as source images.
- table: `id`, `type: table`, nonempty string `headers`, nonempty array of equal-width string `rows`.
- image: `id`, `type: image`, `alt`, and embedded `src` using a PNG/JPEG/WebP base64 data URL. No remote image dependency or SVG/script injection. Preserve source attribution and image legibility.
- document: `id`, `type: document`, `title`, `pages: [{pdfPage, src}]`, and `initialPage`. Images may also use the strictly allowed local path `question-assets/<12 hex source hash>-p<page>.webp`. The whole folder must accompany a portable backup/application.

## Source-page presentation

Converted records with `presentation: source` use original question-section images and letter controls. Their searchable text is a transcription aid. They preserve original option order and the candidate question number, and retain original solution images in `explanationMaterials`, shown after answering or finishing a timed test. Source readiness requires matching explicit printed answer keys between two extractors, matching question numbering, complete page references, and no question page in the module's solution range or with a detected solution heading. Required images must load before answers can be submitted. Questions with conflicting keys or layout remain outside scored practice; no missing answer is inferred.

Personal browser storage excludes identical bundled records to fit browser quotas. Exported backups include questions and immutable attempt history; restoring older backups merges the current bundle immediately. The separate `reviewQueue` is browsable in Sources → Browse all converted questions and excluded from scored sessions. See [current conversion status](conversion-status.md) for coverage and limits.

Imports are atomic. Duplicate IDs inside one file, missing answers, invalid option references and missing required materials are rejected. Incomplete records belong in a separate extraction review file, not an answer-inferred replacement in the scored bank. Imports with previously known IDs are accepted only if content/provenance/validation match exactly, preserving attempts and bookmarks. To correct a genuine source extraction mistake, assign a new revision ID and explicitly reconcile history; the app never silently changes past scoring.

Exact normalized text/options and token-set Jaccard similarity >0.85 produce candidate duplicate warnings. This is a heuristic, not semantic proof: different wording, answers, options or editions are never merged automatically. Manually compare candidates and preserve all source references. Imported totals do not establish completeness against a source whose count is unknown.

Workflow: inspect → extract page evidence → construct candidate records → independently compare against original → review a sample → authorized conversion. The user's later requests to fill the application and start conversion authorize the current book conversion. Keep all private source PDFs, extracted text and validated packages outside tracked files (e.g. ignored `private-sources/`).
