import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { renderSite } from '../../src/site/render.mjs';

describe('renderSite', () => {
  after(async () => {
    await rm('tmp/render-activities', { recursive: true, force: true });
    await rm('tmp/render-safety', { recursive: true, force: true });
    await rm('tmp/render-invalid-id', { recursive: true, force: true });
    await rm('tmp/render-today', { recursive: true, force: true });
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
    assert.match(homepage, /src="\/assets\/01-01\/illustration-original\.jpg"/);
    assert.match(story, /href="\/assets\/01-01\/imprimir\.pdf"/);
    assert.match(story, /Imagens recuperadas/);
    assert.match(story, /\/recovered\/0000\/01\/01\//);
    assert.doesNotMatch(story, /historiadodia\.pt:80\/assets/);
    assert.match(homepage, /lang="pt-PT"/);
    assert.match(homepage, /class="skip-link"/);
    assert.match(stylesheet, /Atelier de papel/);
    assert.match(script, /glossary/);
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
