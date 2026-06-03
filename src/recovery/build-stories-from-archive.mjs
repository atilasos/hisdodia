import { cp, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDayInventory, formatStoryId } from './calendar.mjs';
import { parseStoryPage } from './parse-story-page.mjs';

const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro'
];

const ARCHIVE_ROOT = 'archive/0000';
const STORIES_DIR = 'data/stories';
const PUBLIC_ASSETS_DIR = 'src/site/public/assets';

export function dateLabel({ month, day }) {
  return `${day} de ${MONTH_NAMES[month - 1]}`;
}

export function publicRecoveredPath(filePath) {
  if (!filePath) {
    return null;
  }
  const normalized = filePath.split(path.sep).join('/');
  const marker = 'archive/0000/';
  const index = normalized.indexOf(marker);
  if (index < 0) {
    return null;
  }
  return `/recovered/0000/${normalized.slice(index + marker.length)}`;
}

export function selectBestHtmlCapture(captures) {
  return captures
    .filter((capture) => capture.story?.title)
    .sort((left, right) => {
      const rightText = textLength(right.story);
      const leftText = textLength(left.story);
      if (rightText !== leftText) {
        return rightText - leftText;
      }
      return right.filePath.localeCompare(left.filePath);
    })[0] ?? null;
}

export function selectPreferredAsset(files, kind) {
  const lowerKind = kind.toLowerCase();
  const scored = files.map((filePath) => {
    const normalized = filePath.split(path.sep).join('/');
    const lower = normalized.toLowerCase();
    let score = 0;

    if (lower.includes('/imagens/')) {
      score += 30;
    }
    if (lower.includes('/propostas/')) {
      score -= 10;
    }
    if (lowerKind === 'background' && /\/background\.(jpe?g|png|gif)$/i.test(normalized)) {
      score += 100;
    }
    if (lowerKind === 'icon' && /\/icone\.(jpe?g|png|gif)$/i.test(normalized)) {
      score += 100;
    }
    if (lowerKind === 'illustration' && /\.(jpe?g|png|gif)$/i.test(normalized)) {
      score += 10;
    }

    return { filePath, score };
  });

  return scored
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || right.filePath.localeCompare(left.filePath))[0]?.filePath ?? null;
}

export async function buildStoryFromArchiveDay(day, options = {}) {
  const id = formatStoryId(day.month, day.day);
  const dayDir = path.join(options.archiveRoot ?? ARCHIVE_ROOT, id.slice(0, 2), id.slice(3, 5));
  const files = await listFiles(dayDir);
  const htmlFiles = files.filter((filePath) => /\/html\/.*\.aspx$/i.test(toSlash(filePath)));
  const imageFiles = files.filter((filePath) => /\.(gif|jpe?g|png|webp)$/i.test(filePath));
  const pdfFiles = files.filter((filePath) => /\/pdf\/.*\.pdf$/i.test(toSlash(filePath)));
  const audioFiles = files.filter((filePath) => /\/audio\/.*\.swf$/i.test(toSlash(filePath)));

  const htmlCaptures = await Promise.all(
    htmlFiles.map(async (filePath) => {
      const html = await readFile(filePath, 'latin1');
      return {
        filePath,
        story: parseStoryPage(html, {
          id,
          month: day.month,
          day: day.day,
          sourceUrl: publicRecoveredPath(filePath)
        })
      };
    })
  );

  const bestHtml = selectBestHtmlCapture(htmlCaptures);
  const parsed = bestHtml?.story;
  const background = selectPreferredAsset(imageFiles, 'background');
  const icon = selectPreferredAsset(imageFiles, 'icon');
  const fallbackIllustration = selectPreferredAsset(imageFiles, 'illustration');
  const printPdf = selectLatestByPath(pdfFiles, 'imprimir.pdf') ?? pdfFiles.sort()[0] ?? null;
  const originalAudioSwf = audioFiles.sort()[0] ?? parsed?.assets?.originalAudioSwf ?? null;
  const recoveredAudio = await recoveredMp3Path(id);
  const existing = await readExistingStory(id, options.storiesDir ?? STORIES_DIR);

  if (existing?.recovery?.completeness === 'complete-pdf-text') {
    return mergeExistingCompleteStory(existing, {
      files,
      background,
      icon,
      fallbackIllustration,
      printPdf,
      originalAudioSwf,
      recoveredAudio,
      htmlSource: bestHtml?.filePath
    });
  }

  const textSegments = parsed?.textSegments?.length
    ? parsed.textSegments.map((segment, index) => ({
        layer: `html-layer-${segment.layer ?? index + 1}`,
        paragraphs: segment.paragraphs
      }))
    : [{
        layer: 'archive-placeholder',
        paragraphs: ['Texto original ainda não extraído. Consulta o PDF ou a página arquivada nas ligações de recuperação.']
      }];

  return {
    id,
    month: day.month,
    day: day.day,
    dateLabel: dateLabel(day),
    dayContext: 'História recuperada do arquivo original.',
    title: parsed?.title ?? `História de ${dateLabel(day)}`,
    author: parsed?.author ?? 'António Torrado',
    illustrator: parsed?.illustrator ?? 'Ilustrador original por confirmar',
    textSegments,
    glossary: parsed?.glossary ?? [],
    assets: {
      background: publicRecoveredPath(background ?? fallbackIllustration),
      icon: publicRecoveredPath(icon),
      printPdf: publicRecoveredPath(printPdf),
      originalAudioSwf: publicRecoveredPath(originalAudioSwf),
      recoveredAudio,
      gallery: imageFiles
        .filter((filePath) => filePath !== background && filePath !== icon)
        .map((filePath) => publicRecoveredPath(filePath))
        .filter(Boolean)
    },
    recovery: {
      text: parsed?.textSegments?.length ? 'html-recovered' : 'pending-extraction',
      illustration: imageFiles.length ? 'archive-originals' : 'missing',
      originalAudio: audioFiles.length ? 'archive-swf-reference' : 'missing',
      recoveredAudio: recoveredAudio ? 'recovered-flash-audio' : 'missing',
      pdf: printPdf ? 'archive-original' : 'missing',
      completeness: parsed?.textSegments?.length ? 'html-text' : 'needs-text-extraction'
    },
    provenance: {
      storyPage: publicRecoveredPath(bestHtml?.filePath),
      printPdf: publicRecoveredPath(printPdf),
      archiveDay: `/recovered/0000/${id.slice(0, 2)}/${id.slice(3, 5)}/`,
      notes: parsed?.textSegments?.length
        ? 'Texto extraído das camadas HTML originais recuperadas. Imagens, PDF e áudio Flash são ficheiros locais do arquivo.'
        : 'Dia presente no calendário, mas sem texto HTML extraível no índice recuperado. PDF/assets ficam ligados quando existem.'
    },
    editorialNotes: [
      'A página preserva o texto HTML original quando disponível; a revisão editorial fina continua pendente para muitos dias.',
      'As ilustrações apresentadas são os ficheiros originais recuperados, normalizados para navegação no site moderno.'
    ]
  };
}

