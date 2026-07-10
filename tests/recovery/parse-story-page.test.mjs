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
    assert.equal(story.textSegments.length, 3);
    assert.equal(story.textSegments[0].paragraphs[0], 'No tempo em que as velas dos moinhos rodavam ao vento.');
    assert.equal(
      story.textSegments[0].paragraphs[1],
      'Esquecemo-nos de dizer que ao lado do moleiro ia o filho do moleiro.'
    );
    assert.equal(
      story.textSegments[1].paragraphs[0],
      'Os dois miúdos engalfinharam-se à zaragata.'
    );
    assert.equal(
      story.textSegments[2].paragraphs[0],
      'O texto com classe composta deve ser extraído.'
    );
    assert.equal(
      story.textSegments.flatMap((segment) => segment.paragraphs).join('\n').includes('Esta frase não deve ser extraída.'),
      false
    );
    assert.equal(story.glossary[0].term, 'engalfinharam-se');
    assert.equal(story.glossary[0].definition, 'pegaram-se');
    assert.equal(story.glossary[1].term, 'contendores');
    assert.equal(story.glossary[1].definition, 'rivais / adversários');
    assert.equal(story.glossary[2].term, 'N.ª');
    assert.equal(story.glossary[2].definition, 'preço €');
    assert.equal(story.assets.background, 'Imagens/Background.jpg');
    assert.equal(story.assets.printPdf, 'imprimir.pdf');
    assert.equal(story.assets.originalAudioSwf, 'http://sons.historiadodia.pt/01/01/um.swf');
  });

  it('extracts narrative divs from archived layers whose font has no historia-text class', () => {
    const html = `
      <div id="Layer1">
        <font class="atitulohistoria"><b>O Sult&atilde;o</b></font>
      </div>
      <div id="Layer2">
        <table><tr><td><font size="3" color="#666666"><b>
          <div style="text-indent:16">Era um sult&atilde;o <a href="#">bonacheir&atilde;o</a>.</div>
          <div style="text-indent:16">O sult&atilde;o ouvia, sorria e calava.</div>
        </b></font></td></tr></table>
        <img src="../../../images/Avancar.jpg">
      </div>
      <div id="Layer3">
        <font size="3" color="#666666"><b>
          <div style="line-height:150%">FIM</div>
        </b></font>
      </div>`;

    const story = parseStoryPage(html, { id: '10-05' });

    assert.deepEqual(story.textSegments, [
      {
        layer: 2,
        paragraphs: [
          'Era um sultão bonacheirão.',
          'O sultão ouvia, sorria e calava.'
        ]
      },
      { layer: 3, paragraphs: ['FIM'] }
    ]);
  });
});
