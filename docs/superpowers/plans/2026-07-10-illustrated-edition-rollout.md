# Illustrated Edition Archive Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce, validate, and commit resumable illustrated editions for all 366 stories after the three-story infrastructure pilot passes.

**Architecture:** Reuse the planner and job runner from the infrastructure plan without code changes. Work month by month so Codex account limits, failures, assets, metadata, and commits remain bounded and resumable. Finish with a whole-archive technical audit and a generated production report.

**Tech Stack:** Existing Node.js illustration CLIs, `gpt-5.4-mini`, Codex image-generation tool, WebP, static-site build and Node tests.

## Global Constraints

- Complete `docs/superpowers/plans/2026-07-10-illustrated-edition-infrastructure.md` first.
- Use `gpt-5.4-mini` at low reasoning for planning and the Codex account image tool for raster generation.
- Do not use a separate API key, add dependencies, select aesthetically preferred variants, or manually correct generated art.
- Generate three to six scenes per story, including the opening, using the opening as the reference for later scenes.
- Keep each final WebP at most 768 px on its longer side and at most 200 KB.
- Use `fail` only for technical image failures and `defer` for rate or account limits.
- Preserve all recovered art, credits, audio, PDFs, text, activities, and provenance.
- Do not deploy.

---

## Standard Monthly Procedure

Every monthly task below uses the same already-implemented interfaces with its own explicit month value:

1. `npm run illustrations:plan -- --month MM`
2. Repeatedly run `npm run illustrations:jobs -- next --month MM`.
3. For each non-null job, invoke the Codex `imagegen` skill/tool with the returned prompt, its returned reference list, and the smallest supported output; save the local raster to `sourceOutput`.
4. Run `npm run illustrations:jobs -- complete --story <storyId> --scene <sceneId> --source <sourceOutput>`.
5. On an invalid raster, run `fail --story <storyId> --scene <sceneId> --message "<technical reason>"`; on an account limit, run `defer` with the same identifiers and stop the task until limits reset.
6. Continue until `next --month MM` returns JSON `null`.
7. Run `npm run illustrations:audit -- --month MM`, `npm test`, and `npm run build`.
8. Commit only that month's story JSON, briefs, and WebP files.

The worker must not regenerate an image because of composition, character variation, or aesthetic preference.

### Task 1: January archive

**Files:** `data/stories/01-*.json`, `src/site/public/assets/01-*/illustrated/*`

- [ ] Run the standard monthly procedure with `MM=01`; existing pilot story `01-01` must be skipped as complete.
- [ ] Commit with `git commit -m "Add January illustrated story editions"`.

### Task 2: February archive

**Files:** `data/stories/02-*.json`, `src/site/public/assets/02-*/illustrated/*`

- [ ] Run the standard monthly procedure with `MM=02`.
- [ ] Commit with `git commit -m "Add February illustrated story editions"`.

### Task 3: March archive

**Files:** `data/stories/03-*.json`, `src/site/public/assets/03-*/illustrated/*`

- [ ] Run the standard monthly procedure with `MM=03`.
- [ ] Commit with `git commit -m "Add March illustrated story editions"`.

### Task 4: April archive

**Files:** `data/stories/04-*.json`, `src/site/public/assets/04-*/illustrated/*`

- [ ] Run the standard monthly procedure with `MM=04`.
- [ ] Commit with `git commit -m "Add April illustrated story editions"`.

### Task 5: May archive

**Files:** `data/stories/05-*.json`, `src/site/public/assets/05-*/illustrated/*`

- [ ] Run the standard monthly procedure with `MM=05`.
- [ ] Commit with `git commit -m "Add May illustrated story editions"`.

### Task 6: June archive

**Files:** `data/stories/06-*.json`, `src/site/public/assets/06-*/illustrated/*`

- [ ] Run the standard monthly procedure with `MM=06`.
- [ ] Commit with `git commit -m "Add June illustrated story editions"`.

### Task 7: July archive

**Files:** `data/stories/07-*.json`, `src/site/public/assets/07-*/illustrated/*`

- [ ] Run the standard monthly procedure with `MM=07`.
- [ ] Commit with `git commit -m "Add July illustrated story editions"`.

### Task 8: August archive

**Files:** `data/stories/08-*.json`, `src/site/public/assets/08-*/illustrated/*`

- [ ] Run the standard monthly procedure with `MM=08`; existing pilot story `08-20` must be skipped as complete.
- [ ] Commit with `git commit -m "Add August illustrated story editions"`.

### Task 9: September archive

**Files:** `data/stories/09-*.json`, `src/site/public/assets/09-*/illustrated/*`

- [ ] Run the standard monthly procedure with `MM=09`; existing pilot story `09-28` must be skipped as complete.
- [ ] Commit with `git commit -m "Add September illustrated story editions"`.

### Task 10: October archive

**Files:** `data/stories/10-*.json`, `src/site/public/assets/10-*/illustrated/*`

- [ ] Run the standard monthly procedure with `MM=10`.
- [ ] Commit with `git commit -m "Add October illustrated story editions"`.

### Task 11: November archive

**Files:** `data/stories/11-*.json`, `src/site/public/assets/11-*/illustrated/*`

- [ ] Run the standard monthly procedure with `MM=11`.
- [ ] Commit with `git commit -m "Add November illustrated story editions"`.

### Task 12: December archive

**Files:** `data/stories/12-*.json`, `src/site/public/assets/12-*/illustrated/*`

- [ ] Run the standard monthly procedure with `MM=12`.
- [ ] Commit with `git commit -m "Add December illustrated story editions"`.

### Task 13: Whole-archive audit and production report

**Files:**
- Create: `docs/illustration-report.md`
- Modify only if audit exposes a technical state bug: pipeline source and its focused test.

**Interfaces:**
- Consumes: all twelve completed monthly batches.
- Produces: one evidence-backed technical inventory and a clean production build.

- [ ] **Step 1: Run the complete technical verification**

```bash
npm run illustrations:audit -- --all
npm test
npm run build
git diff --check
```

Expected: audit reports 366 stories and no missing/pending edition; tests pass; build writes `dist/`; diff check is silent. Failed scenes are permitted only when their briefs contain exactly two technical errors. Failed openings are counted explicitly, remain visible in the report, and use the historical reader fallback.

- [ ] **Step 2: Generate the report from repository state**

Write `docs/illustration-report.md` with exact computed values for:

- total stories with edition metadata;
- editions complete and failed;
- total scenes complete and failed;
- WebP file count, total bytes, largest file, and largest pixel dimension;
- per-month story and scene totals;
- list of failed openings and failed non-opening scenes with their recorded technical reasons;
- verification commands and their results;
- explicit statement that no aesthetic selection or manual correction was performed.

Compute all values from JSON and files; do not estimate them.

- [ ] **Step 3: Verify report consistency**

Run the audit again and compare its summary counts with the report. Run `rg -n "T[B]D|T[O]DO|F[I]XME|approximately|about" docs/illustration-report.md`.

Expected: audit counts match the report and `rg` prints nothing.

- [ ] **Step 4: Commit the closeout report**

```bash
git add docs/illustration-report.md
git commit -m "Document illustrated edition rollout"
```

## Rollout Completion Gate

The archive is complete only when all monthly tasks are committed, the audit has no missing or pending editions, the report matches the repository, `npm test` passes, `npm run build` succeeds, and `git diff --check` is silent. This plan does not authorize deployment.
