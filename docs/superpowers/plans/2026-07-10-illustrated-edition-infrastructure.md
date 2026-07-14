# Illustrated Edition Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a resumable Codex-driven illustration pipeline and a responsive book-like reader, then prove both with the three-story technical pilot.

**Architecture:** A small `src/illustration/` subsystem owns scene-plan validation, Luna orchestration, job state, image compression, and auditing. The static renderer consumes only completed scene metadata and delegates illustrated markup to a focused module; the existing original-material rendering remains intact. Codex generates source images agentically, while Node scripts persist state and convert each source to a bounded WebP asset.

**Tech Stack:** Node.js ES modules, Node test runner, `codex exec`, `gpt-5.4-mini`, Codex image-generation tool, macOS `sips`, `cwebp`, static HTML/CSS/JavaScript.

## Global Constraints

- Use `gpt-5.4-mini` with `model_reasoning_effort="low"` for planning, prompts, alternative text, metadata, and orchestration.
- Use the image-generation tool available through the authenticated Codex account; do not require a separate API key.
- Generate three to six scenes per story, including exactly one opening scene.
- Request the smallest supported generation size and quality.
- Convert final assets to WebP, at most 768 px on the longer side, quality 72 initially, and at most 200 KB.
- Keep narrative text in HTML; generated images contain no titles, paragraphs, captions, logos, or signatures.
- Credit new work as `Edição ilustrada contemporânea gerada com IA` and preserve original credits separately.
- Do not name Cristina Malaquias or request another specific artist's style in generation prompts.
- Do not add repository dependencies without explicit authorization.
- Do not deploy.

---

## File Structure

- `src/illustration/edition.mjs` — validates scene plans and maps them into stable story metadata.
- `src/illustration/scene-plan.schema.json` — structured-output contract passed to Luna.
- `src/illustration/plan-stories.mjs` — calls `codex exec`, writes briefs, and initializes resumable story state.
- `src/illustration/jobs.mjs` — leases the next scene, records outcomes, compresses assets, and audits state.
- `src/site/illustrated-edition.mjs` — renders completed scene metadata into safe book-like HTML.
- `src/site/render.mjs` — composes the illustrated view, historical view, and existing auxiliary sections.
- `src/site/public/app.js` — progressively enhances the edition switcher.
- `src/site/public/styles.css` — styles four illustrated layouts and responsive behavior.
- `tests/illustration/*.test.mjs` — pipeline contract, orchestration, state, and compression tests.
- `tests/site/illustrated-edition.test.mjs` — focused illustrated-markup tests.
- `tests/site/render.test.mjs` — end-to-end static rendering and fallback assertions.

### Task 1: Scene-plan contract and story metadata

**Files:**
- Create: `src/illustration/edition.mjs`
- Create: `tests/illustration/edition.test.mjs`

**Interfaces:**
- Consumes: existing story objects with `id` and `textSegments[].paragraphs[]`.
- Produces: `validateScenePlan(story, plan)`, `applyScenePlan(story, plan)`, `completedOpening(story)`, and constants `ART_DIRECTION_VERSION`, `ILLUSTRATION_CREDIT`, `PLANNING_MODEL`.

- [ ] **Step 1: Write failing contract tests**

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyScenePlan,
  completedOpening,
  validateScenePlan
} from '../../src/illustration/edition.mjs';

function story() {
  return {
    id: '01-01',
    textSegments: [
      { paragraphs: ['Primeiro parágrafo.', 'Segundo parágrafo.'] },
      { paragraphs: ['Terceiro parágrafo.'] }
    ]
  };
}

function plan() {
  return {
    characters: [{ name: 'Rapaz', appearance: 'Cabelo escuro e casaco azul.' }],
    environment: 'Estrada rural luminosa.',
    palette: ['azul lavado', 'cinzento de carvão'],
    recurringObjects: ['saco de farinha'],
    scenes: [
      {
        id: 'opening',
        after: null,
        layout: 'opening',
        description: 'Encontro na estrada.',
        alt: 'Dois rapazes encontram-se numa estrada.',
        prompt: 'Watercolour and pencil on warm paper; expressive children; no text.'
      },
      {
        id: 'encontro',
        after: { segment: 0, paragraph: 1 },
        layout: 'marginal',
        description: 'Os rapazes discutem.',
        alt: 'Os dois rapazes discutem junto dos pais.',
        prompt: 'Watercolour vignette; the same children argue; no text.'
      },
      {
        id: 'abraco',
        after: { segment: 1, paragraph: 0 },
        layout: 'vignette',
        description: 'Todos se reconciliam.',
        alt: 'As duas famílias abraçam-se e riem.',
        prompt: 'Watercolour vignette; the same families embrace; no text.'
      }
    ]
  };
}

