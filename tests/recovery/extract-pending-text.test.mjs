import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  cleanPdfPage,
  extractPendingText,
  stitchPdfPageSegments,
  validateParagraphs
} from '../../src/recovery/extract-pending-text.mjs';

describe('pending PDF text extraction', () => {
  it('cleans a layout-preserving PDF page fixture into narrative paragraphs', async () => {
    const page = await readFile('tests/fixtures/recovery/pdf-page-layout.txt', 'utf8');

    assert.deepEqual(cleanPdfPage(page, {
      title: 'A Rainha das Peras',
      author: 'António Torrado'
    }), [
      'As pereiras dão peras. Não é novidade. Estranho seria se as pereiras dessem maçãs. Mas esta não é uma história vulgar.',
      'Acontecia as pessoas acordarem com a música a rodopiar nos ouvidos. Era bom.',
      '– Parece uma abóbora – disse o dono do pomar.'
    ]);
  });

  it('removes repeated footer and page-number lines', () => {
    const paragraphs = cleanPdfPage([
      '   Uma história começa aqui e continua',
      'sem lixo no meio do texto.',
      '',
      '                                             2',
      '© APENA - APDD',
      'Cofinanciado pelo POSI e pela Presidência do Conselho de Ministros'
    ].join('\n'), { title: 'Outro título', author: 'António Torrado' });

    assert.deepEqual(paragraphs, ['Uma história começa aqui e continua sem lixo no meio do texto.']);
  });

  it('joins a split reflexive suffix without duplicating its hyphen', () => {
    const paragraphs = cleanPdfPage([
      '   As outras viraram-',
      '-se para ela e começaram a conversar.'
    ].join('\n'), { title: 'As Moscas', author: 'António Torrado' });

    assert.deepEqual(paragraphs, ['As outras viraram-se para ela e começaram a conversar.']);
  });

  it('preserves an unindented continuation at the start of a later PDF page', async () => {
    const page = await readFile('tests/fixtures/recovery/pdf-page-continuation-layout.txt', 'utf8');

    assert.deepEqual(cleanPdfPage(page, {
      pageNumber: 3,
      title: 'O Destino da Música',
      author: 'António Torrado'
    }), [
      'bocadinhos de luz e de prata, roubados ao Sol.',
      'Estava eu na praia, a contemplar um pôr de Sol (sou coleccionador de pores de Sol, não sei se sabem).'
    ]);
  });

  it('stitches a page-opening continuation to the previous page paragraph', () => {
    assert.deepEqual(stitchPdfPageSegments([
      {
        layer: 'pdf-page-2',
        paragraphs: ['As ondas navegam, de mistura com algas, penas de gaivotas,']
      },
      {
        layer: 'pdf-page-3',
        paragraphs: [
          'bocadinhos de luz e de prata, roubados ao Sol.',
          'Estava eu na praia a contemplar o mar.'
        ]
      }
    ]), [
      {
        layer: 'pdf-page-2',
        paragraphs: ['As ondas navegam, de mistura com algas, penas de gaivotas, bocadinhos de luz e de prata, roubados ao Sol.']
      },
      {
        layer: 'pdf-page-3',
        paragraphs: ['Estava eu na praia a contemplar o mar.']
      }
    ]);
  });

  it('rejects empty text, PDF debris, URLs, punctuation noise, lowercase starts, low alphabetic ratios, and mojibake', () => {
    const result = validateParagraphs([
      '',
      'Página 3',
      'https://example.com',
      '……!!!',
      'começa por minúscula.',
      '12345 $$$$$',
      'Texto com mojibake Ã©.'
    ]);

    assert.equal(result.valid, false);
    assert.deepEqual(result.issues.map((issue) => issue.code), [
      'empty-paragraph',
      'pdf-debris',
      'url',
      'punctuation-noise',
      'invalid-start',
      'invalid-start',
      'mojibake'
    ]);
  });

  it('accepts clean Portuguese narrative text beginning with a capital or dash', () => {
    const result = validateParagraphs([
      'Era uma vez uma história muito bem contada.',
      '– Quem está aí? – perguntou a menina.',
      '- É!',
      '"Visitámos um planeta muito primitivo."',
      'Pôs um anúncio: "BOTA PARA HABITAÇÃO".'
    ]);

    assert.deepEqual(result, { valid: true, issues: [] });
  });

  it('writes identical bytes on repeated missing-text recovery runs', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'pending-text-idempotent-'));
    const storiesDir = path.join(root, 'stories');
    const inventoryPath = path.join(root, 'inventory.json');
    await mkdir(storiesDir);
    const storyPath = path.join(storiesDir, '01-21.json');
    await writeFile(inventoryPath, JSON.stringify({
      stories: [{ id: '01-21', route: 'missing', evidence: null }]
    }));
    await writeFile(storyPath, JSON.stringify({
      id: '01-21',
      textSegments: [{ layer: 'archive-placeholder', paragraphs: ['Pendente.'] }],
      recovery: { text: 'pending-extraction', completeness: 'needs-text-extraction' },
      provenance: { notes: 'Sem fonte.' },
      editorialNotes: []
    }));

    try {
      await extractPendingText({ inventoryPath, storiesDir });
      const first = await readFile(storyPath);
      await extractPendingText({ inventoryPath, storiesDir });
      const second = await readFile(storyPath);

      assert.deepEqual(second, first);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects an unavailable source before changing any story file', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'pending-text-preflight-'));
    const storiesDir = path.join(root, 'stories');
    const inventoryPath = path.join(root, 'inventory.json');
    await mkdir(storiesDir);
    const storyPath = path.join(storiesDir, '10-05.json');
    const original = `${JSON.stringify({
      id: '10-05',
      textSegments: [{ layer: 'archive-placeholder', paragraphs: ['Pendente.'] }],
      recovery: { text: 'pending-extraction', completeness: 'needs-text-extraction' }
    }, null, 2)}\n`;
    await writeFile(inventoryPath, JSON.stringify({
      stories: [{ id: '10-05', route: 'local-html', evidence: path.join(root, 'missing.aspx') }]
    }));
    await writeFile(storyPath, original);

    try {
      await assert.rejects(
        extractPendingText({ inventoryPath, storiesDir }),
        /Source unavailable for 10-05/
      );
      assert.equal(await readFile(storyPath, 'utf8'), original);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
