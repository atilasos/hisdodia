#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  cleanPdfPage,
  stitchPdfPageSegments,
  validateParagraphs
} from './extract-pending-text.mjs';

const execFileAsync = promisify(execFile);
const PDF_DIR = 'tmp/blog-recovery/pdfs';
const LOST_STORIES_PATH = 'tmp/lost-stories.json';
const STORIES_DIR = 'data/stories';
const HIGH_SIMILARITY_THRESHOLD = 0.82;
const CROSS_VALIDATION_GATE = 0.9;
const PROVENANCE_NOTE = 'Texto recuperado de uma compilação mensal em PDF publicada pelo blogue da biblioteca escolar da EB 2,3 de Jovim (2019-2020), que reproduzia as histórias do site original; não provém do site arquivado.';
const EDITORIAL_NOTE = 'Texto recuperado de uma compilação mensal em PDF publicada pelo blogue da biblioteca escolar da EB 2,3 de Jovim (2019-2020), que reproduzia as histórias do site original; não provém do site arquivado.';
const FEBRUARY_24_DISCREPANCY_NOTE = 'Na listagem mensal original preservada pelo Arquivo.pt, o dia 24 de Fevereiro surgia associado a «Uma História de Encantar com Batatas». A compilação republicada pelo blogue em 2019-2020 identifica explicitamente «O Espelhinho» como «24 de Fevereiro»; por isso, o título e o texto aqui apresentados seguem essa republicação, ficando registada a discrepância entre as fontes.';
const CONFIRMED_TITLES = new Map([
  ['02-23', 'QUEM É O REI?'],
  ['05-20', 'TRÊS ESPIGAS']
]);
const MONTHS = [
  { month: 1, monthName: 'Janeiro', file: '01-janeiro.pdf', days: 31 },
  { month: 2, monthName: 'Fevereiro', file: '02-fevereiro.pdf', days: 29 },
  { month: 3, monthName: 'Março', file: '03-marco.pdf', days: 31 },
  { month: 4, monthName: 'Abril', file: '04-abril.pdf', days: 30 },
  { month: 5, monthName: 'Maio', file: '05-maio.pdf', days: 31 },
  { month: 6, monthName: 'Junho', file: '06-junho.pdf', days: 30 },
  { month: 7, monthName: 'Julho', file: '07-julho.pdf', days: 31 },
  { month: 8, monthName: 'Agosto', file: '08-agosto.pdf', days: 31 },
  { month: 9, monthName: 'Setembro', file: '09-setembro.pdf', days: 30 },
  { month: 10, monthName: 'Outubro', file: '10-outubro.pdf', days: 31 },
  { month: 11, monthName: 'Novembro', file: '11-novembro.pdf', days: 30 },
  { month: 12, monthName: 'Dezembro', file: '12-dezembro.pdf', days: 31 }
];
const LOWERCASE_TITLE_WORDS = new Set([
  'a', 'as', 'o', 'os', 'e', 'de', 'da', 'das', 'do', 'dos',
  'em', 'na', 'nas', 'no', 'nos', 'com', 'sem', 'para', 'por',
  'ao', 'aos', 'à', 'às', 'um', 'uma', 'é'
]);
const FOOTER_LINE = /^(?:\d+|©\s*APENA\s*[-–]\s*APDD.*|Cofinanciado\b.*|www\.hugoteacher\.blogspot\.com)$/iu;
const LOST_GENERATED_NOTE = /(?:\s*Não foi encontrada uma fonte local com o texto original recuperável\.|\s*O texto original não está disponível nas fontes locais recuperadas e foi assinalado como perdido\.)/gu;
const LOST_EDITORIAL_NOTE = /O texto original não está disponível nas fontes locais recuperadas e foi assinalado como perdido\./u;

