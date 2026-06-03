import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseMonthArchive } from '../../src/recovery/parse-month-archive.mjs';

describe('parseMonthArchive', () => {
  it('extracts story summaries from archive HTML', async () => {
    const html = await readFile('tests/fixtures/month-january.html', 'utf8');
    const stories = parseMonthArchive(html, { month: 1, sourceUrl: 'https://web.archive.org/sample' });

    assert.deepEqual(stories, [
      {
        id: '01-01',
        month: 1,
        day: 1,
        title: 'Moleiros e Carvoeiros',
        dateLabel: '1 de Janeiro',
        dayContext: 'Dia Mundial da Paz',
        storyPath: 'historias/01/01/historia.aspx',
        iconPath: 'Historias/01/01/Imagens/icone.jpg',
        sourceUrl: 'https://web.archive.org/sample'
      },
      {
        id: '01-02',
        month: 1,
        day: 2,
        title: 'A Ovelha Generosa',
        dateLabel: '2 de Janeiro',
        dayContext: null,
        storyPath: 'historias/01/02/historia.aspx',
        iconPath: 'Historias/01/02/Imagens/icone.jpg',
        sourceUrl: 'https://web.archive.org/sample'
      }
    ]);
  });
});
