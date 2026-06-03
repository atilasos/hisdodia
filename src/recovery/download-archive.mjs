import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDayInventory, formatStoryId } from './calendar.mjs';
import { fetchCdx } from './cdx.mjs';

const DEFAULT_ARCHIVE_ROOT = 'archive';
const REPLAY_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 20000;
const CDX_RETRIES = 4;
const GLOBAL_PREFIXES = [
  'www.historiadodia.pt/pt/historias/',
  'www.historiadodia.pt/pt/Historias/',
  'sons.historiadodia.pt/'
];

export function archiveDayDir({ month, day }, root = DEFAULT_ARCHIVE_ROOT) {
  const [monthPart, dayPart] = formatStoryId(month, day).split('-');
  return path.join(root, '0000', monthPart, dayPart);
}

export function dayPrefixes({ month, day }) {
  const [monthPart, dayPart] = formatStoryId(month, day).split('-');
  return [
    `www.historiadodia.pt/pt/historias/${monthPart}/${dayPart}/`,
    `www.historiadodia.pt/pt/Historias/${monthPart}/${dayPart}/`,
    `sons.historiadodia.pt/${monthPart}/${dayPart}/`
  ];
}

export function captureDayId(capture) {
  const original = capture.original ?? '';
  let url;
  try {
    url = new URL(original);
  } catch {
    return null;
  }

  const pathname = safeDecode(url.pathname);
  const storyMatch = /\/pt\/historias\/(\d{2})\/(\d{2})\//i.exec(pathname);
  if (storyMatch) {
    return `${storyMatch[1]}-${storyMatch[2]}`;
  }

  if (url.hostname.toLowerCase() === 'sons.historiadodia.pt') {
    const audioMatch = /^\/(\d{2})\/(\d{2})\//.exec(pathname);
    if (audioMatch) {
      return `${audioMatch[1]}-${audioMatch[2]}`;
    }
  }

  return null;
}

export function classifyCapture(capture) {
  const original = capture.original ?? '';
  const mimetype = capture.mimetype ?? '';
  const lowerOriginal = original.toLowerCase();
  const lowerMime = mimetype.toLowerCase();

  if (lowerOriginal.includes('sons.historiadodia.pt') || lowerOriginal.endsWith('.swf')) {
    return 'audio';
  }
  if (lowerMime.includes('pdf') || lowerOriginal.endsWith('.pdf')) {
    return 'pdf';
  }
  if (lowerMime.startsWith('image/') || /\.(gif|jpe?g|png|webp)$/i.test(original)) {
    return 'images';
  }
  if (lowerMime.includes('html') || /\.(aspx|html?|xhtml)$/i.test(original)) {
    return 'html';
  }
  return 'other';
}

export function selectUniqueCaptures(captures) {
  const selected = new Map();
  for (const capture of captures) {
    if (capture.statuscode && capture.statuscode !== '200') {
      continue;
    }
    const key = `${normalizeOriginal(capture.original)}\n${capture.digest ?? ''}`;
    const previous = selected.get(key);
    if (!previous || String(capture.timestamp) > String(previous.timestamp)) {
      selected.set(key, capture);
    }
  }

  return [...selected.values()].sort((left, right) => {
    const leftOriginal = normalizeOriginal(left.original);
    const rightOriginal = normalizeOriginal(right.original);
    if (leftOriginal !== rightOriginal) {
      return leftOriginal.localeCompare(rightOriginal);
    }
    return String(left.timestamp).localeCompare(String(right.timestamp));
  });
}

export function archiveCapturePath(day, capture, root = DEFAULT_ARCHIVE_ROOT) {
  const digest = safePathPart(capture.digest || capture.timestamp || 'unknown').toLowerCase();
  const relative = relativeOriginalPath(day, capture.original);
  return path.join(archiveDayDir(day, root), classifyCapture(capture), digest, relative);
}

