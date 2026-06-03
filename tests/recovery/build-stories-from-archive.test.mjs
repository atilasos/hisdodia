import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStoryFromArchiveDay,
  dateLabel,
  publicRecoveredPath,
  selectBestHtmlCapture,
  selectPreferredAsset
} from '../../src/recovery/build-stories-from-archive.mjs';

describe('build stories from archive', () => {
  it('formats Portuguese date labels', () => {
    assert.equal(dateLabel({ month: 1, day: 2 }), '2 de Janeiro');
    assert.equal(dateLabel({ month: 12, day: 31 }), '31 de Dezembro');
  });

  it('maps archive files to stable public recovered paths', () => {
    assert.equal(
      publicRecoveredPath('archive/0000/01/02/images/hash/Imagens/Background.jpg'),
      '/recovered/0000/01/02/images/hash/Imagens/Background.jpg'
    );
  });

  it('selects the HTML capture with the most story text', () => {
    const selected = selectBestHtmlCapture([
      { filePath: 'old.aspx', story: { title: 'Velho', textSegments: [{ paragraphs: ['a'] }] } },
      { filePath: 'new.aspx', story: { title: 'Novo', textSegments: [{ paragraphs: ['a', 'b'] }] } }
    ]);

    assert.equal(selected.filePath, 'new.aspx');
  });

  it('prefers background and icon assets from original image folders', () => {
    const files = [
      'archive/0000/01/02/images/x/propostas/ovelha.jpg',
      'archive/0000/01/02/images/y/Imagens/icone.jpg',
      'archive/0000/01/02/images/z/Imagens/Background.jpg'
    ];

    assert.equal(selectPreferredAsset(files, 'background'), files[2]);
    assert.equal(selectPreferredAsset(files, 'icon'), files[1]);
  });

  it('builds a structured story from a recovered archive day', async () => {
    const story = await buildStoryFromArchiveDay({ month: 1, day: 2 });

    assert.equal(story.id, '01-02');
    assert.equal(story.title, 'A Ovelha Generosa');
    assert.equal(story.author, 'António Torrado');
    assert.equal(story.illustrator, 'Cristina Malaquias');
    assert.ok(story.textSegments.length > 1);
    assert.match(story.textSegments[0].paragraphs[0], /ovelha muito generosa/i);
    assert.equal(story.assets.background, '/recovered/0000/01/02/images/n37tykwflvf4l2ymha2kucoqaly3vnr2/Imagens/Background.jpg');
    assert.equal(story.assets.icon, '/recovered/0000/01/02/images/koecejw3547232eyfpmc4zljkcylr625/Imagens/icone.jpg');
    assert.equal(story.assets.printPdf, '/recovered/0000/01/02/pdf/a3t5rujslajvm2s3jbidxpetzrtymdzf/imprimir.pdf');
    assert.equal(story.recovery.completeness, 'html-text');
  });
});
