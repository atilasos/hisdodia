# Historia do Dia Reconstruction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dependency-free first vertical of the Historia do Dia reconstruction: archive recovery pipeline, structured story data, and a static reading/listening prototype using recovered source content.

**Architecture:** Use Node built-in modules for recovery, parsing, tests, and static rendering. Store recovered story data as JSON under `data/stories/`, source fixtures under `tests/fixtures/`, generated output under `dist/`, and frontend source under `src/site/`. The first pass renders a static website from structured story data so content provenance stays separate from UI.

**Tech Stack:** Node.js ES modules, `node --test`, static HTML/CSS/JS, Wayback CDX via `fetch`, no third-party dependencies.

---

## File Structure

- Create `package.json`: script entrypoints for tests, recovery, build, and local serving.
- Create `.gitignore`: ignore generated assets, temporary archives, and local brainstorm files.
- Create `data/stories/01-01.json`: first representative recovered story fixture.
- Create `data/archive-index.json`: current known archive status for sample dates.
- Create `src/recovery/calendar.mjs`: month/day utilities and 366-day inventory.
- Create `src/recovery/cdx.mjs`: CDX URL builder and fetch wrapper.
- Create `src/recovery/parse-month-archive.mjs`: parse archive month HTML into story summaries.
- Create `src/recovery/parse-story-page.mjs`: parse story HTML into structured metadata, text segments, glossary, and assets.
- Create `src/recovery/build-manifest.mjs`: combine story JSON files into archive and recovery reports.
- Create `src/site/render.mjs`: generate static HTML pages from structured story data.
- Create `src/site/dev-server.mjs`: local static file server for `dist/`.
- Create `src/site/public/styles.css`: "Atelier de papel" visual system.
- Create `src/site/public/app.js`: small reader interactions, glossary toggles, and reduced-motion-safe controls.
- Create `tests/fixtures/month-january.html`: stable month archive fixture based on recovered structure.
- Create `tests/fixtures/story-01-01.html`: stable story fixture based on recovered structure.
- Create `tests/recovery/*.test.mjs`: parser and manifest tests.
- Create `tests/site/render.test.mjs`: static render tests.
- Create `docs/recovery-report.md`: generated or manually updated recovery status summary.

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `src/recovery/calendar.mjs`
- Test: `tests/recovery/calendar.test.mjs`

- [ ] **Step 1: Write the failing calendar tests**

Create `tests/recovery/calendar.test.mjs`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildDayInventory, formatStoryId, isLeapDay } from '../../src/recovery/calendar.mjs';

