import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  cleanBlogStory,
  recoveredStory,
  segmentBlogCompilationText,
  selectConfirmedTitleStory,
  validateBlogParagraphs,
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
    assert.equal(toPortugueseTitleCase('QUEM É O REI?'), 'Quem é o Rei?');
  });

  it('accepts lowercase verse lines inside a consecutive short-line block', () => {
    const result = validateBlogParagraphs([
      'Dizia o trigo para o centeio:',
      '– Chega-te para lá, centeio centeiaço',
      'que tu não fazes',
      'as funções que eu faço.',
      'As espigas ficaram em silêncio.'
    ]);

    assert.deepEqual(result, { valid: true, issues: [] });
  });

  it('accepts enumerated lowercase items', () => {
    const result = validateBlogParagraphs([
      'O inventário continha:',
      'a) primeiro elemento;',
      'b) segundo elemento.'
    ]);

    assert.deepEqual(result, { valid: true, issues: [] });
  });

  it('still rejects an ordinary prose paragraph that starts with lowercase', () => {
    const result = validateBlogParagraphs([
      'Uma frase curta e completa.',
      'começa por minúscula.',
      'Outra frase curta e completa.'
    ]);

    assert.equal(result.valid, false);
    assert.deepEqual(result.issues.map(({ code, paragraphIndex }) => ({ code, paragraphIndex })), [
      { code: 'invalid-start', paragraphIndex: 1 }
    ]);
  });

  it('does not mistake a short prose dialogue for verse', () => {
    const result = validateBlogParagraphs([
      'O homem respondeu:',
      '– Sim.',
      'começa por minúscula'
    ]);

    assert.equal(result.valid, false);
    assert.deepEqual(result.issues.map(({ code, paragraphIndex }) => ({ code, paragraphIndex })), [
      { code: 'invalid-start', paragraphIndex: 2 }
    ]);
  });

  it('selects a compilation story by an externally confirmed title', () => {
    const stories = [
      { titleRaw: 'A MANIA DAS COLECÇÕES' },
      { titleRaw: 'QUEM É O REI?' }
    ];

    assert.equal(
      selectConfirmedTitleStory(stories, 'Quem é o Rei?'),
      stories[1]
    );
    assert.throws(
      () => selectConfirmedTitleStory(stories, 'Título Ausente'),
      /Confirmed title not found/
    );
  });

  it('records the February 24 discrepancy between the original listing and republication', () => {
    const updated = recoveredStory({
      id: '02-24',
      recovery: {},
      provenance: { notes: '' },
      editorialNotes: []
    }, {
      titleRaw: 'O ESPELHINHO',
      dayContext: null
    }, ['Naquela terra não havia espelhos.']);

    assert.ok(updated.editorialNotes.includes(
      'Na listagem mensal original preservada pelo Arquivo.pt, o dia 24 de Fevereiro surgia associado a «Uma História de Encantar com Batatas». A compilação republicada pelo blogue em 2019-2020 identifica explicitamente «O Espelhinho» como «24 de Fevereiro»; por isso, o título e o texto aqui apresentados seguem essa republicação, ficando registada a discrepância entre as fontes.'
    ));
  });
});
