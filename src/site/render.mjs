import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { illustratedCover, renderIllustratedEdition } from './illustrated-edition.mjs';

const SITE_DIR = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(SITE_DIR, 'public');

async function loadStories(storiesDir) {
  const files = (await readdir(storiesDir))
    .filter((file) => file.endsWith('.json'))
    .sort();

  return Promise.all(
    files.map(async (file) => JSON.parse(await readFile(path.join(storiesDir, file), 'utf8')))
  );
}

async function loadActivities(activitiesDir, storyId) {
  if (!activitiesDir) {
    return null;
  }

  try {
    return JSON.parse(await readFile(path.join(activitiesDir, `${storyId}.json`), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function safeUrl(value) {
  const raw = String(value ?? '').trim();

  if (!raw || /[\u0000-\u001f\u007f]/.test(raw)) {
    return null;
  }

  if (/^https?:\/\//i.test(raw) || raw.startsWith('/')) {
    return encodeURI(raw);
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    return null;
  }

  return encodeURI(raw);
}

export function normalizeBasePath(value = '') {
  const raw = String(value ?? '').trim();

  if (!raw || raw === '/') {
    return '';
  }

  const normalized = `/${raw.replace(/^\/+|\/+$/g, '')}`;
  const segments = normalized.slice(1).split('/');

  if (
    /[\u0000-\u001f\u007f?#\\]/.test(normalized) ||
    segments.some((segment) => !segment || segment === '.' || segment === '..') ||
    !segments.every((segment) => /^[A-Za-z0-9._~-]+$/.test(segment))
  ) {
    throw new Error(`Invalid site base path: ${raw}`);
  }

  return normalized;
}

function sitePath(basePath, rootPath) {
  if (!rootPath.startsWith('/')) {
    throw new Error(`Site path must start with /: ${rootPath}`);
  }

  const normalizedBasePath = normalizeBasePath(basePath);
  if (!normalizedBasePath) {
    return rootPath;
  }

  return rootPath === '/' ? `${normalizedBasePath}/` : `${normalizedBasePath}${rootPath}`;
}

function safeSiteUrl(value, basePath) {
  const safe = safeUrl(value);

  if (!safe || !safe.startsWith('/')) {
    return safe;
  }

  return sitePath(basePath, safe);
}

function assetUrl(story, assetPath) {
  if (!assetPath) {
    return null;
  }

  if (assetPath.startsWith('/')) {
    return assetPath;
  }

  if (/^https?:\/\//i.test(assetPath)) {
    return assetPath;
  }

  const match = story.provenance?.storyPage?.match(/^(https:\/\/web\.archive\.org\/web\/[^/]+\/)(https?:\/\/[^/]+)(?:\/.*)?$/);
  if (!match) {
    return assetPath;
  }

  const [, archivePrefix, origin] = match;
  return `${archivePrefix}${origin}/${assetPath.replace(/^\/+/, '')}`;
}

export function safeAssetUrl(story, assetPath, basePath = '') {
  const raw = String(assetPath ?? '');
  if (/[\u0000-\u001f\u007f]/.test(raw)) {
    return null;
  }

  if (!safeUrl(raw)) {
    return null;
  }

  return safeSiteUrl(assetUrl(story, raw.trim()), basePath);
}

function assertStoryId(story) {
  if (!/^\d{2}-\d{2}$/.test(story.id || '')) {
    throw new Error(`Invalid story id: ${story.id}`);
  }
}

function storyHref(story, basePath) {
  assertStoryId(story);
  return sitePath(basePath, `/stories/${encodeURIComponent(story.id)}/`);
}

function pageShell({ title, body, scripts = [], basePath = '' }) {
  const stylesheet = sitePath(basePath, '/styles.css');
  const appScript = sitePath(basePath, '/app.js');
  const homepage = sitePath(basePath, '/');
  const archive = sitePath(basePath, '/archive/');

  return `<!doctype html>
<html lang="pt-PT">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="${escapeHtml(stylesheet)}">
  <script src="${escapeHtml(appScript)}" defer></script>
${scripts.map((script) => `  <script src="${escapeHtml(sitePath(basePath, script))}" defer></script>`).join('\n')}
</head>
<body>
  <a class="skip-link" href="#conteudo">Saltar para o conteúdo</a>
  <header class="site-header">
    <a class="brand" href="${escapeHtml(homepage)}" aria-label="História do Dia, página inicial">História do Dia</a>
    <nav aria-label="Navegação principal">
      <a href="${escapeHtml(homepage)}">Hoje</a>
      <a href="${escapeHtml(archive)}">Arquivo</a>
    </nav>
  </header>
  <main id="conteudo" tabindex="-1">
${body}
  </main>
  <footer class="site-footer">
    <p><strong>Transparência:</strong> As novas ilustrações desta edição foram geradas com inteligência artificial a partir do texto das histórias e de referências visuais recuperadas.</p>
    <p>Conteúdo original do projeto sob <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.pt" rel="license">CC BY-SA 4.0</a>, na medida dos direitos detidos pelos responsáveis. Materiais históricos recuperados podem estar sujeitos a direitos de terceiros.</p>
    <p>Projeto independente de preservação e experimentação educativa. Não é o site original nem tem afiliação oficial com os seus autores, ilustradores ou editores.</p>
  </footer>
</body>
</html>`;
}

function recoveryBadges(story) {
  const badges = [
    ['Texto original recuperado', story.recovery?.text === 'recovered'],
    ['Ilustração original recuperada', Boolean(story.assets?.background || story.assets?.icon)],
    ['PDF recuperado', Boolean(story.assets?.printPdf)],
    ['Áudio original em Flash', Boolean(story.assets?.originalAudioSwf)],
    ['Narração sintetizada', Boolean(story.assets?.rerecordedAudio)]
  ];

  return `<ul class="badges" aria-label="Estado da recuperação">
${badges
  .map(
    ([label, active]) =>
      `    <li class="${active ? 'is-available' : 'is-missing'}">${escapeHtml(label)}</li>`
  )
  .join('\n')}
  </ul>`;
}

function audioNotice(story, basePath) {
  if (story.assets?.recoveredAudio) {
    const audio = safeSiteUrl(story.assets.recoveredAudio, basePath);

    if (audio) {
      return `<audio controls src="${escapeHtml(audio)}"></audio>
      <p class="notice">Áudio original recuperado de segmentos Flash e convertido para formato moderno.</p>`;
    }
  }

  if (story.assets?.rerecordedAudio) {
    const audio = safeSiteUrl(story.assets.rerecordedAudio, basePath);
    const captions = safeSiteUrl(story.assets.captions, basePath);

    if (!audio) {
      return `<p class="notice">Ainda não há áudio recuperado para esta história.</p>`;
    }

    return `<audio controls src="${escapeHtml(audio)}">
        ${captions ? `<track kind="captions" src="${escapeHtml(captions)}" srclang="pt" label="Português">` : ''}
      </audio>
      <p class="notice">Narração sintetizada em pt-PT. Não é o áudio original.</p>`;
  }

  if (story.assets?.originalAudioSwf) {
    return `<p class="notice">Narração original em Flash recuperada como referência. Conversão para áudio moderno pendente.</p>`;
  }

  return `<p class="notice">Ainda não há áudio recuperado para esta história.</p>`;
}

function recoveredImage(story, context = 'large', basePath = '') {
  const source = safeAssetUrl(story, story.assets?.background || story.assets?.archiveBackground || story.assets?.icon || story.assets?.archiveIcon, basePath);

  if (!source) {
    return `<div class="asset-fallback">
      <p>Ilustração original ainda não recuperada.</p>
    </div>`;
  }

  return `<figure class="story-art story-art-${context}">
    <img src="${escapeHtml(source)}" alt="Ilustração original recuperada para ${escapeHtml(story.title)}" loading="${context === 'large' ? 'eager' : 'lazy'}">
    <figcaption>Ilustração original recuperada</figcaption>
  </figure>`;
}

function homepageImage(story, basePath) {
  const cover = illustratedCover(story);
  const source = cover && safeAssetUrl(story, cover.image, basePath);

  if (!source) {
    return recoveredImage(story, 'large', basePath);
  }

  return `<figure class="story-art story-art-large illustrated-cover">
    <img src="${escapeHtml(source)}" alt="${escapeHtml(cover.alt)}" loading="eager">
    <figcaption>${escapeHtml(story.illustratedEdition.credit)}</figcaption>
  </figure>`;
}

function imageGallery(story, basePath) {
  const gallery = (story.assets?.gallery ?? [])
    .map((assetPath) => safeAssetUrl(story, assetPath, basePath))
    .filter(Boolean)
    .slice(0, 12);

  if (!gallery.length) {
    return '';
  }

  return `<section class="image-gallery" aria-labelledby="imagens-recuperadas">
      <h2 id="imagens-recuperadas">Imagens recuperadas</h2>
      <div>
${gallery
  .map((source, index) => `        <a href="${escapeHtml(source)}"><img src="${escapeHtml(source)}" alt="Imagem original recuperada ${index + 1} de ${escapeHtml(story.title)}" loading="lazy"></a>`)
  .join('\n')}
      </div>
    </section>`;
}

function storyText(story) {
  return story.textSegments
    .map(
      (segment) => `<section class="story-segment">
${segment.paragraphs.map((paragraph) => `      <p>${escapeHtml(paragraph)}</p>`).join('\n')}
    </section>`
    )
    .join('\n');
}

function glossary(story) {
  if (!story.glossary?.length) {
    return '';
  }

  return `<section class="glossary" aria-labelledby="glossario">
      <h2 id="glossario">Palavras da história</h2>
${story.glossary
  .map(
    (entry, index) => `      <button class="glossary-item" type="button" aria-expanded="false" aria-controls="glossary-${index + 1}">
        <strong>${escapeHtml(entry.term)}</strong>
        <span id="glossary-${index + 1}">${escapeHtml(entry.definition)}</span>
      </button>`
  )
  .join('\n')}
    </section>`;
}

function provenance(story, basePath) {
  const storyPage = safeSiteUrl(story.provenance?.storyPage, basePath);
  const pdf = safeAssetUrl(story, story.assets?.printPdf, basePath);

  return `<section class="provenance" aria-labelledby="recuperacao">
      <h2 id="recuperacao">Recuperação</h2>
      <p>${escapeHtml(story.provenance?.notes || 'História recuperada a partir do arquivo original.')}</p>
      <dl>
        <div>
          <dt>Página original arquivada</dt>
          <dd>${storyPage ? `<a href="${escapeHtml(storyPage)}">Ver no arquivo</a>` : 'Pendente'}</dd>
        </div>
        <div>
          <dt>PDF original</dt>
          <dd>${pdf ? `<a href="${escapeHtml(pdf)}">Abrir PDF recuperado</a>` : 'Pendente'}</dd>
        </div>
      </dl>
    </section>`;
}

function playCorner(story, activities, basePath) {
  if (!activities) {
    return '';
  }

  const publicActivities = {
    ...activities,
    activities: (activities.activities ?? []).map((activity) => {
      if (activity.type !== 'puzzle-ilustracao') {
        return activity;
      }

      return {
        ...activity,
        image: safeAssetUrl(story, activity.image, basePath) ?? ''
      };
    })
  };
  const embeddedData = JSON.stringify(publicActivities).replaceAll('</', '<\\/');

  return `<section id="brincar" class="play-corner" aria-labelledby="brincar-titulo">
      <header class="play-corner-header">
        <p class="eyebrow">Voltar ao texto</p>
        <h2 id="brincar-titulo">Brincar</h2>
        <p class="play-provenance">${activities.generatedFrom === 'recovered-illustration'
          ? 'Jogo criado a partir da ilustração original recuperada. Não fazia parte do site original.'
          : 'Jogos criados a partir do texto recuperado desta história. Não faziam parte do site original.'}</p>
      </header>
      <script type="application/json" id="activities-data">${embeddedData}</script>
      <div id="activities-root"></div>
      <noscript>
        <p class="play-paper-suggestion">Imprime a história e rodeia as palavras que já conheces.</p>
      </noscript>
    </section>`;
}

function renderHome(story, basePath) {
  return pageShell({
    title: 'História do Dia',
    basePath,
    body: `    <section class="today-hero" aria-labelledby="historia-de-hoje">
      <div class="today-copy">
        <p class="eyebrow">${escapeHtml(story.dateLabel)}</p>
        <h1 id="historia-de-hoje">${escapeHtml(story.title)}</h1>
        <p class="context">${escapeHtml(story.dayContext || 'Uma história recuperada do arquivo original.')}</p>
        <div class="actions" aria-label="Ações da história de hoje">
          <a class="button primary" href="${escapeHtml(storyHref(story, basePath))}">Ler</a>
          <a class="button secondary" href="${escapeHtml(storyHref(story, basePath))}#audio">Ouvir</a>
        </div>
        ${recoveryBadges(story)}
      </div>
      ${homepageImage(story, basePath)}
    </section>`
  });
}

function renderArchive(stories, basePath) {
  return pageShell({
    title: 'Arquivo das Histórias',
    basePath,
    body: `    <section class="archive" aria-labelledby="arquivo">
      <p class="eyebrow">Arquivo</p>
      <h1 id="arquivo">Escolhe um dia</h1>
      <div class="archive-grid">
${stories
  .map(
    (story) => `        <a class="archive-day" href="${escapeHtml(storyHref(story, basePath))}">
          <span>${escapeHtml(story.dateLabel)}</span>
          <strong>${escapeHtml(story.title)}</strong>
          <small>${escapeHtml(story.recovery?.completeness || 'estado por confirmar')}</small>
        </a>`
  )
  .join('\n')}
      </div>
    </section>`
  });
}

function renderStory(story, activities, basePath) {
  const illustratedEdition = renderIllustratedEdition(story, {
    escapeHtml,
    safeAssetUrl: (currentStory, assetPath) => safeAssetUrl(currentStory, assetPath, basePath)
  });

  if (illustratedEdition) {
    return pageShell({
      title: `${story.title} | História do Dia`,
      scripts: activities ? ['/brincar.js'] : [],
      basePath,
      body: `    <article class="reader reader-illustrated">
      <nav class="edition-switcher" aria-label="Escolher edição">
        <a href="#edicao-ilustrada" data-edition-target="edicao-ilustrada" aria-current="true">Edição ilustrada</a>
        <a href="#edicao-original" data-edition-target="edicao-original" aria-current="false">Original recuperado</a>
      </nav>
      <div class="edition-toolbar">
        ${recoveryBadges(story)}
        ${activities ? `<div class="actions" aria-label="Ações da história">
          <a class="button secondary" href="#brincar">Brincar</a>
        </div>` : ''}
      </div>
      ${illustratedEdition}
      <section id="edicao-original" class="edition-panel original-edition" tabindex="-1">
        <p class="credits original-credit">${escapeHtml(story.author)} escreveu. ${escapeHtml(story.illustrator)} ilustrou.</p>
        ${recoveredImage(story, 'reader', basePath)}
${storyText(story)}
        ${imageGallery(story, basePath)}
      </section>
      <section id="audio" class="audio-panel" aria-labelledby="ouvir">
        <h2 id="ouvir">Ouvir</h2>
        ${audioNotice(story, basePath)}
      </section>
      ${glossary(story)}
      ${playCorner(story, activities, basePath)}
      ${provenance(story, basePath)}
    </article>`
    });
  }

  return pageShell({
    title: `${story.title} | História do Dia`,
    scripts: activities ? ['/brincar.js'] : [],
    basePath,
    body: `    <article class="reader">
      <header class="reader-header">
        <p class="eyebrow">${escapeHtml(story.dateLabel)}</p>
        <h1>${escapeHtml(story.title)}</h1>
        <p class="credits">${escapeHtml(story.author)} escreveu. ${escapeHtml(story.illustrator)} ilustrou.</p>
        ${recoveryBadges(story)}
        ${activities ? `<div class="actions" aria-label="Ações da história">
          <a class="button secondary" href="#brincar">Brincar</a>
        </div>` : ''}
      </header>
      ${recoveredImage(story, 'reader', basePath)}
      <section id="audio" class="audio-panel" aria-labelledby="ouvir">
        <h2 id="ouvir">Ouvir</h2>
        ${audioNotice(story, basePath)}
      </section>
${storyText(story)}
      ${imageGallery(story, basePath)}
      ${glossary(story)}
      ${playCorner(story, activities, basePath)}
      ${provenance(story, basePath)}
    </article>`
  });
}

export function storyIdForDate(date = new Date(), timeZone = 'Europe/Lisbon') {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: '2-digit',
    month: '2-digit'
  }).formatToParts(date);
  const day = parts.find((part) => part.type === 'day')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;

  if (!day || !month) {
    throw new Error(`Could not format story date for timezone ${timeZone}`);
  }

  return `${month}-${day}`;
}

function selectTodayStory(stories, today, todayTimeZone) {
  const todayId = storyIdForDate(today, todayTimeZone);
  return stories.find((story) => story.id === todayId) ?? stories[0];
}

export async function renderSite({ storiesDir, outDir, recoveredArchiveDir = 'archive/0000', activitiesDir = 'data/activities', today = new Date(), todayTimeZone = 'Europe/Lisbon', basePath = '' }) {
  const stories = await loadStories(storiesDir);
  const todayStory = selectTodayStory(stories, today, todayTimeZone);
  const normalizedBasePath = normalizeBasePath(basePath);

  if (!todayStory) {
    throw new Error(`No story JSON files found in ${storiesDir}`);
  }

  stories.forEach(assertStoryId);

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  await cp(PUBLIC_DIR, outDir, { recursive: true });
  await copyRecoveredArchive(recoveredArchiveDir, path.join(outDir, 'recovered', '0000'));
  await mkdir(path.join(outDir, 'archive'), { recursive: true });

  await writeFile(path.join(outDir, 'index.html'), renderHome(todayStory, normalizedBasePath));
  await writeFile(path.join(outDir, 'archive', 'index.html'), renderArchive(stories, normalizedBasePath));

  for (const story of stories) {
    const activities = await loadActivities(activitiesDir, story.id);
    const storyDir = path.join(outDir, 'stories', story.id);
    await mkdir(storyDir, { recursive: true });
    await writeFile(path.join(storyDir, 'index.html'), renderStory(story, activities, normalizedBasePath));
  }
}

async function copyRecoveredArchive(sourceDir, targetDir) {
  if (!sourceDir) {
    return;
  }

  try {
    await cp(sourceDir, targetDir, { recursive: true });
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await renderSite({
    storiesDir: 'data/stories',
    outDir: 'dist',
    basePath: process.env.SITE_BASE_PATH ?? ''
  });
  console.log('Built dist/');
}