describe('calendar inventory', () => {
  it('builds one entry for each day in a leap-year story calendar', () => {
    const days = buildDayInventory();

    assert.equal(days.length, 366);
    assert.deepEqual(days[0], { month: 1, day: 1, id: '01-01' });
    assert.deepEqual(days[365], { month: 12, day: 31, id: '12-31' });
  });

  it('formats stable story ids', () => {
    assert.equal(formatStoryId(1, 2), '01-02');
    assert.equal(formatStoryId(10, 31), '10-31');
  });

  it('marks 29 February explicitly', () => {
    assert.equal(isLeapDay({ month: 2, day: 29 }), true);
    assert.equal(isLeapDay({ month: 3, day: 1 }), false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/recovery/calendar.test.mjs
```

Expected: FAIL because `src/recovery/calendar.mjs` does not exist.

- [ ] **Step 3: Add package scripts and ignores**

Create `package.json`:

```json
{
  "name": "historia-do-dia-reconstruction",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/**/*.test.mjs",
    "build": "node src/site/render.mjs",
    "serve": "node src/site/dev-server.mjs",
    "recover:manifest": "node src/recovery/build-manifest.mjs"
  }
}
```

Create `.gitignore`:

```gitignore
dist/
.superpowers/
.omx/logs/
.DS_Store
```

- [ ] **Step 4: Implement calendar utilities**

Create `src/recovery/calendar.mjs`:

```js
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function formatStoryId(month, day) {
  return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function buildDayInventory() {
  return DAYS_IN_MONTH.flatMap((daysInMonth, monthIndex) => {
    const month = monthIndex + 1;
    return Array.from({ length: daysInMonth }, (_, dayIndex) => {
      const day = dayIndex + 1;
      return { month, day, id: formatStoryId(month, day) };
    });
  });
}

export function isLeapDay(day) {
  return day.month === 2 && day.day === 29;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run:

```bash
npm test
```

Expected: PASS for `calendar.test.mjs`.

- [ ] **Step 6: Commit**

If the workspace is a git repository, run:

```bash
git add package.json .gitignore src/recovery/calendar.mjs tests/recovery/calendar.test.mjs
git commit -m "Prepare a recoverable story calendar

The original archive is calendar-based, so the recovery pipeline needs a stable 366-day inventory before fetching or rendering stories.

Constraint: The original archive may include 29 February.
Confidence: high
Scope-risk: narrow
Tested: node --test tests/recovery/calendar.test.mjs"
```

If the workspace is not a git repository, record the skipped commit in the task log and continue.

## Task 2: CDX URL Builder

**Files:**
- Create: `src/recovery/cdx.mjs`
- Test: `tests/recovery/cdx.test.mjs`

- [ ] **Step 1: Write failing CDX tests**

Create `tests/recovery/cdx.test.mjs`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildCdxUrl, storyPageUrl } from '../../src/recovery/cdx.mjs';

describe('cdx helpers', () => {
  it('builds a CDX query for a URL pattern', () => {
    const url = buildCdxUrl('www.historiadodia.pt/pt/*', { limit: 25 });

    assert.equal(url.hostname, 'web.archive.org');
    assert.equal(url.pathname, '/cdx/search/cdx');
    assert.equal(url.searchParams.get('url'), 'www.historiadodia.pt/pt/*');
    assert.equal(url.searchParams.get('output'), 'json');
    assert.equal(url.searchParams.get('fl'), 'timestamp,original,statuscode,mimetype,digest,length');
    assert.equal(url.searchParams.get('filter'), 'statuscode:200');
    assert.equal(url.searchParams.get('collapse'), 'urlkey');
    assert.equal(url.searchParams.get('limit'), '25');
  });

  it('formats original story page URLs', () => {
    assert.equal(
      storyPageUrl({ month: 1, day: 2 }),
      'http://www.historiadodia.pt/pt/historias/01/02/historia.aspx'
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/recovery/cdx.test.mjs
```

Expected: FAIL because `src/recovery/cdx.mjs` does not exist.

- [ ] **Step 3: Implement CDX helpers**

Create `src/recovery/cdx.mjs`:

```js
import { formatStoryId } from './calendar.mjs';

export function buildCdxUrl(pattern, options = {}) {
  const url = new URL('https://web.archive.org/cdx/search/cdx');
  url.searchParams.set('url', pattern);
  url.searchParams.set('output', 'json');
  url.searchParams.set('fl', 'timestamp,original,statuscode,mimetype,digest,length');
  url.searchParams.set('filter', 'statuscode:200');
  url.searchParams.set('collapse', 'urlkey');
  if (options.limit) {
    url.searchParams.set('limit', String(options.limit));
  }
  return url;
}

export function storyPageUrl({ month, day }) {
  const [monthPart, dayPart] = formatStoryId(month, day).split('-');
  return `http://www.historiadodia.pt/pt/historias/${monthPart}/${dayPart}/historia.aspx`;
}

export async function fetchCdx(pattern, options = {}) {
  const response = await fetch(buildCdxUrl(pattern, options));
  if (!response.ok) {
    throw new Error(`CDX request failed with ${response.status} for ${pattern}`);
  }
  const rows = await response.json();
  const [header, ...captures] = rows;
  return captures.map((capture) => Object.fromEntries(header.map((key, index) => [key, capture[index]])));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node --test tests/recovery/cdx.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

If git is available:

```bash
git add src/recovery/cdx.mjs tests/recovery/cdx.test.mjs
git commit -m "Ground archive lookups in stable CDX helpers

CDX queries are the recovery boundary, so URL construction is isolated and tested before networked recovery scripts depend on it.

Constraint: Wayback CDX is the external source of recoverable captures.
Confidence: high
Scope-risk: narrow
Tested: node --test tests/recovery/cdx.test.mjs"
```

## Task 3: Month Archive Parser

**Files:**
- Create: `tests/fixtures/month-january.html`
- Create: `src/recovery/parse-month-archive.mjs`
- Test: `tests/recovery/parse-month-archive.test.mjs`

- [ ] **Step 1: Write fixture**

Create `tests/fixtures/month-january.html`:

```html
<html>
<body>
<td colspan="7" class="barra-titulos-um">Arquivo - Janeiro</td>
<tr align="left" valign="top">
  <td><a href="javascript:openwindow('historias/01/01/historia.aspx')"><img src="Historias/01/01/Imagens/icone.jpg"></a></td>
  <td></td>
  <td><span class="arquivo-titulos">Moleiros e Carvoeiros</span><br> <span class="arquivo-descricao">Dia Mundial da Paz</span><br> <span class="arquivo-data">1 de Janeiro</span></td>
</tr>
<tr align="left" valign="top">
  <td><a href="javascript:openwindow('historias/01/02/historia.aspx')"><img src="Historias/01/02/Imagens/icone.jpg"></a></td>
  <td></td>
  <td><span class="arquivo-titulos">A Ovelha Generosa</span><br> <span class="arquivo-data">2 de Janeiro</span></td>
</tr>
</body>
</html>
```

- [ ] **Step 2: Write failing parser tests**

Create `tests/recovery/parse-month-archive.test.mjs`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseMonthArchive } from '../../src/recovery/parse-month-archive.mjs';

describe('parseMonthArchive', () => {
  it('extracts story summaries from archive HTML', async () => {
    const html = await readFile('tests/fixtures/month-january.html', 'utf8');
    const stories = parseMonthArchive(html, { month: 1, sourceUrl: 'https://web.archive.org/sample' });

    assert.deepEqual(stories, [
      {
        id: '01-01',
        month: 1,
        day: 1,
        title: 'Moleiros e Carvoeiros',
        dateLabel: '1 de Janeiro',
        dayContext: 'Dia Mundial da Paz',
        storyPath: 'historias/01/01/historia.aspx',
        iconPath: 'Historias/01/01/Imagens/icone.jpg',
        sourceUrl: 'https://web.archive.org/sample'
      },
      {
        id: '01-02',
        month: 1,
        day: 2,
        title: 'A Ovelha Generosa',
        dateLabel: '2 de Janeiro',
        dayContext: null,
        storyPath: 'historias/01/02/historia.aspx',
        iconPath: 'Historias/01/02/Imagens/icone.jpg',
        sourceUrl: 'https://web.archive.org/sample'
      }
    ]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run:

```bash
node --test tests/recovery/parse-month-archive.test.mjs
```

Expected: FAIL because parser does not exist.

- [ ] **Step 4: Implement parser**

Create `src/recovery/parse-month-archive.mjs`:

```js
import { formatStoryId } from './calendar.mjs';

function decodeHtml(value) {
  return value
    .replaceAll('&oacute;', 'ó')
    .replaceAll('&uacute;', 'ú')
    .replaceAll('&atilde;', 'ã')
    .replaceAll('&ccedil;', 'ç')
    .replaceAll('&ecirc;', 'ê')
    .replaceAll('&aacute;', 'á')
    .replaceAll('&eacute;', 'é')
    .replaceAll('&iacute;', 'í')
    .replaceAll('&nbsp;', ' ')
    .replaceAll(/<[^>]+>/g, '')
    .replaceAll(/\s+/g, ' ')
    .trim();
}

function firstMatch(input, pattern) {
  const match = input.match(pattern);
  return match ? match[1] : null;
}

export function parseMonthArchive(html, { month, sourceUrl }) {
  const rowPattern = /<tr align="left" valign="top">([\s\S]*?)<\/tr>/gi;
  const rows = [...html.matchAll(rowPattern)].map((match) => match[1]);

  return rows
    .map((row) => {
      const storyPath = firstMatch(row, /openwindow\('([^']+historia\.aspx)'\)/i);
      const iconPath = firstMatch(row, /<img src="([^"]*icone\.jpg)"/i);
      const title = firstMatch(row, /class="arquivo-titulos">([\s\S]*?)<\/span>/i);
      const dateLabel = firstMatch(row, /class="arquivo-data">([\s\S]*?)<\/span>/i);
      const dayContext = firstMatch(row, /class="arquivo-descricao">([\s\S]*?)<\/span>/i);

      if (!storyPath || !title || !dateLabel) {
        return null;
      }

      const day = Number(firstMatch(dateLabel, /(\d+)/));

      return {
        id: formatStoryId(month, day),
        month,
        day,
        title: decodeHtml(title),
        dateLabel: decodeHtml(dateLabel),
        dayContext: dayContext ? decodeHtml(dayContext) : null,
        storyPath,
        iconPath,
        sourceUrl
      };
    })
    .filter(Boolean);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run:

```bash
node --test tests/recovery/parse-month-archive.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

If git is available:

```bash
git add tests/fixtures/month-january.html src/recovery/parse-month-archive.mjs tests/recovery/parse-month-archive.test.mjs
git commit -m "Extract story summaries from archived month pages

Month pages are the most reliable way to discover dated stories, so this parser turns recovered table rows into structured archive entries.

Constraint: The original HTML is table-based and ISO-era markup.
Confidence: medium
Scope-risk: narrow
Tested: node --test tests/recovery/parse-month-archive.test.mjs"
```

## Task 4: Story Page Parser

**Files:**
- Create: `tests/fixtures/story-01-01.html`
- Create: `src/recovery/parse-story-page.mjs`
- Test: `tests/recovery/parse-story-page.test.mjs`

- [ ] **Step 1: Write fixture**

Create `tests/fixtures/story-01-01.html`:

```html
<html>
<head><title>História do Dia - Moleiros e Carvoeiros</title></head>
<body background="Imagens/Background.jpg">
<param name="movie" value="http://sons.historiadodia.pt/01/01/um.swf">
<SCRIPT>
Text[131]=["engalfinharam-se","pegaram-se"]
Text[132]=["contendores","rivais / advers&aacute;rios"]
</SCRIPT>
<div id="Layer1"><font class="atitulohistoria"><b> Moleiros e Carvoeiros</b></font><font class="anomeautores"><b> Ant&oacute;nio Torrado</b></font><font class="anomeilustrador"> <b>Cristina Malaquias</b></font></div>
<div id="Layer2"><font class="historia-text"><b><div>No tempo em que as velas dos moinhos rodavam ao vento.</div><div>Esquecemo-nos de dizer que ao lado do moleiro ia o filho do moleiro.</div></b></font></div>
<div id="Layer3"><font class="historia-text"><b><div>Os dois mi&uacute;dos <A class="alink" href="#" onMouseOver="stm(Text[131],Style[0])">engalfinharam-se</a> &agrave; zaragata.</div></b></font></div>
<a href="imprimir.pdf" target="_blank">imprimir</a>
</body>
</html>
```

- [ ] **Step 2: Write failing parser tests**

Create `tests/recovery/parse-story-page.test.mjs`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseStoryPage } from '../../src/recovery/parse-story-page.mjs';

describe('parseStoryPage', () => {
  it('extracts story metadata, segments, glossary, and assets', async () => {
    const html = await readFile('tests/fixtures/story-01-01.html', 'utf8');
    const story = parseStoryPage(html, {
      id: '01-01',
      month: 1,
      day: 1,
      sourceUrl: 'https://web.archive.org/story'
    });

    assert.equal(story.id, '01-01');
    assert.equal(story.title, 'Moleiros e Carvoeiros');
    assert.equal(story.author, 'António Torrado');
    assert.equal(story.illustrator, 'Cristina Malaquias');
    assert.equal(story.textSegments.length, 2);
    assert.equal(story.textSegments[0].paragraphs[0], 'No tempo em que as velas dos moinhos rodavam ao vento.');
    assert.equal(story.glossary[0].term, 'engalfinharam-se');
    assert.equal(story.glossary[0].definition, 'pegaram-se');
    assert.equal(story.assets.background, 'Imagens/Background.jpg');
    assert.equal(story.assets.printPdf, 'imprimir.pdf');
    assert.equal(story.assets.originalAudioSwf, 'http://sons.historiadodia.pt/01/01/um.swf');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run:

```bash
node --test tests/recovery/parse-story-page.test.mjs
```

Expected: FAIL because parser does not exist.

- [ ] **Step 4: Implement story parser**

Create `src/recovery/parse-story-page.mjs`:

```js
function decodeHtml(value) {
  return value
    .replaceAll('&oacute;', 'ó')
    .replaceAll('&uacute;', 'ú')
    .replaceAll('&atilde;', 'ã')
    .replaceAll('&ccedil;', 'ç')
    .replaceAll('&ecirc;', 'ê')
    .replaceAll('&aacute;', 'á')
    .replaceAll('&eacute;', 'é')
    .replaceAll('&iacute;', 'í')
    .replaceAll('&agrave;', 'à')
    .replaceAll('&nbsp;', ' ')
    .replaceAll(/\s+/g, ' ')
    .trim();
}

function stripTags(value) {
  return decodeHtml(value.replaceAll(/<[^>]+>/g, ' '));
}

function firstMatch(input, pattern) {
  const match = input.match(pattern);
  return match ? match[1] : null;
}

function parseGlossary(html) {
  const pattern = /Text\[(\d+)\]=\["([^"]+)","([^"]+)"\]/g;
  return [...html.matchAll(pattern)].map((match) => ({
    id: match[1],
    term: decodeHtml(match[2]),
    definition: decodeHtml(match[3])
  }));
}

function parseTextSegments(html) {
  const layerPattern = /<div id="Layer(\d+)"[\s\S]*?<font class="historia-text">([\s\S]*?)<\/font>[\s\S]*?<\/div>/gi;
  return [...html.matchAll(layerPattern)].map((match) => {
    const paragraphs = [...match[2].matchAll(/<div[^>]*>([\s\S]*?)<\/div>/gi)]
      .map((paragraph) => stripTags(paragraph[1]))
      .filter(Boolean);
    return {
      layer: Number(match[1]),
      paragraphs
    };
  }).filter((segment) => segment.paragraphs.length > 0);
}

export function parseStoryPage(html, base) {
  const title = firstMatch(html, /class="atitulohistoria"><b>\s*([\s\S]*?)<\/b>/i);
  const author = firstMatch(html, /class="anomeautores"><b>\s*([\s\S]*?)<\/b>/i);
  const illustrator = firstMatch(html, /class="anomeilustrador">\s*<b>\s*([\s\S]*?)<\/b>/i);

  return {
    ...base,
    title: title ? stripTags(title) : null,
    author: author ? stripTags(author) : null,
    illustrator: illustrator ? stripTags(illustrator) : null,
    textSegments: parseTextSegments(html),
    glossary: parseGlossary(html),
    assets: {
      background: firstMatch(html, /background="([^"]+)"/i),
      printPdf: firstMatch(html, /href="([^"]*imprimir\.pdf)"/i),
      originalAudioSwf: firstMatch(html, /value="(http:\/\/sons\.historiadodia\.pt\/[^"]+\.swf)"/i)
    },
    provenance: {
      sourceUrl: base.sourceUrl
    }
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run:

```bash
node --test tests/recovery/parse-story-page.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

If git is available:

```bash
git add tests/fixtures/story-01-01.html src/recovery/parse-story-page.mjs tests/recovery/parse-story-page.test.mjs
git commit -m "Parse recovered story pages into structured reading data

Story pages contain layered text, credits, glossary terms, PDFs, imagery, and Flash audio references; parsing them separates archival content from the new UI.

Constraint: Original stories are Flash-era HTML layers, not semantic article markup.
Confidence: medium
Scope-risk: moderate
Tested: node --test tests/recovery/parse-story-page.test.mjs"
```

## Task 5: Sample Story Data And Manifest

**Files:**
- Create: `data/stories/01-01.json`
- Create: `data/archive-index.json`
- Create: `src/recovery/build-manifest.mjs`
- Test: `tests/recovery/build-manifest.test.mjs`
- Create: `docs/recovery-report.md`

- [ ] **Step 1: Write sample story data**

Create `data/stories/01-01.json`:

```json
{
  "id": "01-01",
  "month": 1,
  "day": 1,
  "dateLabel": "1 de Janeiro",
  "dayContext": "Dia Mundial da Paz",
  "title": "Moleiros e Carvoeiros",
  "author": "António Torrado",
  "illustrator": "Cristina Malaquias",
  "textSegments": [
    {
      "layer": 2,
      "paragraphs": [
        "No tempo em que as velas dos moinhos rodavam ao vento, um moleiro, todo enfarinhado de carregar com sacas de farinha, cruzou-se, na estrada, com um carvoeiro todo enfarruscado de carregar com sacas de carvão.",
        "Esquecemo-nos de dizer que ao lado do moleiro ia o filho do moleiro e ao lado do carvoeiro, o filho do carvoeiro."
      ]
    },
    {
      "layer": 3,
      "paragraphs": [
        "Nesse tempo também, os filhos dos moleiros não tinham outro destino senão ser moleiros e os filhos dos carvoeiros não podiam ambicionar outra vida senão ser carvoeiros.",
        "- Ó pai, já viste aqueles dois tão sujos que ali vão? - disse o filho do moleiro para o moleiro.",
        "O filho do carvoeiro ouviu o comentário e não gostou. Aliás, o pai também não gostou."
      ]
    }
  ],
  "glossary": [
    { "term": "engalfinharam-se", "definition": "pegaram-se" },
    { "term": "contendores", "definition": "rivais / adversários" }
  ],
  "assets": {
    "background": "pt/historias/01/01/Imagens/Background.jpg",
    "icon": "pt/Historias/01/01/Imagens/icone.jpg",
    "printPdf": "pt/historias/01/01/imprimir.pdf",
    "originalAudioSwf": "http://sons.historiadodia.pt/01/01/um.swf",
    "rerecordedAudio": null
  },
  "recovery": {
    "text": "recovered",
    "illustration": "remote-original",
    "originalAudio": "swf-reference",
    "rerecordedAudio": "not-recorded",
    "pdf": "remote-original",
    "completeness": "partial-sample"
  },
  "provenance": {
    "storyPage": "https://web.archive.org/web/20040104010647id_/http://www.historiadodia.pt:80/pt/historias/01/01/historia.aspx",
    "notes": "Sample includes first recovered text layers only; full recovery task should replace this with complete parsed output."
  },
  "editorialNotes": [
    "Paragraph text is normalized from original HTML layers.",
    "Audio is an original SWF reference and is not playable in the first static prototype."
  ]
}
```

Create `data/archive-index.json`:

```json
{
  "generatedFrom": "manual-sample",
  "stories": [
    {
      "id": "01-01",
      "month": 1,
      "day": 1,
      "title": "Moleiros e Carvoeiros",
      "dateLabel": "1 de Janeiro",
      "dayContext": "Dia Mundial da Paz",
      "status": "partial-sample"
    }
  ]
}
```

- [ ] **Step 2: Write failing manifest tests**

Create `tests/recovery/build-manifest.test.mjs`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildManifest } from '../../src/recovery/build-manifest.mjs';

describe('buildManifest', () => {
  it('summarizes story recovery state', async () => {
    const manifest = await buildManifest({ storiesDir: 'data/stories' });

    assert.equal(manifest.totalStories, 1);
    assert.equal(manifest.stories[0].id, '01-01');
    assert.equal(manifest.stories[0].hasRecoveredText, true);
    assert.equal(manifest.stories[0].hasOriginalAudioReference, true);
    assert.equal(manifest.stories[0].hasRerecordedAudio, false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run:

```bash
node --test tests/recovery/build-manifest.test.mjs
```

Expected: FAIL because manifest module does not exist.

- [ ] **Step 4: Implement manifest builder**

Create `src/recovery/build-manifest.mjs`:

```js
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function loadStories(storiesDir) {
  const files = (await readdir(storiesDir)).filter((file) => file.endsWith('.json')).sort();
  return Promise.all(files.map(async (file) => {
    const json = await readFile(path.join(storiesDir, file), 'utf8');
    return JSON.parse(json);
  }));
}

export async function buildManifest({ storiesDir }) {
  const stories = await loadStories(storiesDir);
  return {
    totalStories: stories.length,
    stories: stories.map((story) => ({
      id: story.id,
      title: story.title,
      dateLabel: story.dateLabel,
      hasRecoveredText: story.textSegments.some((segment) => segment.paragraphs.length > 0),
      hasOriginalIllustration: Boolean(story.assets.background || story.assets.icon),
      hasOriginalAudioReference: Boolean(story.assets.originalAudioSwf),
      hasRerecordedAudio: Boolean(story.assets.rerecordedAudio),
      hasPdf: Boolean(story.assets.printPdf),
      completeness: story.recovery.completeness
    }))
  };
}

export function renderRecoveryReport(manifest) {
  const rows = manifest.stories.map((story) => (
    `| ${story.id} | ${story.title} | ${story.completeness} | ${story.hasRecoveredText ? 'yes' : 'no'} | ${story.hasOriginalAudioReference ? 'yes' : 'no'} | ${story.hasRerecordedAudio ? 'yes' : 'no'} |`
  ));
  return [
    '# Recovery Report',
    '',
    `Total stories in manifest: ${manifest.totalStories}`,
    '',
    '| Date | Title | Completeness | Text | Original audio ref | Rerecorded audio |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows,
    ''
  ].join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const manifest = await buildManifest({ storiesDir: 'data/stories' });
  await writeFile('docs/recovery-report.md', renderRecoveryReport(manifest));
  console.log(`Wrote docs/recovery-report.md for ${manifest.totalStories} stories`);
}
```

- [ ] **Step 5: Run tests and generate report**

Run:

```bash
node --test tests/recovery/build-manifest.test.mjs
npm run recover:manifest
```

Expected:

```text
PASS tests/recovery/build-manifest.test.mjs
Wrote docs/recovery-report.md for 1 stories
```

- [ ] **Step 6: Commit**

If git is available:

```bash
git add data/stories/01-01.json data/archive-index.json src/recovery/build-manifest.mjs tests/recovery/build-manifest.test.mjs docs/recovery-report.md
git commit -m "Make recovery status visible from structured stories

The archive needs honest provenance, so story data now feeds a recovery manifest before the UI renders badges or availability states.

Constraint: The first story is a partial sample until full parsing replaces it.
Confidence: medium
Scope-risk: moderate
Tested: node --test tests/recovery/build-manifest.test.mjs; npm run recover:manifest"
```

## Task 6: Static Site Renderer

**Files:**
- Create: `src/site/render.mjs`
- Create: `src/site/public/styles.css`
- Create: `src/site/public/app.js`
- Test: `tests/site/render.test.mjs`

- [ ] **Step 1: Write failing render tests**

Create `tests/site/render.test.mjs`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import { renderSite } from '../../src/site/render.mjs';

describe('renderSite', () => {
  it('renders homepage, archive, and story page from story data', async () => {
    await rm('dist', { recursive: true, force: true });
    await renderSite({ storiesDir: 'data/stories', outDir: 'dist' });

    const homepage = await readFile('dist/index.html', 'utf8');
    const archive = await readFile('dist/archive/index.html', 'utf8');
    const story = await readFile('dist/stories/01-01/index.html', 'utf8');

    assert.match(homepage, /Moleiros e Carvoeiros/);
    assert.match(homepage, /Ler/);
    assert.match(homepage, /Ouvir/);
    assert.match(archive, /1 de Janeiro/);
    assert.match(story, /António Torrado/);
    assert.match(story, /Narração original em Flash recuperada/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/site/render.test.mjs
```

Expected: FAIL because renderer does not exist.

- [ ] **Step 3: Implement renderer**

Create `src/site/render.mjs`:

```js
import { mkdir, readFile, readdir, writeFile, cp } from 'node:fs/promises';
import path from 'node:path';

async function loadStories(storiesDir) {
  const files = (await readdir(storiesDir)).filter((file) => file.endsWith('.json')).sort();
  return Promise.all(files.map(async (file) => JSON.parse(await readFile(path.join(storiesDir, file), 'utf8'))));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function pageShell({ title, body }) {
  return `<!doctype html>
<html lang="pt-PT">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="/styles.css">
  <script src="/app.js" defer></script>
</head>
<body>
  <a class="skip-link" href="#conteudo">Saltar para a história</a>
  <header class="site-header">
    <a class="brand" href="/">História do Dia</a>
    <nav aria-label="Navegação principal">
      <a href="/">Hoje</a>
      <a href="/archive/">Arquivo</a>
    </nav>
  </header>
  <main id="conteudo">${body}</main>
</body>
</html>`;
}

function recoveryBadges(story) {
  const badges = [
    ['Texto recuperado', story.recovery.text === 'recovered'],
    ['Ilustração original', Boolean(story.assets.background || story.assets.icon)],
    ['PDF recuperado', Boolean(story.assets.printPdf)],
    ['Áudio original em Flash', Boolean(story.assets.originalAudioSwf)],
    ['Narração regravada', Boolean(story.assets.rerecordedAudio)]
  ];
  return `<ul class="badges">${badges.map(([label, active]) => `<li class="${active ? 'is-available' : 'is-missing'}">${label}</li>`).join('')}</ul>`;
}

function audioNotice(story) {
  if (story.assets.rerecordedAudio) {
    return `<audio controls src="${escapeHtml(story.assets.rerecordedAudio)}"></audio><p class="notice">Narração regravada. Não é o áudio original.</p>`;
  }
  if (story.assets.originalAudioSwf) {
    return `<p class="notice">Narração original em Flash recuperada como referência. Conversão para áudio moderno pendente.</p>`;
  }
  return `<p class="notice">Ainda não há áudio recuperado para esta história.</p>`;
}

function storyText(story) {
  return story.textSegments.map((segment, index) => `
    <section class="story-segment" aria-labelledby="segmento-${index + 1}">
      <h2 id="segmento-${index + 1}">Parte ${index + 1}</h2>
      ${segment.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')}
    </section>
  `).join('');
}

function renderHome(story) {
  return pageShell({
    title: 'História do Dia',
    body: `
      <section class="today-hero">
        <div class="today-copy">
          <p class="eyebrow">${escapeHtml(story.dateLabel)}</p>
          <h1>${escapeHtml(story.title)}</h1>
          <p class="context">${escapeHtml(story.dayContext || 'Uma história recuperada do arquivo original.')}</p>
          <div class="actions">
            <a class="button primary" href="/stories/${story.id}/">Ler</a>
            <a class="button" href="/stories/${story.id}/#audio">Ouvir</a>
          </div>
          ${recoveryBadges(story)}
        </div>
        <div class="paper-illustration" aria-label="Espaço reservado para ilustração original recuperada">
          <span>Ilustração original recuperada</span>
        </div>
      </section>
    `
  });
}

function renderArchive(stories) {
  return pageShell({
    title: 'Arquivo das Histórias',
    body: `
      <section class="archive">
        <p class="eyebrow">Arquivo</p>
        <h1>Escolhe um dia</h1>
        <div class="archive-grid">
          ${stories.map((story) => `
            <a class="archive-day" href="/stories/${story.id}/">
              <span>${escapeHtml(story.dateLabel)}</span>
              <strong>${escapeHtml(story.title)}</strong>
              <small>${escapeHtml(story.recovery.completeness)}</small>
            </a>
          `).join('')}
        </div>
      </section>
    `
  });
}

function renderStory(story) {
  return pageShell({
    title: `${story.title} | História do Dia`,
    body: `
      <article class="reader">
        <p class="eyebrow">${escapeHtml(story.dateLabel)}</p>
        <h1>${escapeHtml(story.title)}</h1>
        <p class="credits">${escapeHtml(story.author)} escreveu. ${escapeHtml(story.illustrator)} ilustrou.</p>
        ${recoveryBadges(story)}
        <section id="audio" class="audio-panel">
          <h2>Ouvir</h2>
          ${audioNotice(story)}
        </section>
        ${storyText(story)}
        <section class="glossary">
          <h2>Palavras da história</h2>
          ${story.glossary.map((entry) => `<button class="glossary-item" type="button"><strong>${escapeHtml(entry.term)}</strong><span>${escapeHtml(entry.definition)}</span></button>`).join('')}
        </section>
        <section class="provenance">
          <h2>Recuperação</h2>
          <p>${escapeHtml(story.provenance.notes)}</p>
        </section>
      </article>
    `
  });
}

export async function renderSite({ storiesDir, outDir }) {
  const stories = await loadStories(storiesDir);
  const todayStory = stories[0];
  await mkdir(outDir, { recursive: true });
  await mkdir(path.join(outDir, 'archive'), { recursive: true });
  await mkdir(path.join(outDir, 'stories', todayStory.id), { recursive: true });
  await cp('src/site/public', outDir, { recursive: true });
  await writeFile(path.join(outDir, 'index.html'), renderHome(todayStory));
  await writeFile(path.join(outDir, 'archive', 'index.html'), renderArchive(stories));
  await writeFile(path.join(outDir, 'stories', todayStory.id, 'index.html'), renderStory(todayStory));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await renderSite({ storiesDir: 'data/stories', outDir: 'dist' });
  console.log('Built dist/');
}
```

- [ ] **Step 4: Add CSS**

Create `src/site/public/styles.css`:

```css
:root {
  color-scheme: light;
  --paper: oklch(0.96 0.025 82);
  --paper-shadow: oklch(0.88 0.045 103);
  --ink: oklch(0.24 0.045 76);
  --muted-ink: oklch(0.43 0.04 76);
  --amber: oklch(0.64 0.16 47);
  --olive: oklch(0.59 0.10 105);
  --soft-green: oklch(0.72 0.08 145);
  --clay: oklch(0.62 0.12 35);
  font-family: ui-rounded, "Avenir Next", "Trebuchet MS", system-ui, sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: linear-gradient(145deg, var(--paper), var(--paper-shadow));
  color: var(--ink);
  min-height: 100vh;
}

a {
  color: inherit;
}

.skip-link {
  position: absolute;
  left: 1rem;
  top: -4rem;
  background: var(--amber);
  padding: .75rem 1rem;
}

.skip-link:focus {
  top: 1rem;
}

.site-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: clamp(1rem, 3vw, 2rem);
}

.brand {
  font-weight: 800;
  text-decoration: none;
}

nav {
  display: flex;
  gap: 1rem;
}

main {
  padding: clamp(1rem, 4vw, 3rem);
}

.today-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(260px, .9fr);
  gap: clamp(1.5rem, 5vw, 4rem);
  align-items: center;
}

.eyebrow {
  color: var(--muted-ink);
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: .06em;
}

h1 {
  max-width: 11ch;
  font-size: clamp(2.5rem, 8vw, 6.4rem);
  line-height: .98;
  letter-spacing: 0;
  margin: 0 0 1rem;
}

.context,
.credits,
.notice,
.provenance p {
  max-width: 65ch;
  font-size: 1.125rem;
  line-height: 1.7;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: .8rem;
  margin: 1.5rem 0;
}

.button {
  border: 2px solid var(--ink);
  border-radius: 999px;
  padding: .9rem 1.2rem;
  min-width: 7rem;
  text-align: center;
  text-decoration: none;
  font-weight: 800;
}

.button.primary {
  background: var(--amber);
}

.badges {
  display: flex;
  flex-wrap: wrap;
  gap: .5rem;
  padding: 0;
  list-style: none;
}

.badges li {
  border-radius: 999px;
  padding: .45rem .7rem;
  border: 1px solid currentColor;
  font-size: .9rem;
  font-weight: 700;
}

.is-available {
  background: color-mix(in oklch, var(--soft-green) 38%, transparent);
}

.is-missing {
  background: color-mix(in oklch, var(--clay) 18%, transparent);
}

.paper-illustration {
  min-height: 22rem;
  border: 2px solid color-mix(in oklch, var(--ink) 40%, transparent);
  border-radius: 8px;
  display: grid;
  place-items: center;
  background: color-mix(in oklch, var(--paper) 72%, var(--soft-green));
  font-weight: 800;
}

.archive-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
  gap: 1rem;
}

.archive-day {
  display: grid;
  gap: .4rem;
  min-height: 9rem;
  padding: 1rem;
  border: 2px solid color-mix(in oklch, var(--ink) 28%, transparent);
  border-radius: 8px;
  text-decoration: none;
  background: color-mix(in oklch, var(--paper) 82%, var(--soft-green));
}

.reader {
  max-width: 72ch;
  margin-inline: auto;
}

.reader h1 {
  max-width: 12ch;
}

.audio-panel,
.story-segment,
.glossary,
.provenance {
  margin-block: 2rem;
}

.story-segment p {
  font-size: clamp(1.2rem, 2.5vw, 1.55rem);
  line-height: 1.75;
}

.glossary-item {
  width: 100%;
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  border: 2px solid color-mix(in oklch, var(--ink) 30%, transparent);
  background: color-mix(in oklch, var(--paper) 86%, var(--olive));
  padding: 1rem;
  border-radius: 8px;
  font: inherit;
  color: inherit;
  text-align: left;
}

:focus-visible {
  outline: 4px solid var(--amber);
  outline-offset: 3px;
}

@media (max-width: 760px) {
  .site-header,
  .today-hero {
    grid-template-columns: 1fr;
  }

  .today-hero {
    display: block;
  }

  h1 {
    font-size: clamp(2.4rem, 14vw, 4.2rem);
  }
}

@media (prefers-reduced-motion: no-preference) {
  .button,
  .archive-day,
  .glossary-item {
    transition: transform 180ms cubic-bezier(.22, 1, .36, 1);
  }

  .button:hover,
  .archive-day:hover,
  .glossary-item:hover {
    transform: translateY(-2px);
  }
}
```

- [ ] **Step 5: Add JS**

Create `src/site/public/app.js`:

```js
document.querySelectorAll('.glossary-item').forEach((item) => {
  item.addEventListener('click', () => {
    item.classList.toggle('is-open');
  });
});
```

- [ ] **Step 6: Run render test and build**

Run:

```bash
node --test tests/site/render.test.mjs
npm run build
```

Expected:

```text
PASS tests/site/render.test.mjs
Built dist/
```

- [ ] **Step 7: Commit**

If git is available:

```bash
git add src/site/render.mjs src/site/public/styles.css src/site/public/app.js tests/site/render.test.mjs dist
git commit -m "Render the first paper-atelier story prototype

The UI now renders from structured recovered story data, keeping provenance and reader behavior separate from archive parsing.

Constraint: No frontend dependency is needed for the first static vertical.
Confidence: medium
Scope-risk: moderate
Tested: node --test tests/site/render.test.mjs; npm run build"
```

## Task 7: Local Static Server

**Files:**
- Create: `src/site/dev-server.mjs`
- Test: `tests/site/dev-server.test.mjs`

- [ ] **Step 1: Write failing server tests**

Create `tests/site/dev-server.test.mjs`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { contentTypeFor, resolveRequestPath } from '../../src/site/dev-server.mjs';

describe('dev server helpers', () => {
  it('maps routes to static files', () => {
    assert.equal(resolveRequestPath('/', 'dist'), 'dist/index.html');
    assert.equal(resolveRequestPath('/archive/', 'dist'), 'dist/archive/index.html');
    assert.equal(resolveRequestPath('/stories/01-01/', 'dist'), 'dist/stories/01-01/index.html');
  });

  it('returns useful content types', () => {
    assert.equal(contentTypeFor('styles.css'), 'text/css; charset=utf-8');
    assert.equal(contentTypeFor('app.js'), 'text/javascript; charset=utf-8');
    assert.equal(contentTypeFor('index.html'), 'text/html; charset=utf-8');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/site/dev-server.test.mjs
```

Expected: FAIL because server module does not exist.

- [ ] **Step 3: Implement server**

Create `src/site/dev-server.mjs`:

```js
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export function resolveRequestPath(urlPath, rootDir) {
  const cleanPath = decodeURIComponent(urlPath.split('?')[0]);
  if (cleanPath.endsWith('/')) {
    return path.join(rootDir, cleanPath, 'index.html');
  }
  return path.join(rootDir, cleanPath);
}

export function contentTypeFor(filePath) {
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  return 'text/html; charset=utf-8';
}

export function createServer({ rootDir = 'dist' } = {}) {
  return http.createServer(async (request, response) => {
    try {
      const filePath = resolveRequestPath(request.url, rootDir);
      const body = await readFile(filePath);
      response.writeHead(200, { 'Content-Type': contentTypeFor(filePath) });
      response.end(body);
    } catch {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT || 4173);
  createServer().listen(port, '127.0.0.1', () => {
    console.log(`Serving dist/ at http://127.0.0.1:${port}`);
  });
}
```

- [ ] **Step 4: Run tests**

Run:

```bash
node --test tests/site/dev-server.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Start local server**

Run:

```bash
npm run build
npm run serve
```

Expected:

```text
Serving dist/ at http://127.0.0.1:4173
```

Keep the server running only while manually reviewing the static site.

- [ ] **Step 6: Commit**

If git is available:

```bash
git add src/site/dev-server.mjs tests/site/dev-server.test.mjs
git commit -m "Serve the static reconstruction locally

A tiny local server makes the dependency-free prototype reviewable without choosing a frontend framework yet.

Constraint: First vertical should stay dependency-free.
Confidence: high
Scope-risk: narrow
Tested: node --test tests/site/dev-server.test.mjs"
```

## Task 8: Verification Pass

**Files:**
- Modify: `docs/recovery-report.md`

- [ ] **Step 1: Run all automated checks**

Run:

```bash
npm test
npm run recover:manifest
npm run build
```

Expected:

```text
PASS tests/recovery/calendar.test.mjs
PASS tests/recovery/cdx.test.mjs
PASS tests/recovery/parse-month-archive.test.mjs
PASS tests/recovery/parse-story-page.test.mjs
PASS tests/recovery/build-manifest.test.mjs
PASS tests/site/render.test.mjs
PASS tests/site/dev-server.test.mjs
Wrote docs/recovery-report.md for 1 stories
Built dist/
```

- [ ] **Step 2: Inspect generated pages**

Run:

```bash
rg -n "Moleiros e Carvoeiros|Narração original em Flash recuperada|Texto recuperado|Ilustração original" dist
```

Expected: matches in `dist/index.html` and `dist/stories/01-01/index.html`.

- [ ] **Step 3: Check accessibility basics in generated HTML**

Run:

```bash
rg -n "lang=\"pt-PT\"|skip-link|aria-label|audio controls|prefers-reduced-motion|:focus-visible" dist src/site/public/styles.css
```

Expected: matches for language, skip link, labels, reduced motion, and focus-visible styles.

- [ ] **Step 4: Commit verification report**

If git is available:

```bash
git add docs/recovery-report.md dist
git commit -m "Record the first reconstruction verification evidence

The first vertical now has parser tests, render tests, generated pages, and a recovery report that make the current partial state explicit.

Constraint: Full 366-day recovery is a later expansion after the vertical proves the model.
Confidence: medium
Scope-risk: narrow
Tested: npm test; npm run recover:manifest; npm run build"
```

## Self-Review

Spec coverage:

- Archive inventory for 366 dates: Task 1.
- Wayback CDX boundary: Task 2.
- Month archive parsing: Task 3.
- Story page parsing for layered text, credits, glossary, assets, and SWF references: Task 4.
- Structured story data and recovery state: Task 5.
- Story of today, archive, reader, audio provenance, and recovered-content-first UI: Task 6.
- Local review surface: Task 7.
- Verification evidence: Task 8.

Known gaps intentionally deferred:

- Full networked recovery of all 366 dates.
- Conversion of SWF audio to modern audio files.
- Rerecorded narration production.
- Legal rights review for republishing original content.
- English alternate-link preservation.

The plan contains no unfinished-work markers, filler directives, or undefined function names. Each task has exact files, tests, implementation snippets, commands, and expected outcomes.