describe('illustrated edition contract', () => {
  it('accepts three to six ordered scenes with valid paragraph anchors', () => {
    assert.equal(validateScenePlan(story(), plan()), true);
  });

  it('rejects invalid counts, duplicate ids, invalid anchors, and named-style imitation', () => {
    assert.throws(() => validateScenePlan(story(), { ...plan(), scenes: plan().scenes.slice(0, 2) }), /three to six/);
    assert.throws(() => validateScenePlan(story(), {
      ...plan(),
      scenes: plan().scenes.map((scene) => ({ ...scene, id: 'same' }))
    }), /unique/);
    assert.throws(() => validateScenePlan(story(), {
      ...plan(),
      scenes: plan().scenes.map((scene, index) => index === 1
        ? { ...scene, after: { segment: 4, paragraph: 0 } }
        : scene)
    }), /valid paragraph/);
    assert.throws(() => validateScenePlan(story(), {
      ...plan(),
      scenes: plan().scenes.map((scene, index) => index === 1
        ? { ...scene, prompt: 'In the style of Cristina Malaquias.' }
        : scene)
    }), /specific artist/);
  });

  it('maps a valid plan to resumable public metadata', () => {
    const result = applyScenePlan(story(), plan());
    assert.equal(result.illustratedEdition.status, 'generating');
    assert.equal(result.illustratedEdition.planningModel, 'gpt-5.4-mini');
    assert.equal(result.illustratedEdition.visualBrief, '/assets/01-01/illustrated/brief.json');
    assert.deepEqual(result.illustratedEdition.scenes[1], {
      id: 'encontro',
      status: 'pending',
      attempts: 0,
      after: { segment: 0, paragraph: 1 },
      layout: 'marginal',
      image: '/assets/01-01/illustrated/encontro.webp',
      alt: 'Os dois rapazes discutem junto dos pais.'
    });
    assert.equal(completedOpening(result), null);
    result.illustratedEdition.scenes[0].status = 'complete';
    assert.equal(completedOpening(result).id, 'opening');
  });
});
```

- [ ] **Step 2: Run the contract test and confirm the missing-module failure**

Run: `node --test tests/illustration/edition.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/illustration/edition.mjs`.

- [ ] **Step 3: Implement the contract**

```js
export const ART_DIRECTION_VERSION = '1';
export const ILLUSTRATION_CREDIT = 'Edição ilustrada contemporânea gerada com IA';
export const PLANNING_MODEL = 'gpt-5.4-mini';

const LAYOUTS = new Set(['opening', 'double-page', 'marginal', 'vignette']);
const ARTIST_PATTERN = /(?:in the style of|no estilo de|à maneira de|cristina malaquias)/iu;