function normalizeComparable(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replaceAll(/\p{M}/gu, '')
    .replaceAll(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLocaleLowerCase('pt-PT');
}

function titleWord(value, index) {
  const lower = value.toLocaleLowerCase('pt-PT');
  if (index > 0 && LOWERCASE_TITLE_WORDS.has(lower)) {
    return lower;
  }
  return lower
    .split('-')
    .map((part) => part.replace(/^\p{L}/u, (letter) => letter.toLocaleUpperCase('pt-PT'))
      .replace(/(['’])\p{L}/gu, (match) => match.toLocaleUpperCase('pt-PT')))
    .join('-');
}

export function toPortugueseTitleCase(value) {
  return String(value ?? '')
    .normalize('NFC')
    .replaceAll(/\s+/gu, ' ')
    .trim()
    .split(' ')
    .map(titleWord)
    .join(' ');
}

function isUppercaseTitleLine(value) {
  const letters = value.match(/\p{L}/gu) ?? [];
  return letters.length > 0
    && letters.every((letter) => letter === letter.toLocaleUpperCase('pt-PT'));
}

function leadingSpaces(value) {
  return value.match(/^\s*/u)?.[0].length ?? 0;
}

function pageLines(page) {
  return String(page ?? '')
    .replaceAll('\r', '')
    .split('\n')
    .map((line) => line.replaceAll('\t', '    ').trimEnd());
}

function findBodyStart(lines, creditEnd) {
  for (let index = creditEnd + 1; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (!trimmed || FOOTER_LINE.test(trimmed)) continue;
    if (leadingSpaces(lines[index]) <= 8 && /\p{L}/u.test(trimmed)) {
      return index;
    }
  }
  return creditEnd + 1;
}

function headerFromPage(page, { monthName }) {
  const lines = pageLines(page);
  const limit = Math.min(lines.length, 30);
  let creditIndex = -1;
  let illustratorIndex = -1;

  for (let index = 0; index < limit; index += 1) {
    if (!/\bescreveu(?:\s+e(?:\s+a)?)?\s*$/iu.test(lines[index].trim())) continue;
    const nearbyIllustrator = lines.findIndex((line, candidate) => candidate >= index
      && candidate <= index + 4
      && /Cristina\s+Malaquia/iu.test(line));
    if (nearbyIllustrator >= 0) {
      creditIndex = index;
      illustratorIndex = nearbyIllustrator;
      break;
    }
  }
  if (creditIndex < 0) return null;

  let authorIndex = creditIndex;
  for (let index = creditIndex; index >= Math.max(0, creditIndex - 3); index -= 1) {
    if (/António\s+(?:Torrado|Tor)/iu.test(lines[index])) {
      authorIndex = index;
      break;
    }
  }

  const beforeCredits = lines.slice(0, authorIndex)
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.trim() && !FOOTER_LINE.test(line.trim()));
  const titleEntries = beforeCredits.filter(({ line }) => isUppercaseTitleLine(line.trim()));
  if (!titleEntries.length) return null;
  const titleRaw = titleEntries.map(({ line }) => line.trim()).join(' ').replaceAll(/\s+/gu, ' ');
  const datePattern = new RegExp(`^(\\d{1,2})\\s+de\\s+${monthName}$`, 'iu');
  let day = null;
  let dateIndex = -1;
  for (let index = 0; index < limit; index += 1) {
    const match = lines[index].trim().match(datePattern);
    if (match) {
      day = Number(match[1]);
      dateIndex = index;
      break;
    }
  }

  const bodyStart = findBodyStart(lines, illustratorIndex);
  const contextCandidates = [
    ...beforeCredits.filter(({ index }) => !titleEntries.some((entry) => entry.index === index)),
    ...lines.slice(illustratorIndex + 1, bodyStart).map((line, offset) => ({
      line,
      index: illustratorIndex + 1 + offset
    }))
  ]
    .filter(({ line, index }) => {
      const trimmed = line.trim();
      return trimmed
        && index !== dateIndex
        && !datePattern.test(trimmed)
        && !FOOTER_LINE.test(trimmed);
    });
  const dayContext = contextCandidates.map(({ line }) => line.trim()).join(' ') || null;

  return { titleRaw, day, dayContext, bodyStart };
}

export function segmentBlogCompilationText(text, options) {
  const pages = String(text ?? '').split('\f').filter((page) => page.trim());
  const stories = [];
  let current = null;

  for (const page of pages) {
    const header = headerFromPage(page, options);
    if (header) {
      if (current) stories.push(current);
      current = {
        month: options.month,
        ...header,
        pages: [page]
      };
    } else if (current) {
      current.pages.push(page);
    }
  }
  if (current) stories.push(current);
  return stories;
}

function withoutBlogFooterLines(page) {
  return pageLines(page)
    .filter((line) => !/^\s*www\.hugoteacher\.blogspot\.com\s*$/iu.test(line))
    .join('\n');
}

export function cleanBlogStory(story) {
  const pageSegments = story.pages.map((rawPage, index) => {
    const lines = pageLines(withoutBlogFooterLines(rawPage));
    const page = index === 0
      ? lines.slice(story.bodyStart).join('\n')
      : lines.join('\n');
    return {
      layer: `blog-page-${index + 1}`,
      paragraphs: cleanPdfPage(page, {
        title: story.titleRaw,
        author: 'António Torrado',
        pageNumber: 2
      }).filter((paragraph) => !/^FIM[.!]?$/iu.test(paragraph.trim()))
    };
  });
  return stitchPdfPageSegments(pageSegments).flatMap((segment) => segment.paragraphs);
}

function isShortLine(paragraph) {
  return [...String(paragraph ?? '').trim()].length <= 80;
}

function isCompleteSentence(paragraph) {
  return /[.!?…]["»”')\]]?$/u.test(String(paragraph ?? '').trim());
}

function isVerseLine(paragraphs, index) {
  if (!/^(?:["“«']\s*)?\p{Ll}/u.test(String(paragraphs[index] ?? '').trim())) return false;
  let start = index;
  let end = index;
  while (start > 0 && isShortLine(paragraphs[start - 1])) start -= 1;
  while (end + 1 < paragraphs.length && isShortLine(paragraphs[end + 1])) end += 1;
  const block = paragraphs.slice(start, end + 1);
  const lowercaseLines = block.filter((line) => /^(?:["“«']\s*)?\p{Ll}/u.test(String(line).trim())).length;
  return block.length >= 2
    && block.filter((paragraph) => !isCompleteSentence(paragraph)).length >= 2
    && (lowercaseLines >= 2 || block.some((line) => isUppercaseTitleLine(String(line).trim())));
}

function isEnumeratedItem(paragraph) {
  return /^(?:\p{Ll}|\d+)[.)]\s+\p{L}/u.test(String(paragraph ?? '').trim());
}

export function validateBlogParagraphs(paragraphs) {
  const validation = validateParagraphs(paragraphs);
  const issues = validation.issues.filter((entry) => entry.code !== 'invalid-start'
    || (!isVerseLine(paragraphs, entry.paragraphIndex)
      && !isEnumeratedItem(paragraphs[entry.paragraphIndex])));
  return { valid: issues.length === 0, issues };
}

export function selectConfirmedTitleStory(stories, confirmedTitle) {
  const matches = stories.filter((story) => normalizeComparable(story.titleRaw) === normalizeComparable(confirmedTitle));
  if (matches.length !== 1) {
    throw new Error(`Confirmed title not found exactly once: ${confirmedTitle}`);
  }
  return matches[0];
}

function tokenSimilarity(left, right) {
  const leftTokens = normalizeComparable(left).split(' ').filter(Boolean);
  const rightTokens = normalizeComparable(right).split(' ').filter(Boolean);
  if (!leftTokens.length || !rightTokens.length) return 0;
  const counts = new Map();
  for (const token of leftTokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  let intersection = 0;
  for (const token of rightTokens) {
    const available = counts.get(token) ?? 0;
    if (available > 0) {
      intersection += 1;
      counts.set(token, available - 1);
    }
  }
  return (2 * intersection) / (leftTokens.length + rightTokens.length);
}

function storyText(story) {
  return (story.textSegments ?? []).flatMap((segment) => segment.paragraphs ?? []).join(' ');
}

function compilationFingerprint(story) {
  return `${normalizeComparable(story.titleRaw)}|${normalizeComparable(cleanBlogStory(story).join(' '))}`;
}

function deduplicateCompilationStories(stories) {
  const seen = new Set();
  const result = [];
  for (let index = stories.length - 1; index >= 0; index -= 1) {
    const fingerprint = compilationFingerprint(stories[index]);
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    result.push(stories[index]);
  }
  return result.reverse();
}

function positiveModulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function assignDays(compilationStories, repositoryStories, monthConfig) {
  const titleDays = new Map();
  for (const story of repositoryStories) {
    const key = normalizeComparable(story.title);
    if (!titleDays.has(key)) titleDays.set(key, []);
    titleDays.get(key).push(story.day);
  }

  const assignedByIndex = new Map();
  const usedDays = new Set();
  const anchors = [];
  const assign = (index, day, source) => {
    if (assignedByIndex.has(index) || usedDays.has(day)) return false;
    assignedByIndex.set(index, day);
    usedDays.add(day);
    anchors.push({ index, day, source });
    return true;
  };

  const explicitCandidates = new Map();
  for (const [index, story] of compilationStories.entries()) {
    if (story.day === null) continue;
    if (!explicitCandidates.has(story.day)) explicitCandidates.set(story.day, []);
    explicitCandidates.get(story.day).push(index);
  }
  const explicitOffsets = new Map();
  for (const [index, story] of compilationStories.entries()) {
    if (story.day === null) continue;
    const offset = positiveModulo(story.day - 1 - index, monthConfig.days);
    explicitOffsets.set(offset, (explicitOffsets.get(offset) ?? 0) + 1);
  }
  const dominantExplicitOffset = [...explicitOffsets]
    .sort((left, right) => right[1] - left[1] || left[0] - right[0])[0];
  const hasReliableDateSequence = compilationStories.length === monthConfig.days
    && dominantExplicitOffset
    && dominantExplicitOffset[1] / [...explicitOffsets.values()].reduce((sum, count) => sum + count, 0) >= 0.9;

  if (hasReliableDateSequence) {
    for (const [index] of compilationStories.entries()) {
      const day = positiveModulo(index + dominantExplicitOffset[0], monthConfig.days) + 1;
      assign(index, day, 'pdf-date-sequence');
    }
  } else {
    for (const [day, indices] of explicitCandidates) {
      const repositoryStory = repositoryStories.find((story) => story.day === day);
      const ranked = indices
        .map((index) => {
          const compilationStory = compilationStories[index];
          const titleMatchesDay = (titleDays.get(normalizeComparable(compilationStory.titleRaw)) ?? []).includes(day);
          const similarity = repositoryStory?.recovery?.completeness === 'text-lost'
            ? 0
            : tokenSimilarity(cleanBlogStory(compilationStory).join(' '), storyText(repositoryStory));
          return { index, titleMatchesDay, similarity };
        })
        .sort((left, right) => Number(right.titleMatchesDay) - Number(left.titleMatchesDay)
          || right.similarity - left.similarity
          || left.index - right.index);
      assign(ranked[0].index, day, 'pdf-date');
    }
  }

  for (const [index, story] of compilationStories.entries()) {
    const matchingDays = titleDays.get(normalizeComparable(story.titleRaw)) ?? [];
    if (matchingDays.length === 1) assign(index, matchingDays[0], 'repository-title');
  }

  for (const [index, compilationStory] of compilationStories.entries()) {
    if (assignedByIndex.has(index)) continue;
    const candidates = repositoryStories
      .filter((story) => story.recovery?.completeness !== 'text-lost' && !usedDays.has(story.day))
      .map((story) => ({
        day: story.day,
        similarity: tokenSimilarity(cleanBlogStory(compilationStory).join(' '), storyText(story))
      }))
      .sort((left, right) => right.similarity - left.similarity || left.day - right.day);
    if (candidates[0]?.similarity >= HIGH_SIMILARITY_THRESHOLD
      && candidates[0].similarity > (candidates[1]?.similarity ?? 0)) {
      assign(index, candidates[0].day, 'repository-text');
    }
  }

  let changed = true;
  while (changed && assignedByIndex.size < compilationStories.length) {
    changed = false;
    const ordered = [...assignedByIndex]
      .map(([index, day]) => ({ index, day }))
      .sort((left, right) => left.index - right.index);
    for (const [position, start] of ordered.entries()) {
      const end = ordered[(position + 1) % ordered.length];
      const indexDistance = positiveModulo(end.index - start.index, compilationStories.length);
      const dayDistance = positiveModulo(end.day - start.day, monthConfig.days);
      if (!indexDistance || indexDistance !== dayDistance) continue;
      for (let step = 1; step < indexDistance; step += 1) {
        const index = positiveModulo(start.index + step, compilationStories.length);
        const day = positiveModulo(start.day - 1 + step, monthConfig.days) + 1;
        if (assign(index, day, 'anchored-sequence')) changed = true;
      }
    }
  }

  const byDay = new Map();
  for (const [index, day] of assignedByIndex) {
    byDay.set(day, compilationStories[index]);
  }
  const explicitDateConflicts = compilationStories
    .map((story, index) => ({ index, explicitDay: story.day, assignedDay: assignedByIndex.get(index) }))
    .filter(({ explicitDay, assignedDay }) => explicitDay !== null && assignedDay !== explicitDay);
  return { byDay, anchors, explicitDateConflicts };
}

async function extractPdfText(pdfPath) {
  const { stdout } = await execFileAsync('pdftotext', [
    '-layout', '-enc', 'UTF-8', pdfPath, '-'
  ], { encoding: 'utf8', maxBuffer: 30 * 1024 * 1024 });
  return stdout;
}

function storyId(month, day) {
  return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function appendUnique(items, value) {
  const result = [...(items ?? [])];
  if (!result.includes(value)) result.push(value);
  return result;
}

function withProvenanceNote(notes) {
  const base = String(notes ?? '').replace(LOST_GENERATED_NOTE, '').trim();
  if (base.includes(PROVENANCE_NOTE)) return base;
  return `${base}${base ? ' ' : ''}${PROVENANCE_NOTE}`;
}

export function recoveredStory(story, compilationStory, paragraphs) {
  let editorialNotes = appendUnique(
    (story.editorialNotes ?? []).filter((note) => !LOST_EDITORIAL_NOTE.test(note)),
    EDITORIAL_NOTE
  );
  if (story.id === '02-24') {
    editorialNotes = appendUnique(editorialNotes, FEBRUARY_24_DISCREPANCY_NOTE);
  }
  return {
    ...story,
    ...(!story.dayContext && compilationStory.dayContext
      ? { dayContext: compilationStory.dayContext }
      : {}),
    title: toPortugueseTitleCase(compilationStory.titleRaw),
    textSegments: [{ layer: 'blog-compilation', paragraphs }],
    recovery: {
      ...story.recovery,
      text: 'blog-pdf-extracted',
      completeness: 'blog-text'
    },
    provenance: {
      ...story.provenance,
      notes: withProvenanceNote(story.provenance?.notes)
    },
    editorialNotes
  };
}

async function preflight(pdfDir, storiesDir, lostStoriesPath) {
  await access(lostStoriesPath);
  for (const month of MONTHS) await access(path.join(pdfDir, month.file));
  for (const month of MONTHS) {
    for (let day = 1; day <= month.days; day += 1) {
      await access(path.join(storiesDir, `${storyId(month.month, day)}.json`));
    }
  }
  try {
    await execFileAsync('pdftotext', ['-v'], { encoding: 'utf8' });
  } catch (error) {
    throw new Error('pdftotext is unavailable', { cause: error });
  }
}

export async function extractBlogCompilation(options = {}) {
  const pdfDir = options.pdfDir ?? PDF_DIR;
  const storiesDir = options.storiesDir ?? STORIES_DIR;
  const lostStoriesPath = options.lostStoriesPath ?? LOST_STORIES_PATH;
  await preflight(pdfDir, storiesDir, lostStoriesPath);

  const lostEntries = JSON.parse(await readFile(lostStoriesPath, 'utf8'));
  const lostIds = new Set(lostEntries.map(({ id }) => id));
  const repositoryById = new Map();
  for (const month of MONTHS) {
    for (let day = 1; day <= month.days; day += 1) {
      const id = storyId(month.month, day);
      repositoryById.set(id, JSON.parse(await readFile(path.join(storiesDir, `${id}.json`), 'utf8')));
    }
  }

  const extractedById = new Map();
  const monthDiagnostics = [];
  for (const month of MONTHS) {
    const pdfText = await extractPdfText(path.join(pdfDir, month.file));
    const segmented = segmentBlogCompilationText(pdfText, month);
    const deduplicated = deduplicateCompilationStories(segmented);
    const repositoryStories = [...repositoryById.values()].filter((story) => story.month === month.month);
    const assigned = assignDays(deduplicated, repositoryStories, month);
    for (const [day, story] of assigned.byDay) {
      extractedById.set(storyId(month.month, day), {
        ...story,
        paragraphs: cleanBlogStory(story)
      });
    }
    for (const [id, confirmedTitle] of CONFIRMED_TITLES) {
      if (!id.startsWith(`${String(month.month).padStart(2, '0')}-`)) continue;
      const story = selectConfirmedTitleStory(deduplicated, confirmedTitle);
      extractedById.set(id, { ...story, paragraphs: cleanBlogStory(story) });
    }
    monthDiagnostics.push({
      month: month.month,
      segmented: segmented.length,
      deduplicated: deduplicated.length,
      expected: month.days,
      explicitDateAnchors: assigned.anchors.filter(({ source }) => source.startsWith('pdf-date')).length,
      titleAnchors: assigned.anchors.filter(({ source }) => source === 'repository-title').length,
      textAnchors: assigned.anchors.filter(({ source }) => source === 'repository-text').length,
      sequenceAssignments: assigned.anchors.filter(({ source }) => source === 'anchored-sequence').length,
      explicitDateConflicts: assigned.explicitDateConflicts
    });
  }

  const comparisons = [];
  for (const [id, repositoryStory] of [...repositoryById].sort()) {
    if (lostIds.has(id)) continue;
    const extracted = extractedById.get(id);
    const similarity = extracted
      ? tokenSimilarity(extracted.paragraphs.join(' '), storyText(repositoryStory))
      : 0;
    comparisons.push({
      id,
      similarity,
      highSimilarity: similarity >= HIGH_SIMILARITY_THRESHOLD,
      pdfTitle: extracted ? toPortugueseTitleCase(extracted.titleRaw) : null,
      repositoryTitle: repositoryStory.title
    });
  }
  const highSimilarity = comparisons.filter((comparison) => comparison.highSimilarity).length;
  const rate = comparisons.length ? highSimilarity / comparisons.length : 0;
  const crossValidation = {
    comparableDays: comparisons.length,
    highSimilarityDays: highSimilarity,
    threshold: HIGH_SIMILARITY_THRESHOLD,
    rate,
    passed: rate >= CROSS_VALIDATION_GATE,
    examples: [...comparisons]
      .sort((left, right) => left.similarity - right.similarity || left.id.localeCompare(right.id))
      .slice(0, 3)
  };

  if (!crossValidation.passed) {
    return {
      gatePassed: false,
      crossValidation,
      recovered: 0,
      notRecovered: [],
      monthDiagnostics
    };
  }

  const pendingWrites = [];
  const recovered = [];
  const notRecovered = [];
  for (const id of [...lostIds].sort()) {
    const story = repositoryById.get(id);
    const extracted = extractedById.get(id);
    if (!extracted) {
      notRecovered.push({ id, reason: 'missing-from-pdf' });
      continue;
    }
    const validation = validateBlogParagraphs(extracted.paragraphs);
    if (!validation.valid) {
      notRecovered.push({
        id,
        reason: 'failed-validation',
        issues: validation.issues.map(({ code, paragraphIndex }) => ({ code, paragraphIndex }))
      });
      continue;
    }
    const updated = recoveredStory(story, extracted, extracted.paragraphs);
    pendingWrites.push([
      path.join(storiesDir, `${id}.json`),
      `${JSON.stringify(updated, null, 2)}\n`
    ]);
    recovered.push({ id, title: updated.title, paragraphs: extracted.paragraphs.length });
  }

  for (const [storyPath, contents] of pendingWrites) await writeFile(storyPath, contents);
  return {
    gatePassed: true,
    crossValidation,
    recovered: recovered.length,
    recoveredStories: recovered,
    notRecovered,
    monthDiagnostics
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await extractBlogCompilation();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.gatePassed) process.exitCode = 1;
}
