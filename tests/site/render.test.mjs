import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { renderSite, safeAssetUrl } from '../../src/site/render.mjs';

function sectionMarkup(html, id) {
  const start = html.indexOf(`<section id="${id}"`);
  assert.notEqual(start, -1, `expected section #${id}`);

  let depth = 0;
  for (const match of html.slice(start).matchAll(/<\/?section\b[^>]*>/g)) {
    depth += match[0].startsWith('</') ? -1 : 1;
    if (depth === 0) {
      return html.slice(start, start + match.index + match[0].length);
    }
  }

  assert.fail(`expected a closing tag for section #${id}`);
}

function countOccurrences(value, fragment) {
  return value.split(fragment).length - 1;
}

describe('renderSite', () => {
  after(async () => {
    await rm('tmp/render-activities', { recursive: true, force: true });
    await rm('tmp/render-safety', { recursive: true, force: true });
    await rm('tmp/render-invalid-id', { recursive: true, force: true });
    await rm('tmp/render-today', { recursive: true, force: true });
    await rm('tmp/render-illustrated', { recursive: true, force: true });
    await rm('tmp/render-wayback-safety', { recursive: true, force: true });
    await rm('src/site/public/assets/99-99', { recursive: true, force: true });
  });

  it('adds the activity shell and safely embedded data only to a matching story', async () => {
    await rm('tmp/render-activities', { recursive: true, force: true });
    await mkdir('tmp/render-activities/stories', { recursive: true });

    await writeFile(
      'tmp/render-activities/stories/01-01.json',
      JSON.stringify({
        id: '01-01',
        dateLabel: '1 de Janeiro',
        title: 'Moleiros e Carvoeiros',
        author: 'António Torrado',
        illustrator: 'Cristina Malaquias',
        textSegments: [{ layer: 1, paragraphs: ['Um moleiro encontrou um carvoeiro.'] }],
        glossary: [{ term: 'moleiro', definition: 'Pessoa que trabalha num moinho.' }],
        assets: {},
        recovery: { text: 'recovered' },
        provenance: {}
      })
    );

    await renderSite({
      storiesDir: 'tmp/render-activities/stories',
      activitiesDir: 'tests/fixtures/activities',
      outDir: 'tmp/render-activities/with-activities',
      recoveredArchiveDir: null
    });

    const withActivities = await readFile(
      'tmp/render-activities/with-activities/stories/01-01/index.html',
      'utf8'
    );
    const embeddedMatch = withActivities.match(
      /<script type="application\/json" id="activities-data">([\s\S]*?)<\/script>/
    );

    assert.match(withActivities, /<section id="brincar" class="play-corner" aria-labelledby="brincar-titulo">/);
    assert.match(withActivities, /Jogos criados a partir do texto recuperado desta história\. Não faziam parte do site original\./);
    assert.match(withActivities, /id="activities-root"/);
    assert.match(withActivities, /<noscript>/);
    assert.match(withActivities, /href="#brincar"[^>]*>Brincar<\/a>/);
    assert.match(withActivities, /<script src="\/brincar\.js" defer><\/script>/);
    assert.ok(embeddedMatch, 'expected embedded activities JSON');
    assert.doesNotMatch(embeddedMatch[1], /<\/script>/);
    assert.match(embeddedMatch[1], /<\\\/script>/);
    assert.equal(
      JSON.parse(embeddedMatch[1]).activities[0].rounds[0].sentence,
      'Está na história: </script> um moleiro, todo enfarinhado.'
    );
    assert.ok(
      withActivities.indexOf('class="glossary"') < withActivities.indexOf('id="brincar"'),
      'expected Brincar after the glossary'
    );

    const gameScript = await readFile('tmp/render-activities/with-activities/brincar.js', 'utf8');

    for (const activityType of [
      'encontra-palavra',
      'fabrica-palavras',
      'jogo-memoria',
      'puzzle-ilustracao',
      'ordena-historia'
    ]) {
      assert.match(gameScript, new RegExp(`['"]${activityType}['"]`));
    }
    assert.match(gameScript, /document\.createElement\('button'\)/);
    assert.match(gameScript, /button\.type = 'button'/);
    assert.match(gameScript, /setAttribute\('aria-live', 'polite'\)/);
    assert.match(gameScript, /function focusCompletion/);
    assert.match(gameScript, /completion\.tabIndex = -1/);
    assert.match(gameScript, /completion\.focus\(\)/);
    assert.match(gameScript, /makeButton\(isVisible \? card\.text : '\?'/);
    assert.match(gameScript, /aria-pressed', String\(isVisible\)/);
    assert.match(gameScript, /Carta \$\{index \+ 1\}, virada para baixo/);
    assert.match(gameScript, /A história, por ordem/);
    assert.doesNotMatch(gameScript, /role=['"]button/);
    assert.doesNotMatch(gameScript, /\b(?:score|timer|setInterval|Audio)\b/i);

    const activityStyles = await readFile('tmp/render-activities/with-activities/styles.css', 'utf8');

    assert.match(activityStyles, /\.play-corner\s*{/);
    assert.match(activityStyles, /\.play-corner button[\s\S]*?min-height:\s*2\.75rem/);
    assert.match(activityStyles, /\.play-corner[\s\S]*?var\(--paper-shadow\)/);
    assert.match(activityStyles, /\.play-corner[\s\S]*?var\(--amber\)/);
    assert.match(activityStyles, /\.is-success/);
    assert.match(activityStyles, /prefers-reduced-motion:\s*reduce/);

    await renderSite({
      storiesDir: 'tmp/render-activities/stories',
      activitiesDir: 'tmp/render-activities/missing',
      outDir: 'tmp/render-activities/without-activities',
      recoveredArchiveDir: null
    });

    const withoutActivities = await readFile(
      'tmp/render-activities/without-activities/stories/01-01/index.html',
      'utf8'
    );

    assert.doesNotMatch(withoutActivities, /id="brincar"/);
    assert.doesNotMatch(withoutActivities, /\/brincar\.js/);
  });

  it('validates raw asset paths before resolving recovered Wayback URLs', () => {
    const story = {
      provenance: {
        storyPage: 'https://web.archive.org/web/20070101000000/http://www.historiadodia.pt/01/01/index.asp'
      }
    };

    for (const unsafe of [
      'javascript:alert(1)',
      'data:text/html,unsafe',
      'file:///tmp/private',
      'ftp://example.com/file',
      'imagem\u0000.jpg'
    ]) {
      assert.equal(safeAssetUrl(story, unsafe), null);
    }
    assert.equal(safeAssetUrl(story, '/assets/story image.jpg'), '/assets/story%20image.jpg');
    assert.equal(safeAssetUrl(story, 'https://example.com/story image.jpg'), 'https://example.com/story%20image.jpg');
    assert.equal(
      safeAssetUrl(story, 'imagens/story image.jpg'),
      'https://web.archive.org/web/20070101000000/http://www.historiadodia.pt/imagens/story%20image.jpg'
    );
  });

  it('renders homepage, archive, and story page from story data', async () => {
    await rm('dist', { recursive: true, force: true });
    await renderSite({ storiesDir: 'data/stories', outDir: 'dist', today: new Date('2026-01-01T12:00:00+00:00') });

    const homepage = await readFile('dist/index.html', 'utf8');
    const archive = await readFile('dist/archive/index.html', 'utf8');
    const story = await readFile('dist/stories/01-01/index.html', 'utf8');
    const stylesheet = await readFile('dist/styles.css', 'utf8');
    const script = await readFile('dist/app.js', 'utf8');

    assert.match(homepage, /Moleiros e Carvoeiros/);
    assert.match(homepage, /Ler/);
    assert.match(homepage, /Ouvir/);
    assert.match(archive, /1 de Janeiro/);
    assert.match(archive, /2 de Janeiro/);
    assert.match(archive, /A Ovelha Generosa/);
    assert.match(story, /António Torrado/);
    assert.match(story, /Riram-se os filhos/);
    assert.doesNotMatch(story, /Parte 1/);
    assert.doesNotMatch(story, /Parte 2/);
    assert.match(story, /Narração sintetizada em pt-PT/);
    assert.match(story, /narracao-tts\.mp3/);
    assert.match(story, /kind="captions"/);
    assert.match(homepage, /src="\/assets\/01-01\/illustrated\/opening\.webp"/);
    assert.doesNotMatch(homepage, /src="\/assets\/01-01\/illustration-original\.jpg"/);
    assert.match(story, /href="\/assets\/01-01\/imprimir\.pdf"/);
    assert.match(story, /Imagens recuperadas/);
    assert.match(story, /\/recovered\/0000\/01\/01\//);
    assert.doesNotMatch(story, /historiadodia\.pt:80\/assets/);
    assert.match(homepage, /lang="pt-PT"/);
    assert.match(homepage, /class="skip-link"/);
    assert.match(stylesheet, /Atelier de papel/);
    assert.match(script, /glossary/);
    assert.match(script, /data-edition-target/);
    assert.match(script, /panel\.hidden/);
    assert.match(stylesheet, /\.illustrated-opening/);
    assert.match(stylesheet, /\.scene-double-page/);
    assert.match(stylesheet, /\.scene-marginal/);
    assert.match(stylesheet, /\.scene-vignette/);
    assert.match(stylesheet, /@media \(max-width: 48rem\)/);
  });

  it('renders the homepage with the story matching the current calendar date', async () => {
    await rm('tmp/render-today', { recursive: true, force: true });
    await renderSite({
      storiesDir: 'data/stories',
      outDir: 'tmp/render-today/dist',
      recoveredArchiveDir: null,
      today: new Date('2026-06-03T12:00:00+01:00')
    });

    const homepage = await readFile('tmp/render-today/dist/index.html', 'utf8');

    assert.match(homepage, /3 de Junho/);
    assert.match(homepage, /A boneca da madrinha/);
    assert.doesNotMatch(homepage, /Moleiros e Carvoeiros/);
  });

  it('renders a completed illustrated edition and prefers its opening on the homepage', async () => {
    await rm('tmp/render-illustrated', { recursive: true, force: true });
    await rm('src/site/public/assets/99-99', { recursive: true, force: true });
    await mkdir('tmp/render-illustrated/stories', { recursive: true });
    await mkdir('tmp/render-illustrated/activities', { recursive: true });
    await mkdir('src/site/public/assets/99-99/illustrated', { recursive: true });
    await writeFile('src/site/public/assets/99-99/illustrated/opening.webp', 'opening');
    await writeFile('src/site/public/assets/99-99/illustrated/middle.webp', 'middle');
    await writeFile(
      'tmp/render-illustrated/activities/99-99.json',
      await readFile('tests/fixtures/activities/01-01.json', 'utf8')
    );

    await writeFile(
      'tmp/render-illustrated/stories/99-99.json',
      JSON.stringify({
        id: '99-99',
        dateLabel: '30 de Dezembro',
        title: 'Uma edição ilustrada',
        author: 'Autora Original',
        illustrator: 'Ilustrador Original',
        textSegments: [{ layer: 1, paragraphs: ['Primeiro parágrafo.', 'Segundo parágrafo.'] }],
        glossary: [{ term: 'edição', definition: 'Uma forma de apresentar a história.' }],
        assets: { background: '/assets/01-01/illustration-original.jpg' },
        recovery: { text: 'recovered' },
        provenance: { notes: 'Texto e imagem originais recuperados.' },
        illustratedEdition: {
          status: 'complete',
          credit: 'Edição ilustrada contemporânea gerada com IA',
          scenes: [
            { id: 'opening', status: 'complete', after: null, layout: 'opening', image: '/assets/99-99/illustrated/opening.webp', alt: 'Ilustração de abertura da história «Uma edição ilustrada».' },
            { id: 'middle', status: 'complete', after: { segment: 0, paragraph: 0 }, layout: 'marginal', image: '/assets/99-99/illustrated/middle.webp', alt: '' }
          ]
        }
      })
    );

    await renderSite({
      storiesDir: 'tmp/render-illustrated/stories',
      activitiesDir: 'tmp/render-illustrated/activities',
      outDir: 'tmp/render-illustrated/complete',
      recoveredArchiveDir: null,
      today: new Date('2026-12-30T12:00:00+00:00')
    });

    const homepage = await readFile('tmp/render-illustrated/complete/index.html', 'utf8');
    const story = await readFile('tmp/render-illustrated/complete/stories/99-99/index.html', 'utf8');
    const illustratedPanel = sectionMarkup(story, 'edicao-ilustrada');
    const originalPanel = sectionMarkup(story, 'edicao-original');

    assert.match(homepage, /src="\/assets\/99-99\/illustrated\/opening\.webp"/);
    assert.match(homepage, /alt="Ilustração de abertura da história «Uma edição ilustrada»\."/);
    assert.doesNotMatch(homepage, /src="\/assets\/01-01\/illustration-original\.jpg"/);
    assert.match(story, /<article class="reader reader-illustrated">/);
    assert.match(story, /class="edition-switcher"/);
    assert.equal((story.match(/<h1(?:\s|>)/g) ?? []).length, 1);
    assert.match(story, /Edição ilustrada contemporânea gerada com IA/);
    assert.match(story, /middle\.webp" alt=""/);
    assert.match(story, /Autora Original escreveu\. Ilustrador Original ilustrou\./);
    assert.ok(story.indexOf('class="edition-switcher"') < story.indexOf('id="edicao-ilustrada"'));
    assert.ok(story.indexOf('id="edicao-ilustrada"') < story.indexOf('id="edicao-original"'));
    assert.ok(story.indexOf('Autora Original escreveu. Ilustrador Original ilustrou.') < story.indexOf('illustration-original.jpg'));
    assert.ok(story.indexOf('illustration-original.jpg') < story.lastIndexOf('Primeiro parágrafo.'));
    assert.ok(story.indexOf('id="edicao-original"') < story.indexOf('id="audio"'));
    assert.ok(story.indexOf('id="audio"') < story.indexOf('class="glossary"'));
    assert.ok(story.indexOf('class="glossary"') < story.indexOf('id="brincar"'));
    assert.ok(story.indexOf('id="brincar"') < story.indexOf('class="provenance"'));
    for (const paragraph of ['Primeiro parágrafo.', 'Segundo parágrafo.']) {
      assert.equal(countOccurrences(illustratedPanel, `<p>${paragraph}</p>`), 1);
      assert.equal(countOccurrences(originalPanel, `<p>${paragraph}</p>`), 1);
    }
  });

  it('keeps the recovered reader for pending or failed illustrated openings', async () => {
    for (const status of ['pending', 'failed']) {
      const root = `tmp/render-illustrated/${status}`;
      await mkdir(`${root}/stories`, { recursive: true });
      await writeFile(
        `${root}/stories/99-99.json`,
        JSON.stringify({
          id: '99-99',
          dateLabel: '30 de Dezembro',
          title: `Abertura ${status}`,
          author: 'Autora',
          illustrator: 'Ilustrador',
          textSegments: [{ layer: 1, paragraphs: ['Texto recuperado intacto.'] }],
          assets: { background: '/assets/01-01/illustration-original.jpg' },
          recovery: { text: 'recovered' },
          provenance: {},
          illustratedEdition: {
            status,
            credit: 'Edição ilustrada contemporânea gerada com IA',
            scenes: [
              { id: 'opening', status, after: null, layout: 'opening', image: '/assets/99-99/illustrated/opening.webp', alt: 'Abertura.' }
            ]
          }
        })
      );

      await renderSite({
        storiesDir: `${root}/stories`,
        outDir: `${root}/dist`,
        recoveredArchiveDir: null
      });

      const homepage = await readFile(`${root}/dist/index.html`, 'utf8');
      const story = await readFile(`${root}/dist/stories/99-99/index.html`, 'utf8');

      assert.doesNotMatch(story, /class="edition-switcher"/);
      assert.doesNotMatch(story, /id="edicao-ilustrada"/);
      assert.match(story, /src="\/assets\/01-01\/illustration-original\.jpg"/);
      assert.match(story, /Texto recuperado intacto\./);
      assert.match(homepage, /src="\/assets\/01-01\/illustration-original\.jpg"/);
    }
  });

  it('rejects an unsafe completed opening before resolving it through Wayback', async () => {
    await rm('tmp/render-wayback-safety', { recursive: true, force: true });
    await mkdir('tmp/render-wayback-safety/stories', { recursive: true });
    await writeFile(
      'tmp/render-wayback-safety/stories/99-98.json',
      JSON.stringify({
        id: '99-98',
        dateLabel: 'Dia de teste',
        title: 'Abertura insegura',
        author: 'Autora',
        illustrator: 'Ilustrador',
        textSegments: [{ layer: 1, paragraphs: ['Texto histórico preservado.'] }],
        assets: { background: '/assets/01-01/illustration-original.jpg' },
        recovery: { text: 'recovered' },
        provenance: {
          storyPage: 'https://web.archive.org/web/20070101000000/http://www.historiadodia.pt/01/01/index.asp'
        },
        illustratedEdition: {
          status: 'complete',
          credit: 'Edição ilustrada contemporânea gerada com IA',
          scenes: [
            { id: 'opening', status: 'complete', after: null, layout: 'opening', image: 'javascript:alert(1)', alt: 'Abertura.' }
          ]
        }
      })
    );

    await renderSite({
      storiesDir: 'tmp/render-wayback-safety/stories',
      outDir: 'tmp/render-wayback-safety/dist',
      recoveredArchiveDir: null
    });

    const homepage = await readFile('tmp/render-wayback-safety/dist/index.html', 'utf8');
    const story = await readFile('tmp/render-wayback-safety/dist/stories/99-98/index.html', 'utf8');

    for (const html of [homepage, story]) {
      assert.doesNotMatch(html, /javascript:/i);
      assert.doesNotMatch(html, /web\.archive\.org[^"\s]*javascript:/i);
      assert.match(html, /src="\/assets\/01-01\/illustration-original\.jpg"/);
    }
    assert.doesNotMatch(story, /class="edition-switcher"/);
    assert.doesNotMatch(story, /id="edicao-ilustrada"/);
    assert.match(story, /Texto histórico preservado\./);
  });

  it('escapes recovered text and rejects unsafe recovered URLs', async () => {
    await rm('tmp/render-safety', { recursive: true, force: true });
    await mkdir('tmp/render-safety/stories', { recursive: true });

    await writeFile(
      'tmp/render-safety/stories/02-02.json',
      JSON.stringify({
        id: '02-02',
        dateLabel: '2 de Fevereiro',
        title: 'Título <script>alert(1)</script>',
        dayContext: 'Contexto & teste',
        author: 'Autor',
        illustrator: 'Ilustrador',
        textSegments: [
          {
            layer: 1,
            paragraphs: ['<img src=x onerror=alert(1)>']
          }
        ],
        glossary: [{ term: 'x<y', definition: 'a&b' }],
        assets: {
          background: 'javascript:alert(1)',
          printPdf: 'javascript:alert(2)',
          originalAudioSwf: null,
          rerecordedAudio: 'javascript:alert(4)'
        },
        recovery: { text: 'recovered', completeness: 'test' },
        provenance: {
          storyPage: 'javascript:alert(3)',
          notes: '<b>nota</b>'
        }
      })
    );

    await renderSite({ storiesDir: 'tmp/render-safety/stories', outDir: 'tmp/render-safety/dist', recoveredArchiveDir: null });

    const story = await readFile('tmp/render-safety/dist/stories/02-02/index.html', 'utf8');

    assert.doesNotMatch(story, /href="javascript:/);
    assert.doesNotMatch(story, /src="javascript:/);
    assert.doesNotMatch(story, /<audio/);
    assert.doesNotMatch(story, /<script>alert/);
    assert.match(story, /Título &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.match(story, /&lt;img src=x onerror=alert\(1\)&gt;/);
    assert.match(story, /&lt;b&gt;nota&lt;\/b&gt;/);
  });

  it('rejects invalid story ids before writing story pages', async () => {
    await rm('tmp/render-invalid-id', { recursive: true, force: true });
    await mkdir('tmp/render-invalid-id/stories', { recursive: true });

    await writeFile(
      'tmp/render-invalid-id/stories/bad.json',
      JSON.stringify({
        id: '../../bad',
        dateLabel: 'Dia inválido',
        title: 'História inválida',
        author: 'Autor',
        illustrator: 'Ilustrador',
        textSegments: [{ layer: 1, paragraphs: ['Texto'] }],
        glossary: [],
        assets: {},
        recovery: {},
        provenance: {}
      })
    );

    await assert.rejects(
      () => renderSite({ storiesDir: 'tmp/render-invalid-id/stories', outDir: 'tmp/render-invalid-id/dist', recoveredArchiveDir: null }),
      /Invalid story id: \.\.\/\.\.\/bad/
    );
  });
});