function assertText(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${field} must be non-empty text`);
  }
}

function assertAnchor(story, anchor) {
  if (!anchor || !Number.isInteger(anchor.segment) || !Number.isInteger(anchor.paragraph)) {
    throw new Error('Every non-opening scene must reference a valid paragraph');
  }
  const paragraphs = story.textSegments?.[anchor.segment]?.paragraphs;
  if (!paragraphs || anchor.paragraph < 0 || anchor.paragraph >= paragraphs.length) {
    throw new Error('Every non-opening scene must reference a valid paragraph');
  }
}

export function validateScenePlan(story, plan) {
  const scenes = plan?.scenes;
  if (!Array.isArray(scenes) || scenes.length < 3 || scenes.length > 6) {
    throw new Error('A scene plan must contain three to six scenes');
  }
  const ids = new Set();
  scenes.forEach((scene, index) => {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(scene.id ?? '') || ids.has(scene.id)) {
      throw new Error('Scene ids must be safe and unique');
    }
    ids.add(scene.id);
    if (!LAYOUTS.has(scene.layout)) throw new Error(`Unsupported layout: ${scene.layout}`);
    assertText(scene.description, 'description');
    assertText(scene.alt, 'alt');
    assertText(scene.prompt, 'prompt');
    if (ARTIST_PATTERN.test(scene.prompt)) throw new Error('Prompts must not imitate a specific artist');
    if (index === 0) {
      if (scene.id !== 'opening' || scene.layout !== 'opening' || scene.after !== null) {
        throw new Error('The first scene must be the opening');
      }
    } else {
      if (scene.layout === 'opening') throw new Error('Only the first scene may use the opening layout');
      assertAnchor(story, scene.after);
    }
  });
  return true;
}

export function applyScenePlan(story, plan) {
  validateScenePlan(story, plan);
  return {
    ...story,
    illustratedEdition: {
      status: 'generating',
      credit: ILLUSTRATION_CREDIT,
      artDirectionVersion: ART_DIRECTION_VERSION,
      planningModel: PLANNING_MODEL,
      visualBrief: `/assets/${story.id}/illustrated/brief.json`,
      scenes: plan.scenes.map(({ id, after, layout, alt }) => ({
        id,
        status: 'pending',
        attempts: 0,
        after,
        layout,
        image: `/assets/${story.id}/illustrated/${id}.webp`,
        alt
      }))
    }
  };
}

export function completedOpening(story) {
  return story.illustratedEdition?.scenes?.find(
    (scene) => scene.id === 'opening' && scene.status === 'complete'
  ) ?? null;
}
```

- [ ] **Step 4: Run the focused and full test suites**

Run: `node --test tests/illustration/edition.test.mjs && npm test`

Expected: both commands PASS.

- [ ] **Step 5: Commit the contract**

```bash
git add src/illustration/edition.mjs tests/illustration/edition.test.mjs
git commit -m "Add illustrated edition scene contract"
```

### Task 2: Luna scene planner

**Files:**
- Create: `src/illustration/scene-plan.schema.json`
- Create: `src/illustration/plan-stories.mjs`
- Create: `tests/illustration/plan-stories.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `validateScenePlan()` and `applyScenePlan()` from Task 1; authenticated `codex` CLI.
- Produces: `buildPlanningPrompt(story)`, `runLunaPlanner(prompt, options)`, and `planStories(options)`; CLI scopes `--story MM-DD`, `--month MM`, or `--all`, plus explicit `--force`.

- [ ] **Step 1: Add the strict structured-output schema**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["characters", "environment", "palette", "recurringObjects", "scenes"],
  "properties": {
    "characters": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["name", "appearance"],
        "properties": {
          "name": { "type": "string", "minLength": 1 },
          "appearance": { "type": "string", "minLength": 1 }
        }
      }
    },
    "environment": { "type": "string", "minLength": 1 },
    "palette": { "type": "array", "items": { "type": "string", "minLength": 1 } },
    "recurringObjects": { "type": "array", "items": { "type": "string", "minLength": 1 } },
    "scenes": {
      "type": "array",
      "minItems": 3,
      "maxItems": 6,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["id", "after", "layout", "description", "alt", "prompt"],
        "properties": {
          "id": { "type": "string", "pattern": "^[a-z0-9]+(?:-[a-z0-9]+)*$" },
          "after": {
            "oneOf": [
              { "type": "null" },
              {
                "type": "object",
                "additionalProperties": false,
                "required": ["segment", "paragraph"],
                "properties": {
                  "segment": { "type": "integer", "minimum": 0 },
                  "paragraph": { "type": "integer", "minimum": 0 }
                }
              }
            ]
          },
          "layout": { "enum": ["opening", "double-page", "marginal", "vignette"] },
          "description": { "type": "string", "minLength": 1 },
          "alt": { "type": "string", "minLength": 1 },
          "prompt": { "type": "string", "minLength": 1 }
        }
      }
    }
  }
}
```

- [ ] **Step 2: Write failing planner tests with an injected Codex runner**

```js
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import {
  buildPlanningPrompt,
  planStories,
  runLunaPlanner
} from '../../src/illustration/plan-stories.mjs';

const root = 'tmp/illustration-planner';

after(() => rm(root, { recursive: true, force: true }));

function validPlan() {
  return {
    characters: [],
    environment: 'A village road.',
    palette: ['warm paper', 'soft blue'],
    recurringObjects: ['mill'],
    scenes: [
      { id: 'opening', after: null, layout: 'opening', description: 'Opening.', alt: 'Opening scene.', prompt: 'Watercolour and pencil; no text.' },
      { id: 'middle', after: { segment: 0, paragraph: 0 }, layout: 'marginal', description: 'Middle.', alt: 'Middle scene.', prompt: 'Small watercolour vignette; no text.' },
      { id: 'ending', after: { segment: 0, paragraph: 1 }, layout: 'vignette', description: 'Ending.', alt: 'Ending scene.', prompt: 'Warm watercolour ending; no text.' }
    ]
  };
}

describe('Luna planner', () => {
  it('builds a prompt from narrative content without illustrator identity', () => {
    const prompt = buildPlanningPrompt({
      id: '01-01',
      title: 'Teste',
      illustrator: 'Cristina Malaquias',
      textSegments: [{ paragraphs: ['Primeiro.', 'Segundo.'] }]
    });
    assert.match(prompt, /three to six scenes/);
    assert.match(prompt, /Primeiro\./);
    assert.doesNotMatch(prompt, /Cristina Malaquias/);
    assert.match(prompt, /no words, lettering, logos, or signatures/);
  });

  it('invokes ephemeral Luna at low reasoning with the output schema', async () => {
    let call;
    const execFileImpl = (command, args, options, callback) => {
      call = { command, args, options };
      writeFile(args[args.indexOf('--output-last-message') + 1], JSON.stringify(validPlan()))
        .then(() => callback(null, '', ''));
    };
    const result = await runLunaPlanner('prompt', { cwd: process.cwd(), execFileImpl });
    assert.equal(call.command, 'codex');
    assert.ok(call.args.includes('gpt-5.4-mini'));
    assert.ok(call.args.includes('model_reasoning_effort="low"'));
    assert.ok(call.args.includes('--ephemeral'));
    assert.ok(call.args.includes('--output-schema'));
    assert.deepEqual(result, validPlan());
  });

  it('writes a public brief and initializes story state without replanning by default', async () => {
    await rm(root, { recursive: true, force: true });
    await mkdir(`${root}/stories`, { recursive: true });
    await writeFile(`${root}/stories/01-01.json`, JSON.stringify({
      id: '01-01',
      title: 'Teste',
      textSegments: [{ paragraphs: ['Primeiro.', 'Segundo.'] }],
      assets: {}
    }));
    let calls = 0;
    const runPlanner = async () => { calls += 1; return validPlan(); };
    await planStories({ storyId: '01-01', storiesDir: `${root}/stories`, publicDir: `${root}/public`, runPlanner });
    await planStories({ storyId: '01-01', storiesDir: `${root}/stories`, publicDir: `${root}/public`, runPlanner });
    const story = JSON.parse(await readFile(`${root}/stories/01-01.json`, 'utf8'));
    const brief = JSON.parse(await readFile(`${root}/public/assets/01-01/illustrated/brief.json`, 'utf8'));
    assert.equal(calls, 1);
    assert.equal(story.illustratedEdition.status, 'generating');
    assert.equal(brief.scenes.length, 3);
  });
});
```

- [ ] **Step 3: Run the planner tests and confirm failure**

Run: `node --test tests/illustration/plan-stories.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `plan-stories.mjs`.

- [ ] **Step 4: Implement the planner and resumable scopes**

Use `node:child_process.execFile`, `node:fs/promises.mkdtemp/readFile/readdir/rename/rm/writeFile`, `node:os.tmpdir`, and `node:path`. `runLunaPlanner()` must invoke this exact command shape:

```js
const args = [
  'exec',
  '--ephemeral',
  '--sandbox', 'read-only',
  '--model', 'gpt-5.4-mini',
  '--config', 'model_reasoning_effort="low"',
  '--output-schema', schemaPath,
  '--output-last-message', outputPath,
  '--cd', cwd,
  prompt
];
```

`buildPlanningPrompt()` must serialize only `id`, `title`, and `textSegments`, then prepend this fixed direction:

```text
Plan a contemporary illustrated edition of this Portuguese children's story as strict JSON.
Choose three to six scenes, including exactly one opening first. Anchor every later scene after a zero-based segment and paragraph. Use observable media traits only: soft watercolour, pencil texture, irregular fine lines, warm paper, pale incomplete backgrounds, expressive lightly caricatured anatomy, gentle humour, and generous negative space. Keep characters, clothes, recurring objects, setting, and palette consistent within the story. Every image prompt must say: no words, lettering, logos, or signatures. Never name or imitate a specific artist. Alternative text must be concise European Portuguese.
```

For each selected story, validate the returned plan, write the complete plan plus `errors: []` to `src/site/public/assets/<id>/illustrated/brief.json`, call `applyScenePlan()`, and atomically replace `data/stories/<id>.json`. Skip stories that already have `illustratedEdition` unless `--force` is supplied. Sort filenames and process sequentially so an interrupted month can be rerun safely.

- [ ] **Step 5: Add the planner command**

Add to `package.json`:

```json
"illustrations:plan": "node src/illustration/plan-stories.mjs"
```

- [ ] **Step 6: Run focused tests, CLI help validation, and the full suite**

Run: `node --test tests/illustration/plan-stories.test.mjs && node src/illustration/plan-stories.mjs --help && npm test`

Expected: tests PASS; help lists `--story`, `--month`, `--all`, and `--force`; full suite PASS. Do not run a live Luna request in this task.

- [ ] **Step 7: Commit the planner**

```bash
git add package.json src/illustration/scene-plan.schema.json src/illustration/plan-stories.mjs tests/illustration/plan-stories.test.mjs
git commit -m "Add Luna illustration scene planner"
```

### Task 3: Resumable image jobs, compression, and audit

**Files:**
- Create: `src/illustration/jobs.mjs`
- Create: `tests/illustration/jobs.test.mjs`
- Modify: `.gitignore`
- Modify: `package.json`

**Interfaces:**
- Consumes: initialized `illustratedEdition` metadata and public `brief.json` from Task 2; source raster path returned by the Codex image tool.
- Produces: CLI commands `next`, `complete`, `fail`, `defer`, and `audit`; `nextIllustrationJob()`, `completeIllustrationJob()`, `failIllustrationJob()`, and `compressIllustration()`.

- [ ] **Step 1: Write failing state-machine tests**

Use this concrete temporary fixture before the cases:

```js
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import {
  completeIllustrationJob,
  compressIllustration,
  deferIllustrationJob,
  failIllustrationJob,
  nextIllustrationJob
} from '../../src/illustration/jobs.mjs';

const root = 'tmp/illustration-jobs';
const options = { storiesDir: `${root}/stories`, publicDir: `${root}/public`, workDir: `${root}/work` };
const fixture = 'data/assets/01-01/extracted/pdf-image-000.png';

async function seed() {
  await rm(root, { recursive: true, force: true });
  await mkdir(`${root}/stories`, { recursive: true });
  await mkdir(`${root}/public/assets/01-01/illustrated`, { recursive: true });
  await writeFile(`${root}/stories/01-01.json`, JSON.stringify({
    id: '01-01',
    textSegments: [{ paragraphs: ['Primeiro.', 'Segundo.'] }],
    illustratedEdition: {
      status: 'generating',
      visualBrief: '/assets/01-01/illustrated/brief.json',
      scenes: [
        { id: 'opening', status: 'pending', attempts: 0, after: null, layout: 'opening', image: '/assets/01-01/illustrated/opening.webp', alt: 'Abertura.' },
        { id: 'middle', status: 'pending', attempts: 0, after: { segment: 0, paragraph: 0 }, layout: 'marginal', image: '/assets/01-01/illustrated/middle.webp', alt: 'Meio.' },
        { id: 'ending', status: 'pending', attempts: 0, after: { segment: 0, paragraph: 1 }, layout: 'vignette', image: '/assets/01-01/illustrated/ending.webp', alt: 'Fim.' }
      ]
    }
  }));
  await writeFile(`${root}/public/assets/01-01/illustrated/brief.json`, JSON.stringify({
    errors: [],
    scenes: [
      { id: 'opening', prompt: 'Opening prompt.' },
      { id: 'middle', prompt: 'Middle prompt.' },
      { id: 'ending', prompt: 'Ending prompt.' }
    ]
  }));
}

const readStory = async () => JSON.parse(await readFile(`${root}/stories/01-01.json`, 'utf8'));
const readBrief = async () => JSON.parse(await readFile(`${root}/public/assets/01-01/illustrated/brief.json`, 'utf8'));
const compress = async (_source, destination) => {
  await mkdir(destination.slice(0, destination.lastIndexOf('/')), { recursive: true });
  await writeFile(destination, 'webp');
};

describe('illustration jobs', () => {
beforeEach(seed);

it('leases opening first and supplies it as reference for later scenes', async () => {
  const first = await nextIllustrationJob(options);
  assert.equal(first.sceneId, 'opening');
  assert.deepEqual(first.references, []);
  await completeIllustrationJob({ ...options, storyId: '01-01', sceneId: 'opening', sourcePath: fixture, compress });
  const second = await nextIllustrationJob(options);
  assert.equal(second.sceneId, 'middle');
  assert.deepEqual(second.references, ['src/site/public/assets/01-01/illustrated/opening.webp']);
});

it('counts technical failures, stops after two, and completes with a failed non-opening scene', async () => {
  await failIllustrationJob({ ...options, storyId: '01-01', sceneId: 'middle', message: 'invalid raster' });
  await failIllustrationJob({ ...options, storyId: '01-01', sceneId: 'middle', message: 'invalid raster' });
  const story = await readStory();
  assert.equal(story.illustratedEdition.scenes[1].status, 'failed');
  assert.equal(story.illustratedEdition.scenes[1].attempts, 2);
  assert.equal((await readBrief()).errors.length, 2);
});

it('marks the edition failed when opening reaches two failures', async () => {
  await failIllustrationJob({ ...options, storyId: '01-01', sceneId: 'opening', message: 'empty file' });
  await failIllustrationJob({ ...options, storyId: '01-01', sceneId: 'opening', message: 'empty file' });
  assert.equal((await readStory()).illustratedEdition.status, 'failed');
});

it('defers rate limits without consuming an attempt', async () => {
  await deferIllustrationJob({ ...options, storyId: '01-01', sceneId: 'opening', message: 'account limit' });
  const scene = (await readStory()).illustratedEdition.scenes[0];
  assert.equal(scene.status, 'pending');
  assert.equal(scene.attempts, 0);
});

it('compresses the repository fixture within the hard limits', async () => {
  const output = `${root}/bounded.webp`;
  const result = await compressIllustration(fixture, output);
  assert.ok(result.width <= 768 && result.height <= 768);
  assert.ok((await stat(output)).size <= 204800);
});
});
```

- [ ] **Step 2: Run the job tests and confirm failure**

Run: `node --test tests/illustration/jobs.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `jobs.mjs`.

- [ ] **Step 3: Implement deterministic job leasing**

`nextIllustrationJob()` must sort story files, respect optional `storyId` or `month`, and select the first scene whose status is `pending` or `generating` and whose attempts are below two. It sets the scene to `generating`, persists the story atomically, and returns this JSON shape:

```json
{
  "storyId": "01-01",
  "sceneId": "opening",
  "prompt": "Watercolour and pencil; no text.",
  "alt": "Dois rapazes encontram-se numa estrada.",
  "references": [],
  "sourceOutput": "tmp/illustrations/01-01/opening.png"
}
```

Read the prompt from the matching scene in `brief.json`. For every later scene, return the local workspace path `src/site/public/assets/<id>/illustrated/opening.webp` as the only reference, because the image tool requires a readable local file rather than a public URL. Return JSON `null` and exit successfully when no work remains.

- [ ] **Step 4: Implement bounded WebP conversion without dependencies**

Use `sips -g pixelWidth -g pixelHeight <input>` to validate and read dimensions. Use `cwebp -quiet` to try this ordered matrix until output is at most 204800 bytes:

```js
const attempts = [
  { maxSide: 768, quality: 72 },
  { maxSide: 768, quality: 60 },
  { maxSide: 768, quality: 48 },
  { maxSide: 640, quality: 48 },
  { maxSide: 512, quality: 48 }
];
```

Never upscale. For landscape input pass `-resize <width> 0`; for portrait pass `-resize 0 <height>`; omit `-resize` if both source dimensions already fit. Write each attempt to a temporary sibling file, validate with `sips`, check size with `stat`, and rename only a valid result. Throw `Could not compress <path> below 200 KB` if the final attempt remains too large.

- [ ] **Step 5: Implement outcomes and final status**

On success, increment `attempts`, set scene status to `complete`, compress into `src/site/public/assets/<id>/illustrated/<scene>.webp`, remove the temporary source, and finalize the edition when every scene is `complete` or `failed`. On `fail`, increment attempts and append `{ sceneId, attempt, message }` to `brief.errors`; return the scene to `pending` after the first failure and mark it `failed` after the second. Two opening failures mark the edition `failed`. `defer` appends no technical error, consumes no attempt, and returns the scene to `pending`.

- [ ] **Step 6: Implement the audit command**

`audit` exits nonzero and prints one line per problem when it finds a missing edition, invalid scene count, pending scene, completed scene with a missing file, file over 200 KB, raster longer than 768 px, or failed scene without exactly two recorded technical errors. A failed opening is a valid degraded terminal state after two recorded failures and is counted separately. It prints this exact summary on success:

```text
Illustration audit passed: <stories> stories, <scenes> complete scenes, <failed-openings> failed openings, <failed-scenes> failed non-opening scenes.
```

- [ ] **Step 7: Add commands and ignore temporary sources**

Add `tmp/illustrations/` to `.gitignore` and add:

```json
"illustrations:jobs": "node src/illustration/jobs.mjs",
"illustrations:audit": "node src/illustration/jobs.mjs audit"
```

- [ ] **Step 8: Run job tests and the full suite**

Run: `node --test tests/illustration/jobs.test.mjs && npm test`

Expected: all tests PASS; the compression fixture is a valid bounded WebP.

- [ ] **Step 9: Commit the job runner**

```bash
git add .gitignore package.json src/illustration/jobs.mjs tests/illustration/jobs.test.mjs
git commit -m "Add resumable illustration job runner"
```

### Task 4: Safe illustrated-story renderer

**Files:**
- Create: `src/site/illustrated-edition.mjs`
- Create: `tests/site/illustrated-edition.test.mjs`
- Modify: `src/site/render.mjs:34-85,175-217,281-347`
- Modify: `tests/site/render.test.mjs:6-238`

**Interfaces:**
- Consumes: completed scene metadata from Task 1 and the existing escaping and asset URL rules.
- Produces: `renderIllustratedEdition(story, helpers)` and `illustratedCover(story)`.

- [ ] **Step 1: Write failing focused renderer tests**

Create the fixture and assertions below; the unsafe opening path verifies that the helper can reject a scene URL, while the valid copy drives the ordering assertions:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderIllustratedEdition } from '../../src/site/illustrated-edition.mjs';

