import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

function escapeHtml(value) {
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

function safeAssetUrl(story, assetPath) {
  return safeUrl(assetUrl(story, assetPath));
}

function assertStoryId(story) {
  if (!/^\d{2}-\d{2}$/.test(story.id || '')) {
    throw new Error(`Invalid story id: ${story.id}`);
  }
}

function storyHref(story) {
  assertStoryId(story);
  return `/stories/${encodeURIComponent(story.id)}/`;
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
  <a class="skip-link" href="#conteudo">Saltar para o conteúdo</a>
  <header class="site-header">
    <a class="brand" href="/" aria-label="História do Dia, página inicial">História do Dia</a>
    <nav aria-label="Navegação principal">
      <a href="/">Hoje</a>
      <a href="/archive/">Arquivo</a>
    </nav>
  </header>
  <main id="conteudo" tabindex="-1">
${body}
  </main>
</body>
</html>`;
}

function recoveryBadges(story) {
  const badges = [
    ['Texto original recuperado', story.recovery?.text === 'recovered'],
    ['Ilustração original recuperada', Boolean(story.assets?.background || story.assets?.icon)],
    ['PDF recuperado', Boolean(story.assets?.printPdf)],
    ['Áudio original em Flash', Boolean(story.assets?.originalAudioSwf)],
    ['Narração regravada', Boolean(story.assets?.rerecordedAudio)]
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

function audioNotice(story) {
  if (story.assets?.recoveredAudio) {
    const audio = safeUrl(story.assets.recoveredAudio);

    if (audio) {
      return `<audio controls src="${escapeHtml(audio)}"></audio>
      <p class="notice">Áudio original recuperado de segmentos Flash e convertido para formato moderno.</p>`;
    }
  }

  if (story.assets?.rerecordedAudio) {
    const audio = safeUrl(story.assets.rerecordedAudio);
    const captions = safeUrl(story.assets.captions);

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

function recoveredImage(story, context = 'large') {
  const source = safeAssetUrl(story, story.assets?.background || story.assets?.archiveBackground || story.assets?.icon || story.assets?.archiveIcon);

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

function imageGallery(story) {
  const gallery = (story.assets?.gallery ?? [])
    .map((assetPath) => safeAssetUrl(story, assetPath))
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
      (segment, index) => `<section class="story-segment" aria-labelledby="segmento-${index + 1}">
      <h2 id="segmento-${index + 1}">Parte ${index + 1}</h2>
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

function provenance(story) {
  const storyPage = safeUrl(story.provenance?.storyPage);
  const pdf = safeAssetUrl(story, story.assets?.printPdf);

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

function renderHome(story) {
  return pageShell({
    title: 'História do Dia',
    body: `    <section class="today-hero" aria-labelledby="historia-de-hoje">
      <div class="today-copy">
        <p class="eyebrow">${escapeHtml(story.dateLabel)}</p>
        <h1 id="historia-de-hoje">${escapeHtml(story.title)}</h1>
        <p class="context">${escapeHtml(story.dayContext || 'Uma história recuperada do arquivo original.')}</p>
        <div class="actions" aria-label="Ações da história de hoje">
          <a class="button primary" href="${escapeHtml(storyHref(story))}">Ler</a>
          <a class="button secondary" href="${escapeHtml(storyHref(story))}#audio">Ouvir</a>
        </div>
        ${recoveryBadges(story)}
      </div>
      ${recoveredImage(story)}
    </section>`
  });
}

function renderArchive(stories) {
  return pageShell({
    title: 'Arquivo das Histórias',
    body: `    <section class="archive" aria-labelledby="arquivo">
      <p class="eyebrow">Arquivo</p>
      <h1 id="arquivo">Escolhe um dia</h1>
      <div class="archive-grid">
${stories
  .map(
    (story) => `        <a class="archive-day" href="${escapeHtml(storyHref(story))}">
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

function renderStory(story) {
  return pageShell({
    title: `${story.title} | História do Dia`,
    body: `    <article class="reader">
      <header class="reader-header">
        <p class="eyebrow">${escapeHtml(story.dateLabel)}</p>
        <h1>${escapeHtml(story.title)}</h1>
        <p class="credits">${escapeHtml(story.author)} escreveu. ${escapeHtml(story.illustrator)} ilustrou.</p>
        ${recoveryBadges(story)}
      </header>
      ${recoveredImage(story, 'reader')}
      <section id="audio" class="audio-panel" aria-labelledby="ouvir">
        <h2 id="ouvir">Ouvir</h2>
        ${audioNotice(story)}
      </section>
${storyText(story)}
      ${imageGallery(story)}
      ${glossary(story)}
      ${provenance(story)}
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

export async function renderSite({ storiesDir, outDir, recoveredArchiveDir = 'archive/0000', today = new Date(), todayTimeZone = 'Europe/Lisbon' }) {
  const stories = await loadStories(storiesDir);
  const todayStory = selectTodayStory(stories, today, todayTimeZone);

  if (!todayStory) {
    throw new Error(`No story JSON files found in ${storiesDir}`);
  }

  stories.forEach(assertStoryId);

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  await cp(PUBLIC_DIR, outDir, { recursive: true });
  await copyRecoveredArchive(recoveredArchiveDir, path.join(outDir, 'recovered', '0000'));
  await mkdir(path.join(outDir, 'archive'), { recursive: true });

  await writeFile(path.join(outDir, 'index.html'), renderHome(todayStory));
  await writeFile(path.join(outDir, 'archive', 'index.html'), renderArchive(stories));

  for (const story of stories) {
    const storyDir = path.join(outDir, 'stories', story.id);
    await mkdir(storyDir, { recursive: true });
    await writeFile(path.join(storyDir, 'index.html'), renderStory(story));
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
  await renderSite({ storiesDir: 'data/stories', outDir: 'dist' });
  console.log('Built dist/');
}
