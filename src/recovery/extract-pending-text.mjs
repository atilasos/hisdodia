#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseStoryPage } from './parse-story-page.mjs';

const execFileAsync = promisify(execFile);
const INVENTORY_PATH = 'tmp/text-recovery-inventory.json';
const STORIES_DIR = 'data/stories';
const LOST_TEXT = 'O texto original desta história perdeu-se. Não foi possível recuperá-lo do arquivo da Internet. Talvez exista nas edições em livro das histórias de António Torrado.';
const PDF_NOTE = 'Texto extraído automaticamente do PDF original arquivado; cabeçalhos, rodapés, hifenização e quebras de linha foram normalizados.';
const HTML_NOTE = 'Texto narrativo extraído automaticamente da página HTML original arquivada.';
const LOST_NOTE = 'O texto original não está disponível nas fontes locais recuperadas e foi assinalado como perdido.';
const INVALID_PDF_NOTE = 'A referência de impressão arquivada é uma página anti-bot em HTML, não o PDF original, pelo que foi anulada.';
const DROP_CAP_WORDS = new Map([
  ['A ndava', 'Andava'],
  ['A s', 'As'],
  ['E ra', 'Era'],
  ['I lda', 'Ilda'],
  ['N o', 'No']
]);
const CLITIC_PATTERN = /^(?:me|te|se|lhe|lhes|nos|vos|o|a|os|as)(?:\b|-)/iu;
const PDF_DEBRIS_PATTERN = /^(?:\d+|p[áa]gina\s+\d+|©.*|.*\bAPENA\s*-\s*APDD\b.*|cofinanciado\b.*)$/iu;
const VALID_START_PATTERN = /^(?:["“«']\s*)?(?:[A-ZÁÀÂÃÉÊÍÓÔÕÚÜÇ]|[-–—])/u;
const SUPPORTED_ROUTES = new Set(['local-pdf-with-text', 'local-html', 'missing']);

class TextValidationError extends Error {
  constructor(issues) {
    super('Extracted text failed validation');
    this.issues = issues;
  }
}

function letterCount(value) {
  return value.match(/\p{L}/gu)?.length ?? 0;
}

function normalizeComparable(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replaceAll(/\p{M}/gu, '')
    .replaceAll(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLocaleLowerCase('pt-PT');
}

function isFooterLine(line) {
  const trimmed = line.trim();
  return PDF_DEBRIS_PATTERN.test(trimmed)
    || /Presidência do Conselho de Ministros/iu.test(trimmed);
}

function bodyStartIndex(lines, { author, pageNumber = 1 }) {
  if (pageNumber > 1) {
    return lines.findIndex((line) => line.trim() && !isFooterLine(line));
  }

  const authorKey = normalizeComparable(author);
  let lastCredit = -1;

  for (let index = 0; index < Math.min(lines.length, 25); index += 1) {
    const comparable = normalizeComparable(lines[index]);
    if ((authorKey && comparable.includes(authorKey))
      || /^escreveu(?: e)?$/iu.test(lines[index].trim())
      || /\bilustrou\s*$/iu.test(lines[index].trim())) {
      lastCredit = index;
    }
  }

  for (let index = lastCredit + 1; index < lines.length; index += 1) {
    if (/^ {1,8}\S/u.test(lines[index]) && letterCount(lines[index]) >= 5 && !isFooterLine(lines[index])) {
      return index;
    }
  }

  return lines.findIndex((line) => line.trim() && !isFooterLine(line));
}

function fixDropCap(value) {
  let result = value;
  for (const [split, joined] of DROP_CAP_WORDS) {
    result = result.replace(new RegExp(`^([–—-]?\\s*)${split}\\b`, 'u'), `$1${joined}`);
  }
  return result.replace(/^([–—-])\s*(I)\s+lda\b/u, '$1Ilda');
}

function joinWrappedLine(current, next) {
  if (!current.endsWith('-')) {
    return `${current} ${next}`;
  }

  if (next.startsWith('-')) {
    return `${current}${next.slice(1)}`;
  }

  if (CLITIC_PATTERN.test(next)) {
    return `${current}${next}`;
  }

  return `${current.slice(0, -1)}${next}`;
}

export function cleanPdfPage(pageText, { title, author, pageNumber = 1 } = {}) {
  const rawLines = String(pageText ?? '')
    .replaceAll('\r', '')
    .replaceAll('\f', '\n')
    .split('\n')
    .map((line) => line.replaceAll('\t', '    ').trimEnd());
  const firstFooter = rawLines.findIndex(isFooterLine);
  const boundedLines = firstFooter >= 0 ? rawLines.slice(0, firstFooter) : rawLines;

  while (boundedLines.length && (!boundedLines.at(-1).trim() || /^\s*\d+\s*$/u.test(boundedLines.at(-1)))) {
    boundedLines.pop();
  }

  const start = bodyStartIndex(boundedLines, { author, pageNumber });
  if (start < 0) {
    return [];
  }

  const titleKey = normalizeComparable(title);
  const paragraphs = [];
  let current = '';

  const flush = () => {
    const paragraph = fixDropCap(current.replaceAll(/\s+/gu, ' ').trim());
    if (paragraph && normalizeComparable(paragraph) !== titleKey) {
      paragraphs.push(paragraph);
    }
    current = '';
  };

  for (const line of boundedLines.slice(start)) {
    const trimmed = line.trim();
    if (!trimmed || isFooterLine(line) || /^\d+$/u.test(trimmed)) {
      continue;
    }

    const startsParagraph = /^ {1,8}\S/u.test(line) || /^FIM[.!]?$/u.test(trimmed);
    if (startsParagraph && current) {
      flush();
    }
    current = current ? joinWrappedLine(current, trimmed) : trimmed;
  }
  flush();

  return paragraphs;
}

export function stitchPdfPageSegments(segments) {
  const stitched = segments.map((segment) => ({
    ...segment,
    paragraphs: [...segment.paragraphs]
  }));

  for (let index = 1; index < stitched.length; index += 1) {
    const previous = stitched[index - 1];
    const current = stitched[index];
    const previousParagraph = previous.paragraphs.at(-1);
    const currentParagraph = current.paragraphs[0];
    if (!previousParagraph || !currentParagraph) {
      continue;
    }

    const previousIsComplete = /[.!?…:]["»”')\]]?$/u.test(previousParagraph);
    if (!VALID_START_PATTERN.test(currentParagraph) || !previousIsComplete) {
      previous.paragraphs[previous.paragraphs.length - 1] = joinWrappedLine(previousParagraph, currentParagraph);
      current.paragraphs.shift();
    }
  }

  return stitched.filter((segment) => segment.paragraphs.length > 0);
}

function issue(code, paragraphIndex, paragraph) {
  return { code, paragraphIndex, paragraph };
}

export function validateParagraphs(paragraphs) {
  const issues = [];

  for (const [paragraphIndex, rawParagraph] of (paragraphs ?? []).entries()) {
    const paragraph = String(rawParagraph ?? '').trim();
    if (!paragraph) {
      issues.push(issue('empty-paragraph', paragraphIndex, paragraph));
    } else if (PDF_DEBRIS_PATTERN.test(paragraph)) {
      issues.push(issue('pdf-debris', paragraphIndex, paragraph));
    } else if (/\b(?:https?:\/\/|www\.)\S+/iu.test(paragraph)) {
      issues.push(issue('url', paragraphIndex, paragraph));
    } else if (letterCount(paragraph) === 0 && !/\p{N}/u.test(paragraph) && /[\p{P}\p{S}]{3,}/u.test(paragraph)) {
      issues.push(issue('punctuation-noise', paragraphIndex, paragraph));
    } else if (/[ÃÂ][\u0080-\u00bf]|Ãƒ|â€/u.test(paragraph)) {
      issues.push(issue('mojibake', paragraphIndex, paragraph));
    } else if (!VALID_START_PATTERN.test(paragraph)) {
      issues.push(issue('invalid-start', paragraphIndex, paragraph));
    } else {
      const visibleCharacters = paragraph.replaceAll(/\s/gu, '').length;
      if (letterCount(paragraph) >= 4 && visibleCharacters && letterCount(paragraph) / visibleCharacters < 0.55) {
        issues.push(issue('low-alphabetic-ratio', paragraphIndex, paragraph));
      }
    }
  }

  if (!paragraphs?.length) {
    issues.push(issue('no-paragraphs', -1, ''));
  }

  return { valid: issues.length === 0, issues };
}

function appendUnique(items, value) {
  const result = [...(items ?? [])];
  if (!result.includes(value)) {
    result.push(value);
  }
  return result;
}

function appendProvenanceNote(notes, sentence) {
  const normalized = String(notes ?? '').trim();
  if (normalized.includes(sentence)) {
    return normalized;
  }
  return `${normalized}${normalized ? ' ' : ''}${sentence}`;
}

function withoutGeneratedAnnotations(story) {
  const generatedProvenance = /\s*(?:O texto foi recuperado do PDF original arquivado através da sua camada de texto\.|O texto narrativo foi recuperado da página HTML original arquivada\.|Não foi encontrada uma fonte local com o texto original recuperável\.|A fonte local indicada não produziu texto narrativo validado:)[\s\S]*$/u;
  return {
    ...story,
    provenance: {
      ...story.provenance,
      notes: String(story.provenance?.notes ?? '').replace(generatedProvenance, '').trim()
    },
    editorialNotes: (story.editorialNotes ?? []).filter((note) => note !== PDF_NOTE
      && note !== HTML_NOTE
      && note !== LOST_NOTE
      && note !== INVALID_PDF_NOTE
      && !note.startsWith('A fonte local indicada falhou a validação automática'))
  };
}

function updateExtractedStory(story, { route, textSegments }) {
  const baseStory = withoutGeneratedAnnotations(story);
  const pdf = route === 'local-pdf-with-text';
  const provenanceSentence = pdf
    ? 'O texto foi recuperado do PDF original arquivado através da sua camada de texto.'
    : 'O texto narrativo foi recuperado da página HTML original arquivada.';

  return {
    ...baseStory,
    textSegments,
    recovery: {
      ...baseStory.recovery,
      text: pdf ? 'pdf-extracted' : 'html-extracted',
      ...(pdf ? { pdf: 'archive-original' } : {}),
      completeness: pdf ? 'complete-pdf-text' : 'html-text'
    },
    provenance: {
      ...baseStory.provenance,
      notes: appendProvenanceNote(baseStory.provenance?.notes, provenanceSentence)
    },
    editorialNotes: appendUnique(baseStory.editorialNotes, pdf ? PDF_NOTE : HTML_NOTE)
  };
}

function lostReasonNote(reason) {
  return reason
    ? `A fonte local indicada falhou a validação automática e o texto foi assinalado como perdido: ${reason}`
    : LOST_NOTE;
}

function markTextLost(story, reason = null) {
  const baseStory = withoutGeneratedAnnotations(story);
  let result = {
    ...baseStory,
    textSegments: [{ layer: 'archive-missing', paragraphs: [LOST_TEXT] }],
    recovery: {
      ...baseStory.recovery,
      text: 'text-lost',
      completeness: 'text-lost'
    },
    provenance: {
      ...baseStory.provenance,
      notes: appendProvenanceNote(
        baseStory.provenance?.notes,
        reason
          ? `A fonte local indicada não produziu texto narrativo validado: ${reason}`
          : 'Não foi encontrada uma fonte local com o texto original recuperável.'
      )
    },
    editorialNotes: appendUnique(baseStory.editorialNotes, lostReasonNote(reason))
  };

  if (story.id === '04-18') {
    result = {
      ...result,
      assets: {
        ...result.assets,
        printPdf: null,
        ...(Object.hasOwn(result.assets ?? {}, 'archivePrintPdf') ? { archivePrintPdf: null } : {})
      },
      recovery: { ...result.recovery, pdf: 'missing' },
      provenance: { ...result.provenance, printPdf: null },
      editorialNotes: appendUnique(result.editorialNotes, INVALID_PDF_NOTE)
    };
  }

  return result;
}

async function extractPdfSegments(item, story) {
  const { stdout } = await execFileAsync('pdftotext', [
    '-layout',
    '-enc', 'UTF-8',
    item.evidence,
    '-'
  ], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  const pages = stdout.split('\f');
  if (!pages.at(-1)?.trim()) {
    pages.pop();
  }

  const segments = pages
    .map((page, index) => ({
      layer: `pdf-page-${index + 1}`,
      paragraphs: cleanPdfPage(page, { ...story, pageNumber: index + 1 })
    }))
    .filter((segment) => segment.paragraphs.length > 0);
  return stitchPdfPageSegments(segments);
}

async function extractHtmlSegments(item, story) {
  const html = await readFile(item.evidence, 'latin1');
  const parsed = parseStoryPage(html, {
    id: story.id,
    month: story.month,
    day: story.day,
    sourceUrl: item.evidence
  });
  const paragraphs = parsed.textSegments.flatMap((segment) => segment.paragraphs);
  return [{ layer: 'archive-html', paragraphs }];
}

function validateSegments(segments, story) {
  const issues = [];
  if (!segments.length) {
    issues.push(issue('no-segments', -1, ''));
  }
  for (const segment of segments) {
    const result = validateParagraphs(segment.paragraphs);
    issues.push(...result.issues.map((entry) => ({ ...entry, layer: segment.layer })));
  }

  const titleKey = normalizeComparable(story.title);
  for (const segment of segments) {
    for (const [paragraphIndex, paragraph] of segment.paragraphs.entries()) {
      if (normalizeComparable(paragraph) === titleKey) {
        issues.push(issue('duplicated-title', paragraphIndex, paragraph));
      }
    }
  }
  return { valid: issues.length === 0, issues };
}

function conciseFailure(error) {
  if (error?.issues?.length) {
    return error.issues
      .slice(0, 3)
      .map(({ layer, code, paragraphIndex }) => `${layer}:${paragraphIndex + 1}:${code}`)
      .join(', ');
  }
  return String(error?.stderr || error?.message || error).replaceAll(/\s+/gu, ' ').trim().slice(0, 240);
}

function isContentExtractionFailure(error, route) {
  return error instanceof TextValidationError
    || (route === 'local-pdf-with-text' && typeof error?.code === 'number');
}

async function preflight(entries, storiesDir) {
  let needsPdfText = false;
  for (const item of entries) {
    if (!SUPPORTED_ROUTES.has(item.route)) {
      throw new Error(`Unsupported route for ${item.id}: ${item.route}`);
    }

    try {
      await access(path.join(storiesDir, `${item.id}.json`));
    } catch (error) {
      throw new Error(`Story file unavailable for ${item.id}`, { cause: error });
    }

    if (item.route !== 'missing') {
      try {
        await access(item.evidence);
      } catch (error) {
        throw new Error(`Source unavailable for ${item.id}: ${item.evidence}`, { cause: error });
      }
    }
    needsPdfText ||= item.route === 'local-pdf-with-text';
  }

  if (needsPdfText) {
    try {
      await execFileAsync('pdftotext', ['-v'], { encoding: 'utf8' });
    } catch (error) {
      throw new Error('pdftotext is unavailable', { cause: error });
    }
  }
}

export async function extractPendingText(options = {}) {
  const inventoryPath = options.inventoryPath ?? INVENTORY_PATH;
  const storiesDir = options.storiesDir ?? STORIES_DIR;
  const inventory = JSON.parse(await readFile(inventoryPath, 'utf8'));
  const entries = [...inventory.stories].sort((left, right) => left.id.localeCompare(right.id));
  await preflight(entries, storiesDir);
  const summary = {
    processed: 0,
    pdfExtracted: 0,
    htmlExtracted: 0,
    textLostOriginal: 0,
    textLostValidation: 0,
    failures: []
  };
  const pendingWrites = [];

  for (const item of entries) {
    const storyPath = path.join(storiesDir, `${item.id}.json`);
    const story = JSON.parse(await readFile(storyPath, 'utf8'));
    let updated;

    if (item.route === 'missing') {
      updated = markTextLost(story);
      summary.textLostOriginal += 1;
    } else {
      try {
        const textSegments = item.route === 'local-pdf-with-text'
          ? await extractPdfSegments(item, story)
          : await extractHtmlSegments(item, story);
        const validation = validateSegments(textSegments, story);
        if (!validation.valid) {
          throw new TextValidationError(validation.issues);
        }
        updated = updateExtractedStory(story, { route: item.route, textSegments });
        if (item.route === 'local-pdf-with-text') {
          summary.pdfExtracted += 1;
        } else {
          summary.htmlExtracted += 1;
        }
      } catch (error) {
        if (!isContentExtractionFailure(error, item.route)) {
          throw error;
        }
        const reason = conciseFailure(error);
        updated = markTextLost(story, reason);
        summary.textLostValidation += 1;
        summary.failures.push({ id: item.id, route: item.route, reason });
      }
    }

    pendingWrites.push([storyPath, `${JSON.stringify(updated, null, 2)}\n`]);
    summary.processed += 1;
  }

  for (const [storyPath, contents] of pendingWrites) {
    await writeFile(storyPath, contents);
  }

  return summary;
}

export async function validateRecoveredStories(options = {}) {
  const inventoryPath = options.inventoryPath ?? INVENTORY_PATH;
  const storiesDir = options.storiesDir ?? STORIES_DIR;
  const inventory = JSON.parse(await readFile(inventoryPath, 'utf8'));
  const issues = [];
  const counts = { pdfExtracted: 0, htmlExtracted: 0, textLost: 0 };

  for (const item of [...inventory.stories].sort((left, right) => left.id.localeCompare(right.id))) {
    const story = JSON.parse(await readFile(path.join(storiesDir, `${item.id}.json`), 'utf8'));
    if (story.recovery?.completeness === 'text-lost') {
      counts.textLost += 1;
      if (story.textSegments?.length !== 1
        || story.textSegments[0]?.layer !== 'archive-missing'
        || story.textSegments[0]?.paragraphs?.[0] !== LOST_TEXT) {
        issues.push({ id: item.id, code: 'invalid-lost-placeholder' });
      }
      continue;
    }

    const expectedCompleteness = item.route === 'local-pdf-with-text' ? 'complete-pdf-text' : 'html-text';
    const expectedText = item.route === 'local-pdf-with-text' ? 'pdf-extracted' : 'html-extracted';
    if (story.recovery?.completeness !== expectedCompleteness || story.recovery?.text !== expectedText) {
      issues.push({ id: item.id, code: 'invalid-recovery-state' });
      continue;
    }

    const validation = validateSegments(story.textSegments ?? [], story);
    if (!validation.valid) {
      issues.push({ id: item.id, code: 'invalid-text', details: validation.issues });
    }
    if (item.route === 'local-pdf-with-text') counts.pdfExtracted += 1;
    if (item.route === 'local-html') counts.htmlExtracted += 1;
  }

  const story0418 = JSON.parse(await readFile(path.join(storiesDir, '04-18.json'), 'utf8'));
  if (story0418.assets?.printPdf || story0418.assets?.archivePrintPdf || story0418.provenance?.printPdf) {
    issues.push({ id: '04-18', code: 'invalid-antibot-pdf-reference' });
  }

  return {
    processed: inventory.stories.length,
    ...counts,
    valid: issues.length === 0,
    issues
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const validateOnly = process.argv.includes('--validate-only');
  const result = validateOnly ? await validateRecoveredStories() : await extractPendingText();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (validateOnly && !result.valid) {
    process.exitCode = 1;
  }
}
