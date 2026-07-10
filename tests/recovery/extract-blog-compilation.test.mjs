import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  cleanBlogStory,
  segmentBlogCompilationText,
  toPortugueseTitleCase
} from '../../src/recovery/extract-blog-compilation.mjs';

describe('blog compilation PDF extraction', () => {
  it('segments two-line titles and the credits variant with articles by explicit date', async () => {
    const text = await readFile('tests/recovery/fixtures/blog-compilation-headers.txt', 'utf8');

    const stories = segmentBlogCompilationText(text, {
      month: 10,
      monthName: 'Outubro'
    });

    assert.equal(stories.length, 2);
    assert.deepEqual(stories.map(({ day, titleRaw, dayContext }) => ({
      day,
      titleRaw,
      dayContext
    })), [
      {
        day: 8,
        titleRaw: 'VANTAGENS DA LEITURA',
        dayContext: 'Dia da Caça'
      },
      {
        day: 9,
        titleRaw: 'AS DUAS POMBAS',
        dayContext: 'Dia Mundial dos Correios'
      }
    ]);
  });

  it('cleans footers, page numbers, FIM, wrapping, and end-of-line hyphenation', async () => {
    const text = await readFile('tests/recovery/fixtures/blog-compilation-headers.txt', 'utf8');
    const [story] = segmentBlogCompilationText(text, {
      month: 10,
      monthName: 'Outubro'
    });

    assert.deepEqual(cleanBlogStory(story), [
      'Acontecia as pessoas acordarem com a música a rodopiar nos ouvidos. Era bom.',
      'As páginas abriam-se e a história começava O texto continuava na página seguinte e terminava aqui.'
    ]);
  });

  it('derives Portuguese title case without losing accents', () => {
    assert.equal(toPortugueseTitleCase('OS ÓCULOS DO SENHOR TÚLIO'), 'Os Óculos do Senhor Túlio');
  });
});
