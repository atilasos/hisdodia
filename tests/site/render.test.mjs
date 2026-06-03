import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { renderSite } from '../../src/site/render.mjs';

describe('renderSite', () => {
  after(async () => {
    await rm('tmp/render-safety', { recursive: true, force: true });
    await rm('tmp/render-invalid-id', { recursive: true, force: true });
  });

  it('renders homepage, archive, and story page from story data', async () => {
    await rm('dist', { recursive: true, force: true });
    await renderSite({ storiesDir: 'data/stories', outDir: 'dist' });

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
    assert.match(story, /Narração sintetizada em pt-PT/);
    assert.match(story, /narracao-raquel\.mp3/);
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
