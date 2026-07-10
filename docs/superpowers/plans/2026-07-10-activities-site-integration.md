# Activities Site Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the conditional “Brincar” story-page integration, accessible vanilla-JavaScript games, paper-workshop styling, and site-level regression tests defined in `docs/activities.md`.

**Architecture:** `renderSite` loads optional per-story activity JSON from a configurable directory and passes it only to the matching story renderer. The generated HTML contains a progressively enhanced shell and safely embedded JSON; `brincar.js` owns all runtime game state and DOM construction, while `styles.css` supplies the existing OKLCH visual language.

**Tech Stack:** Node.js ESM, `node:test`, generated HTML, browser-native DOM APIs, CSS with OKLCH tokens; no external dependencies.

## Global Constraints

- Change only the site integration, `tests/site/`, and `tests/fixtures/`; do not alter `src/recovery/`, `tests/recovery/`, or `data/`.
- Keep `renderSite({ storiesDir, outDir, ... })` backward compatible and default `activitiesDir` to `data/activities`.
- Games have unlimited attempts, no scores, timers, sound, rankings, stars, mascots, or age labels.
- All controls are native `<button>` elements with visible focus, polite live feedback, and targets at least 44px high.
- Runtime shuffling may use `Math.random`; reduced-motion preferences remove transitions.

---

### Task 1: Conditional story-page activity shell

**Files:**
- Create: `tests/fixtures/activities/01-01.json`
- Modify: `tests/site/render.test.mjs`
- Modify: `src/site/render.mjs`

**Interfaces:**
- Consumes: `renderSite({ storiesDir, outDir, recoveredArchiveDir?, today?, todayTimeZone?, activitiesDir? })`.
- Produces: matching story HTML with `#brincar`, `#activities-data`, `#activities-root`, `/brincar.js`, and a story action anchor; unmatched pages remain unchanged.

- [ ] **Step 1: Add the representative fixture and failing render tests**

  Add the six model activities (all five types, including both memory levels) to `tests/fixtures/activities/01-01.json`. In `tests/site/render.test.mjs`, create one temporary story, render it with `activitiesDir: 'tests/fixtures/activities'`, parse the embedded script text after converting `<\\/` back to `</`, and assert that a fixture sentence containing `</script>` survives. Render the same story with a missing activities directory and assert that neither `#brincar` nor `/brincar.js` appears.

- [ ] **Step 2: Run the focused test and confirm RED**

  Run `node --test tests/site/render.test.mjs`; expect failure because `renderSite` does not yet accept or render activity data.

- [ ] **Step 3: Implement the optional loader and activity shell**

  Add an ENOENT-safe activity loader keyed by story id. Extend `pageShell` with page-specific deferred scripts. Render the provenance sentence exactly as specified, JSON via `JSON.stringify(data).replaceAll('</', '<\\/')`, a mount container, the paper suggestion in `<noscript>`, and a `Brincar` action link after loading only valid JSON files.

- [ ] **Step 4: Run the focused test and confirm GREEN**

  Run `node --test tests/site/render.test.mjs`; expect all site render tests to pass.

### Task 2: Accessible runtime games

**Files:**
- Create: `src/site/public/brincar.js`
- Modify: `tests/site/render.test.mjs`

**Interfaces:**
- Consumes: JSON from `#activities-data` with `activities[]` in the closed specification format.
- Produces: grouped activity selection (`Para descobrir`, `Para aprofundar`), a single open game, native-button interactions, and `[aria-live="polite"]` feedback.

- [ ] **Step 1: Add failing static accessibility/template assertions**

  Read the copied `brincar.js` from the rendered output and assert renderers exist for `encontra-palavra`, `fabrica-palavras`, `jogo-memoria`, `puzzle-ilustracao`, and `ordena-historia`; assert button creation uses `document.createElement('button')`, controls receive `type = 'button'`, live feedback uses `aria-live`, and no `role="button"`, score, timer, or audio API appears.

- [ ] **Step 2: Run the focused test and confirm RED**

  Run `node --test tests/site/render.test.mjs`; expect failure because `brincar.js` does not exist.

- [ ] **Step 3: Implement the game controller and five renderers**

  Build small DOM helpers, Fisher–Yates shuffling, calm pt-PT feedback, and a list/view controller. Implement target-word rounds, guided syllable composition followed by recombination, memory pairs, illustration tile swapping with CSS background positioning and arrow/Enter keyboard behavior, and ordered story sentences. Keep every selection and movement action on a real button and allow retries indefinitely.

- [ ] **Step 4: Run the focused test and confirm GREEN**

  Run `node --test tests/site/render.test.mjs`; expect all site render tests to pass.

### Task 3: Atelier de papel styling and full verification

**Files:**
- Modify: `src/site/public/styles.css`

**Interfaces:**
- Consumes: `.play-corner`, `.play-*`, `.game-*`, and state classes emitted by `brincar.js`.
- Produces: responsive paper-card UI using existing OKLCH variables, ≥44px controls, visible focus, soft success/error treatments, and disabled transitions under reduced motion.

- [ ] **Step 1: Add the activity styles**

  Style the integration as a subtly layered paper folder: warm paper surfaces, `--paper-shadow`, amber primary actions, soft green completion states, ink text, 8–14px radii, tactile shadows, responsive card/tile grids, and puzzle aspect-ratio/background rules. Add an explicit reduced-motion block that sets activity transitions and animations to `none`.

- [ ] **Step 2: Run the complete test suite**

  Run `npm test`; expect exit code 0 with zero failures.

- [ ] **Step 3: Run the production build**

  Run `npm run build`; expect exit code 0.

- [ ] **Step 4: Perform the requested fixture smoke build and grep**

  Render the temporary story with `activitiesDir: 'tests/fixtures/activities'` into `tmp/activities-manual/dist`, then run `grep -n 'id="brincar"' tmp/activities-manual/dist/stories/01-01/index.html`; expect one matching section line.

- [ ] **Step 5: Review scope and diff**

  Run `git status --short` and `git diff -- src/site/render.mjs src/site/public/brincar.js src/site/public/styles.css tests/site/render.test.mjs tests/fixtures/activities/01-01.json`; confirm no protected path changed and no external dependency was added.