export async function buildStoriesFromArchive(options = {}) {
  const storiesDir = options.storiesDir ?? STORIES_DIR;
  const publicAssetsDir = options.publicAssetsDir ?? PUBLIC_ASSETS_DIR;
  await mkdir(storiesDir, { recursive: true });

  const stories = [];
  for (const day of buildDayInventory()) {
    const story = await buildStoryFromArchiveDay(day, options);
    stories.push(story);
    await writeFile(path.join(storiesDir, `${story.id}.json`), `${JSON.stringify(story, null, 2)}\n`);
    await copyRecoveredAudio(story, publicAssetsDir);
  }

  return {
    stories: stories.length,
    withText: stories.filter((story) => story.recovery.text !== 'pending-extraction').length,
    withIllustration: stories.filter((story) => story.assets.background || story.assets.icon).length,
    withPdf: stories.filter((story) => story.assets.printPdf).length,
    withModernAudio: stories.filter((story) => story.assets.recoveredAudio || story.assets.rerecordedAudio).length
  };
}

async function copyRecoveredAudio(story, publicAssetsDir) {
  const source = `data/audio-recovery/${story.id}/${story.id}-recovered.mp3`;
  if (!await exists(source)) {
    return;
  }

  const outDir = path.join(publicAssetsDir, story.id);
  await mkdir(outDir, { recursive: true });
  await cp(source, path.join(outDir, 'narracao-original-recuperada.mp3'));
}

async function recoveredMp3Path(id) {
  const source = `data/audio-recovery/${id}/${id}-recovered.mp3`;
  return await exists(source) ? `/assets/${id}/narracao-original-recuperada.mp3` : null;
}

function mergeExistingCompleteStory(existing, archiveData) {
  return {
    ...existing,
    assets: {
      ...existing.assets,
      archiveBackground: publicRecoveredPath(archiveData.background ?? archiveData.fallbackIllustration),
      archiveIcon: publicRecoveredPath(archiveData.icon),
      archivePrintPdf: publicRecoveredPath(archiveData.printPdf),
      recoveredAudio: archiveData.recoveredAudio,
      gallery: archiveData.files
        .filter((filePath) => /\.(gif|jpe?g|png|webp)$/i.test(filePath))
        .map((filePath) => publicRecoveredPath(filePath))
        .filter(Boolean)
    },
    provenance: {
      ...existing.provenance,
      archiveDay: `/recovered/0000/${existing.id.slice(0, 2)}/${existing.id.slice(3, 5)}/`,
      archiveStoryPage: publicRecoveredPath(archiveData.htmlSource)
    },
    editorialNotes: [
      ...(existing.editorialNotes ?? []),
      'Assets adicionais do arquivo bruto foram ligados ao site moderno.'
    ]
  };
}

async function readExistingStory(id, storiesDir) {
  const filePath = path.join(storiesDir, `${id}.json`);
  if (!await exists(filePath)) {
    return null;
  }
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function textLength(story) {
  return story.textSegments
    .flatMap((segment) => segment.paragraphs)
    .join('\n')
    .length;
}

function selectLatestByPath(files, basename) {
  const matches = files.filter((filePath) => path.basename(filePath).toLowerCase() === basename.toLowerCase());
  return matches
    .sort((left, right) => digestScore(right) - digestScore(left) || right.localeCompare(left))[0] ?? null;
}

function digestScore(filePath) {
  const parts = toSlash(filePath).split('/');
  const digest = parts.at(-2) ?? '';
  return digest.length;
}

async function listFiles(dir) {
  if (!await exists(dir)) {
    return [];
  }

  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(dir, entry.name);
    if (entry.name === '.DS_Store') {
      return [];
    }
    if (entry.isDirectory()) {
      return listFiles(entryPath);
    }
    return [entryPath];
  }));

  return nested.flat().sort();
}

async function exists(filePath) {
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

function toSlash(value) {
  return value.split(path.sep).join('/');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const summary = await buildStoriesFromArchive();
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}