const baseStory = {
  id: '01-01',
  dateLabel: '1 de Janeiro',
  title: 'História teste',
  author: 'Autora',
  textSegments: [{ paragraphs: ['Primeiro parágrafo.', 'Segundo parágrafo.', 'Terceiro parágrafo.'] }],
  illustratedEdition: {
    status: 'complete',
    credit: 'Edição ilustrada contemporânea gerada com IA',
    scenes: [
      { id: 'opening', status: 'complete', after: null, layout: 'opening', image: '/assets/01-01/illustrated/opening.webp', alt: 'Abertura.' },
      { id: 'middle', status: 'complete', after: { segment: 0, paragraph: 0 }, layout: 'marginal', image: '/assets/01-01/illustrated/middle.webp', alt: 'Cena intermédia.' },
      { id: 'ending', status: 'failed', after: { segment: 0, paragraph: 2 }, layout: 'vignette', image: '/assets/01-01/illustrated/failed.webp', alt: 'Cena falhada.' }
    ]
  }
};

const helpers = {
  escapeHtml: (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'),
  safeAssetUrl: (_story, value) => String(value).startsWith('/') ? value : null
};

describe('illustrated story renderer', () => {
  it('renders completed scenes after their anchored paragraphs', () => {
    const html = renderIllustratedEdition(baseStory, helpers);
assert.match(html, /id="edicao-ilustrada"/);
assert.match(html, /class="illustrated-opening"/);
assert.match(html, /class="illustrated-scene scene-marginal scene-side-right"/);
assert.ok(html.indexOf('Primeiro parágrafo') < html.indexOf('middle.webp'));
assert.ok(html.indexOf('middle.webp') < html.indexOf('Segundo parágrafo'));
assert.doesNotMatch(html, /failed.webp/);
assert.doesNotMatch(html, /javascript:/);
assert.match(html, /Edição ilustrada contemporânea gerada com IA/);
  });

  it('returns null without a completed safe opening', () => {
    assert.equal(renderIllustratedEdition({ ...baseStory, illustratedEdition: undefined }, helpers), null);
    const unsafe = structuredClone(baseStory);
    unsafe.illustratedEdition.scenes[0].image = 'javascript:alert(1)';
    assert.equal(renderIllustratedEdition(unsafe, helpers), null);
  });
});
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `node --test tests/site/illustrated-edition.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement the renderer**

`renderIllustratedEdition(story, { escapeHtml, safeAssetUrl })` must:

1. Require a completed opening.
2. Render the opening with title, date, author, new-edition credit, eager image loading, and safe URL/alt handling.
3. Map only completed non-opening scenes by `segment:paragraph`.
4. Emit every original paragraph exactly once and insert matching figures immediately after their anchor.
5. Alternate marginal scenes between `scene-side-right` and `scene-side-left` by completed non-opening scene index.
6. Use lazy loading for every non-opening scene.
7. Return a `<section id="edicao-ilustrada" class="edition-panel illustrated-edition" tabindex="-1">` wrapper.

`illustratedCover(story)` returns the completed opening scene or `null`.

- [ ] **Step 4: Integrate illustrated and historical panels**

Import the two exports into `render.mjs`. Make `escapeHtml` and `safeAssetUrl` named exports for the focused renderer. Change the homepage art choice to prefer `illustratedCover(story)` and fall back to `recoveredImage(story)`.

When a completed opening exists, add `reader-illustrated` to the article, add `tabindex="-1"` to both panels, and make `renderStory()` emit this switcher and panel order:

```html
<nav class="edition-switcher" aria-label="Escolher edição">
  <a href="#edicao-ilustrada" data-edition-target="edicao-ilustrada" aria-current="true">Edição ilustrada</a>
  <a href="#edicao-original" data-edition-target="edicao-original" aria-current="false">Original recuperado</a>
</nav>
<!-- illustrated edition from the new module -->
<section id="edicao-original" class="edition-panel original-edition" tabindex="-1">
  <!-- recoveredImage(), storyText(), and imageGallery() -->
</section>
```

Do not render the existing `reader-header` in addition to the illustrated opening: the illustrated branch must contain exactly one `<h1>`. Put recovery badges and the optional `Brincar` action in a compact toolbar between the switcher and panels. Inside the historical panel, retain the original author and illustrator credit before `recoveredImage()`, `storyText()`, and `imageGallery()`. When there is no completed opening, render the current reader unchanged. In both cases keep audio, glossary, activities, and provenance after the edition panels.

- [ ] **Step 5: Extend end-to-end render tests**

Use a temporary story plus placeholder WebP files to assert the new view, exactly one `<h1>`, both distinct credit lines, and homepage preference. Keep the existing real-data assertion that `/assets/01-01/illustration-original.jpg` is used until the pilot assets exist. Add fallback assertions that a pending or failed illustrated edition does not emit the switcher and still renders the recovered illustration and text.

- [ ] **Step 6: Run focused, site, and full tests**

Run: `node --test tests/site/illustrated-edition.test.mjs tests/site/render.test.mjs && npm test`

Expected: all tests PASS with no lost paragraph, unsafe URL, or duplicated illustrated content.

- [ ] **Step 7: Commit the renderer**

```bash
git add src/site/illustrated-edition.mjs src/site/render.mjs tests/site/illustrated-edition.test.mjs tests/site/render.test.mjs
git commit -m "Render contemporary illustrated story editions"
```

### Task 5: Edition switcher and book layouts

**Files:**
- Modify: `src/site/public/app.js:1-6`
- Modify: `src/site/public/styles.css:210-337` and responsive blocks near the end
- Modify: `tests/site/render.test.mjs`

**Interfaces:**
- Consumes: switcher and layout classes from Task 4.
- Produces: progressive view switching, four visual layouts, and a one-column mobile fallback.

- [ ] **Step 1: Add failing static assertions**

Extend `tests/site/render.test.mjs` to require the built JavaScript and CSS to contain:

```js
assert.match(script, /data-edition-target/);
assert.match(script, /panel\.hidden/);
assert.match(stylesheet, /\.illustrated-opening/);
assert.match(stylesheet, /\.scene-double-page/);
assert.match(stylesheet, /\.scene-marginal/);
assert.match(stylesheet, /\.scene-vignette/);
assert.match(stylesheet, /@media \(max-width: 48rem\)/);
```

- [ ] **Step 2: Run the site test and confirm failure**

Run: `node --test tests/site/render.test.mjs`

Expected: FAIL on the first missing switcher/layout assertion.

- [ ] **Step 3: Implement progressive switching**

Append to `app.js`:

```js
const editionLinks = [...document.querySelectorAll('[data-edition-target]')];

if (editionLinks.length > 0) {
  const panels = [...document.querySelectorAll('.edition-panel')];
  const activateEdition = (targetId, updateHash) => {
    for (const panel of panels) panel.hidden = panel.id !== targetId;
    for (const link of editionLinks) {
      link.setAttribute('aria-current', String(link.dataset.editionTarget === targetId));
    }
    if (updateHash) history.replaceState(null, '', `#${targetId}`);
  };
  const initial = editionLinks.some((link) => `#${link.dataset.editionTarget}` === location.hash)
    ? location.hash.slice(1)
    : 'edicao-ilustrada';
  activateEdition(initial, false);
  for (const link of editionLinks) {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      activateEdition(link.dataset.editionTarget, true);
      document.getElementById(link.dataset.editionTarget)?.focus({ preventScroll: true });
    });
  }
}
```

Both panels remain visible and reachable as anchors without JavaScript; JavaScript hides the inactive panel only after loading.

- [ ] **Step 4: Implement book-like CSS**

Add rules with these exact structural decisions:

- `.reader-illustrated` grows from `72ch` to `72rem`; ordinary fallback readers remain `72ch`.
- `.illustrated-opening` is a two-column paper spread with image and title/credits, a 14px radius, and tactile shadow.
- `.illustrated-text` keeps text at `65ch`, centered.
- `.scene-double-page` breaks out to the 72rem reader width.
- `.scene-marginal` is at most `18rem` and floats inline-start/end according to `scene-side-left/right`.
- `.scene-vignette` is at most `24rem` and centered.
- Every image uses `object-fit: contain`; every figure has warm paper behind it and a visible AI credit.
- At `max-width: 48rem`, clear floats, make every scene full-width, collapse the opening to one column, and keep source order.
- Preserve visible focus and the existing reduced-motion block.

Use these concrete rules as the implementation baseline:

```css
.reader-illustrated { max-width: 72rem; }
.edition-switcher { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-block: 1rem 2rem; }
.edition-switcher a { min-height: 2.75rem; padding: 0.7rem 0.9rem; border: 2px solid var(--line); border-radius: 8px; }
.edition-switcher a[aria-current="true"] { background: var(--amber); }
.illustrated-opening {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(18rem, 1.1fr);
  gap: clamp(1.5rem, 5vw, 4rem);
  align-items: center;
  padding: clamp(1rem, 4vw, 2rem);
  border-radius: 14px;
  background: var(--paper-warm);
  box-shadow: 0.6rem 0.8rem 0 var(--paper-shadow);
}
.illustrated-text { max-width: 65ch; margin-inline: auto; }
.illustrated-scene { margin-block: 2rem; background: var(--paper-warm); }
.scene-double-page { width: min(72rem, calc(100vw - 2rem)); margin-inline: 50%; transform: translateX(-50%); }
.scene-marginal { width: min(18rem, 42%); }
.scene-side-left { float: inline-start; margin-inline: 0 1.25rem; }
.scene-side-right { float: inline-end; margin-inline: 1.25rem 0; }
.scene-vignette { width: min(24rem, 100%); margin-inline: auto; }
.illustrated-scene img { width: 100%; object-fit: contain; background: var(--paper); }
.illustrated-scene figcaption { padding: 0.65rem; color: var(--muted-ink); font-size: 0.9rem; }
@media (max-width: 48rem) {
  .illustrated-opening { grid-template-columns: 1fr; }
  .scene-double-page { width: 100%; margin-inline: 0; transform: none; }
  .scene-marginal,
  .scene-vignette { float: none; width: 100%; margin-inline: 0; }
}
```

- [ ] **Step 5: Run tests and perform technical responsive QA**

Run: `npm test && npm run build && npm run serve`

Expected: tests PASS and server prints its local URL. At widths 375, 768, and 1280 px, verify only technical properties: no horizontal overflow, text remains selectable, switcher keyboard focus is visible, panels switch, and paragraph order remains unchanged. Do not judge or select image aesthetics.

- [ ] **Step 6: Commit the interaction and layouts**

```bash
git add src/site/public/app.js src/site/public/styles.css tests/site/render.test.mjs
git commit -m "Style illustrated stories as responsive books"
```

### Task 6: Three-story technical pilot

**Files:**
- Modify: `data/stories/01-01.json`
- Modify: `data/stories/08-20.json`
- Modify: `data/stories/09-28.json`
- Create: `src/site/public/assets/01-01/illustrated/brief.json`
- Create: `src/site/public/assets/08-20/illustrated/brief.json`
- Create: `src/site/public/assets/09-28/illustrated/brief.json`
- Create: `src/site/public/assets/{01-01,08-20,09-28}/illustrated/*.webp`

**Interfaces:**
- Consumes: planner, job runner, renderer, and image tool established by Tasks 1–5.
- Produces: three complete illustrated editions covering a medium three-segment story, a long twenty-segment story, and a long one-segment story.

- [ ] **Step 1: Plan the three stories with Luna**

```bash
npm run illustrations:plan -- --story 01-01
npm run illustrations:plan -- --story 08-20
npm run illustrations:plan -- --story 09-28
```

Expected: each story has `illustratedEdition.status = "generating"`, three to six scenes, and a public `brief.json`. No prompt contains a named artist.

- [ ] **Step 2: Prove one Codex image can be persisted locally**

Run `npm run illustrations:jobs -- next --story 01-01`, invoke the Codex `imagegen` skill/tool with the returned prompt and no references, request the smallest supported output, and save the tool-produced local raster at the returned `sourceOutput`. Then run:

```bash
npm run illustrations:jobs -- complete --story 01-01 --scene opening --source tmp/illustrations/01-01/opening.png
```

Expected: `opening.webp` exists, is at most 768 px and 200 KB, and the story records one completed attempt. If the Codex tool supplies no local output path that can be saved into the workspace, stop here and report that exact blocker; do not introduce an API key or external service.

- [ ] **Step 3: Complete the remaining pilot jobs without aesthetic selection**

For each job returned by `next`, invoke the image tool once with the prompt and returned opening reference, save to `sourceOutput`, then run `complete`. Use `fail` only for an empty, invalid, missing, or otherwise undecodable raster. Use `defer` for account limits so attempts are not consumed. Continue until `next` returns `null` for all three story IDs.

- [ ] **Step 4: Audit and render the pilot**

Run:

```bash
npm run illustrations:audit -- --story 01-01
npm run illustrations:audit -- --story 08-20
npm run illustrations:audit -- --story 09-28
npm test
npm run build
```

Expected: all three audits pass, all tests pass, and the build completes.

- [ ] **Step 5: Perform technical reader QA**

Serve the build and verify for all three stories: illustrated view is default; original view remains accessible; 01-01 preserves its recovered art; 08-20 inserts scenes between valid segments and paragraphs; 09-28 inserts scenes within its single long segment; audio, glossary, activities, provenance, keyboard focus, and mobile order still work. Do not regenerate for aesthetic preferences.

- [ ] **Step 6: Commit the pilot assets and metadata**

```bash
git add data/stories/01-01.json data/stories/08-20.json data/stories/09-28.json \
  src/site/public/assets/01-01/illustrated \
  src/site/public/assets/08-20/illustrated \
  src/site/public/assets/09-28/illustrated
git commit -m "Add illustrated edition technical pilot"
```

## Infrastructure Completion Gate

Do not begin the archive rollout plan until all six tasks pass, the three pilot audits succeed, and the Codex image tool has demonstrated a local workspace output path. The gate is technical only; it does not add human aesthetic selection or correction.