export async function recoverArchiveDay(day, options = {}) {
  const root = options.root ?? DEFAULT_ARCHIVE_ROOT;
  const prefixes = dayPrefixes(day);
  const cdxErrors = [];
  const captures = [];

  for (const prefix of prefixes) {
    try {
      captures.push(...await fetchCdxWithRetry(prefix, {
        matchType: 'prefix',
        collapse: false,
        timeoutMs: REQUEST_TIMEOUT_MS
      }));
    } catch (error) {
      cdxErrors.push({ prefix, error: error.message });
    }
  }

  if (captures.length === 0 && cdxErrors.length === prefixes.length) {
    throw new Error(`all CDX requests failed for ${formatStoryId(day.month, day.day)}`);
  }

  const selected = selectUniqueCaptures(captures);
  const downloads = [];

  for (const capture of selected) {
    downloads.push(await downloadCapture(day, capture, { root }));
  }

  const manifest = {
    day: formatStoryId(day.month, day.day),
    prefixes,
    capturedAt: new Date().toISOString(),
    cdx: {
      captures: captures.length,
      selected: selected.length,
      errors: cdxErrors
    },
    downloads
  };

  const dayDir = archiveDayDir(day, root);
  await mkdir(dayDir, { recursive: true });
  await writeFile(path.join(dayDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export async function recoverArchiveDayFromCaptures(day, captures, options = {}) {
  const root = options.root ?? DEFAULT_ARCHIVE_ROOT;
  const selected = selectUniqueCaptures(captures);
  const downloads = [];

  for (const capture of selected) {
    downloads.push(await downloadCapture(day, capture, { root }));
  }

  const manifest = {
    day: formatStoryId(day.month, day.day),
    prefixes: dayPrefixes(day),
    capturedAt: new Date().toISOString(),
    cdx: {
      captures: captures.length,
      selected: selected.length,
      errors: []
    },
    downloads
  };

  const dayDir = archiveDayDir(day, root);
  await mkdir(dayDir, { recursive: true });
  await writeFile(path.join(dayDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export async function recoverArchiveBatch(options = {}) {
  const root = options.root ?? DEFAULT_ARCHIVE_ROOT;
  const allDays = options.days ?? buildDayInventory();
  const limit = options.limit ?? allDays.length;
  const concurrency = Math.max(1, Number(options.concurrency ?? 4));
  const days = allDays.slice(0, limit);
  const reports = new Array(days.length);
  const globalCapturesByDay = options.globalIndex === false
    ? null
    : await fetchGlobalCapturesByDay();
  let nextIndex = 0;
  let completed = 0;

  await mkdir(path.join(root, '0000'), { recursive: true });

  async function runNext() {
    while (nextIndex < days.length) {
      const index = nextIndex;
      nextIndex += 1;
      const day = days[index];
      const captures = globalCapturesByDay?.get(formatStoryId(day.month, day.day));
      const report = globalCapturesByDay
        ? await recoverArchiveDayFromCapturesSafely(day, captures ?? [], { root })
        : await recoverArchiveDaySafely(day, { root });
      reports[index] = report;
      completed += 1;
      if (options.progress) {
        const downloaded = report.downloads?.filter((download) => download.status === 'downloaded').length ?? 0;
        const skipped = report.downloads?.filter((download) => download.status === 'skipped-existing').length ?? 0;
        const errors = report.error ? 1 : report.cdx?.errors.length ?? 0;
        process.stderr.write(`[${completed}/${days.length}] ${report.day} downloaded=${downloaded} skipped=${skipped} errors=${errors}\n`);
      }
      if (options.delayMs) {
        await sleep(options.delayMs);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, days.length) }, () => runNext())
  );

  const summary = summarizeReports(reports);
  const manifest = { capturedAt: new Date().toISOString(), summary, reports };
  await writeFile(path.join(root, '0000', 'download-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

async function recoverArchiveDaySafely(day, options) {
  try {
    return await recoverArchiveDay(day, options);
  } catch (error) {
    return {
      day: formatStoryId(day.month, day.day),
      capturedAt: new Date().toISOString(),
      error: error.message
    };
  }
}

async function recoverArchiveDayFromCapturesSafely(day, captures, options) {
  try {
    return await recoverArchiveDayFromCaptures(day, captures, options);
  } catch (error) {
    return {
      day: formatStoryId(day.month, day.day),
      capturedAt: new Date().toISOString(),
      error: error.message
    };
  }
}

async function fetchGlobalCapturesByDay() {
  const capturesByDay = new Map();
  for (const prefix of GLOBAL_PREFIXES) {
    const captures = await fetchCdxWithRetry(prefix, {
      matchType: 'prefix',
      collapse: false,
      timeoutMs: REQUEST_TIMEOUT_MS * 3
    });
    for (const capture of captures) {
      const dayId = captureDayId(capture);
      if (!dayId) {
        continue;
      }
      if (!capturesByDay.has(dayId)) {
        capturesByDay.set(dayId, []);
      }
      capturesByDay.get(dayId).push(capture);
    }
  }
  return capturesByDay;
}

async function fetchCdxWithRetry(prefix, options) {
  let lastError;
  for (let attempt = 1; attempt <= CDX_RETRIES; attempt += 1) {
    try {
      return await fetchCdx(prefix, options);
    } catch (error) {
      lastError = error;
      await sleep(500 * attempt * attempt);
    }
  }
  throw lastError;
}

async function downloadCapture(day, capture, { root }) {
  const outputPath = archiveCapturePath(day, capture, root);
  const relativePath = path.relative(root, outputPath);
  const existing = await fileExists(outputPath);
  if (existing) {
    return downloadRecord(capture, relativePath, 'skipped-existing');
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  const replayUrl = `https://web.archive.org/web/${capture.timestamp}id_/${capture.original}`;
  const buffer = await fetchBufferWithRetry(replayUrl);
  await writeFile(outputPath, buffer);
  return downloadRecord(capture, relativePath, 'downloaded', buffer.byteLength);
}

function downloadRecord(capture, relativePath, status, bytes) {
  return {
    status,
    path: relativePath,
    original: capture.original,
    timestamp: capture.timestamp,
    digest: capture.digest,
    mimetype: capture.mimetype,
    bytes: bytes ?? Number(capture.length || 0)
  };
}

async function fetchBufferWithRetry(url) {
  let lastError;
  for (let attempt = 1; attempt <= REPLAY_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`replay request failed with ${response.status}`);
      }
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error.name === 'AbortError'
        ? new Error(`replay request timed out after ${REQUEST_TIMEOUT_MS}ms`)
        : error;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error(`${lastError.message} for ${url}`);
}

async function fileExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

function summarizeReports(reports) {
  return reports.reduce((summary, report) => {
    summary.days += 1;
    if (report.error) {
      summary.errors += 1;
      return summary;
    }
    summary.cdxCaptures += report.cdx.captures;
    summary.selectedCaptures += report.cdx.selected;
    summary.downloaded += report.downloads.filter((download) => download.status === 'downloaded').length;
    summary.skippedExisting += report.downloads.filter((download) => download.status === 'skipped-existing').length;
    summary.cdxErrors += report.cdx.errors.length;
    return summary;
  }, {
    days: 0,
    errors: 0,
    cdxCaptures: 0,
    selectedCaptures: 0,
    downloaded: 0,
    skippedExisting: 0,
    cdxErrors: 0
  });
}

function normalizeOriginal(original = '') {
  try {
    const url = new URL(original);
    url.hash = '';
    return url.toString();
  } catch {
    return original;
  }
}

function relativeOriginalPath(day, original = '') {
  const fallback = safePathPart(path.basename(original) || 'index');
  let pathname;
  try {
    pathname = safeDecode(new URL(original).pathname);
  } catch {
    pathname = original;
  }

  const [monthPart, dayPart] = formatStoryId(day.month, day.day).split('-');
  const marker = `/${monthPart}/${dayPart}/`;
  const markerIndex = pathname.toLowerCase().indexOf(marker);
  const relative = markerIndex >= 0 ? pathname.slice(markerIndex + marker.length) : path.basename(pathname);
  const cleanRelative = relative.replace(/^\/+/, '') || fallback;
  return cleanRelative
    .split('/')
    .filter(Boolean)
    .map((part) => safePathPart(part))
    .join('/');
}

function safePathPart(part) {
  return String(part)
    .replace(/\0/g, '')
    .replace(/[<>:"\\|?*]/g, '_')
    .replace(/^\.+$/, '_');
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseDay(value) {
  const match = /^(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new Error(`Expected --day MM-DD, got ${value}`);
  }
  return { month: Number(match[1]), day: Number(match[2]), id: value };
}

function parseCli(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--all') {
      options.all = true;
    } else if (argument === '--day') {
      options.day = parseDay(argv[++index]);
    } else if (argument === '--limit') {
      options.limit = Number(argv[++index]);
    } else if (argument === '--concurrency') {
      options.concurrency = Number(argv[++index]);
    } else if (argument === '--delay-ms') {
      options.delayMs = Number(argv[++index]);
    } else if (argument === '--root') {
      options.root = argv[++index];
    } else if (argument === '--per-day-cdx') {
      options.globalIndex = false;
    }
  }
  return options;
}

async function main(argv) {
  const options = parseCli(argv);
  const days = options.day ? [options.day] : buildDayInventory();
  const manifest = await recoverArchiveBatch({
    days,
    concurrency: options.concurrency,
    delayMs: options.delayMs,
    globalIndex: options.globalIndex,
    limit: options.limit,
    progress: true,
    root: options.root
  });
  process.stdout.write(`${JSON.stringify(manifest.summary, null, 2)}\n`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] === currentFile) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
