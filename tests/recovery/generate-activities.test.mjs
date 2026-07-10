import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  buildCorpusLexicon,
  extractReadableParagraphs,
  generateActivities,
  generateActivitiesForStory,
  generateFindWordActivity,
  generateMemoryActivities,
  generatePuzzleActivity,
  generateSequenceActivity,
  generateWordFactoryActivity,
  normalizeWord,
  selectSignificantWords
} from '../../src/recovery/generate-activities.mjs';

function makeStory(overrides = {}) {
  return {
    id: '03-04',
    illustrator: 'Ana Ilustradora',
    textSegments: [
      {
        layer: 'html-layer-2',
        paragraphs: [
          'A casa colorida ficava junto do caminho tranquilo da pequena aldeia.',
          'Na casa, o cavalo castanho encontrava o casaco caído todas as manhãs.',
          'Depois, o caminho levava o cavalo e o casaco até ao campo distante.',
          'Por fim, a casa guardava o casaco enquanto o cavalo voltava contente.',
          'Todos recordavam a casa, o cavalo, o casaco e o caminho daquela aventura.'
        ]
      }
    ],
    glossary: [],
    assets: {},
    ...overrides
  };
}

describe('generator helpers', () => {
  it('normalizes words while preserving accents', () => {
    assert.equal(normalizeWord('  PÁSSARO! '), 'pássaro');
    assert.equal(normalizeWord('coração'), 'coração');
  });

  it('reads only non-placeholder paragraphs', () => {
    const story = makeStory({
      textSegments: [
        { layer: 'archive-placeholder', paragraphs: ['Texto indisponível.'] },
        { layer: 'html-layer-2', paragraphs: ['Texto recuperado e legível para a história.'] }
      ]
    });

    assert.deepEqual(extractReadableParagraphs(story), ['Texto recuperado e legível para a história.']);
  });

  it('builds the in-memory lexicon from all and only readable stories', () => {
    const lexicon = buildCorpusLexicon([
      makeStory({ textSegments: [{ layer: 'html-layer-2', paragraphs: ['Árvore, casa e coração.'] }] }),
      makeStory({ id: '03-05', textSegments: [{ layer: 'html-layer-2', paragraphs: ['Outra CASA bonita.'] }] }),
      makeStory({ id: '03-06', textSegments: [{ layer: 'archive-placeholder', paragraphs: ['Segredo ausente.'] }] })
    ]);

    assert.deepEqual([...lexicon].sort(), ['bonita', 'casa', 'coração', 'e', 'outra', 'árvore']);
    assert.equal(lexicon.has('segredo'), false);
  });

  it('selects content words of 4-9 letters and prioritizes recurring words', () => {
    const selected = selectSignificantWords(makeStory());

    assert.deepEqual(selected.slice(0, 4), ['casa', 'cavalo', 'casaco', 'caminho']);
    assert.equal(selected.includes('enquanto'), false);
    assert.equal(selected.includes('daquela'), false);
    assert.equal(selected.includes('colorida'), true);
  });
});

describe('activity generators', () => {
  it('creates four find-word rounds with real, similar distractors and story sentences', () => {
    const activity = generateFindWordActivity(makeStory());

    assert.equal(activity.type, 'encontra-palavra');
    assert.equal(activity.level, 'descobrir');
    assert.equal(activity.rounds.length, 4);
    assert.equal(new Set(activity.rounds.map(({ sentence }) => sentence)).size, 4);
    for (const round of activity.rounds) {
      assert.equal(round.distractors.length, 3);
      assert.equal(new Set([round.target, ...round.distractors]).size, 4);
      assert.match(round.sentence.toLocaleLowerCase('pt-PT'), new RegExp(round.target, 'u'));
      for (const distractor of round.distractors) {
        const similar = distractor[0] === round.target[0]
          || Math.abs([...distractor].length - [...round.target].length) <= 1;
        assert.equal(similar, true);
      }
    }
  });

  it('creates compose words and corpus-validated recombinations', () => {
    const story = makeStory({
      textSegments: [{
        layer: 'html-layer-2',
        paragraphs: [
          'A casa guardava um pato enquanto uma vela iluminava a sala tranquila.',
          'O pato saiu da casa e deixou a vela acesa perto da janela aberta.',
          'Mais tarde, a vela guiou o pato de regresso à casa silenciosa.'
        ]
      }]
    });
    const lexicon = new Set(['capa', 'pala', 'toca', 'palavra-inválida']);
    const activity = generateWordFactoryActivity(story, lexicon);

    assert.deepEqual(activity.compose, [
      { word: 'casa', syllables: ['ca', 'sa'] },
      { word: 'pato', syllables: ['pa', 'to'] },
      { word: 'vela', syllables: ['ve', 'la'] }
    ]);
    assert.deepEqual(activity.recombine, [
      { word: 'capa', syllables: ['ca', 'pa'] },
      { word: 'pala', syllables: ['pa', 'la'] },
      { word: 'toca', syllables: ['to', 'ca'] }
    ]);
  });

  it('excludes corpus words used only as capitalized proper names from recombination', () => {
    const story = makeStory({
      textSegments: [{
        layer: 'html-layer-2',
        paragraphs: [
          'A casa guardava um pato enquanto uma vela iluminava a sala tranquila.',
          'O pato saiu da casa e deixou a vela acesa perto da janela aberta.',
          'Mais tarde, a vela guiou o pato de regresso à casa silenciosa.'
        ]
      }]
    });
    const lexicon = buildCorpusLexicon([
      makeStory({
        id: '03-05',
        textSegments: [{
          layer: 'html-layer-2',
          paragraphs: ['A menina Capa entrou na sala. Uma pala caiu no chão. Depois viu a toca vazia.']
        }]
      })
    ]);

    assert.deepEqual(generateWordFactoryActivity(story, lexicon).recombine, [
      { word: 'pala', syllables: ['pa', 'la'] },
      { word: 'toca', syllables: ['to', 'ca'] }
    ]);
  });

  it('creates deeper memory only when four glossary pairs can make eight cards', () => {
    const withoutGlossary = generateMemoryActivities(makeStory());
    assert.equal(withoutGlossary.length, 1);
    assert.equal(withoutGlossary[0].level, 'descobrir');
    assert.equal(withoutGlossary[0].pairs.length, 3);

    const threeGlossaryEntries = generateMemoryActivities(makeStory({
      glossary: [
        { term: 'aldeia', definition: 'povoação pequena' },
        { term: 'casaco', definition: 'peça de roupa' },
        { term: 'sereno', definition: 'calmo' }
      ]
    }));
    assert.equal(threeGlossaryEntries.length, 1);

    const invalidFourthGlossaryEntry = generateMemoryActivities(makeStory({
      glossary: [
        { term: 'aldeia', definition: 'povoação pequena' },
        { term: 'casaco', definition: 'peça de roupa' },
        { term: 'sereno', definition: 'calmo' },
        { term: 'caminho', definition: '' }
      ]
    }));
    assert.equal(invalidFourthGlossaryEntry.length, 1);

    const withGlossary = generateMemoryActivities(makeStory({
      glossary: [
        { term: 'aldeia', definition: 'povoação pequena' },
        { term: 'casaco', definition: 'peça de roupa' },
        { term: 'sereno', definition: 'calmo' },
        { term: 'caminho', definition: 'percurso' }
      ]
    }));
    assert.equal(withGlossary.length, 2);
    assert.deepEqual(withGlossary[1], {
      type: 'jogo-memoria',
      level: 'aprofundar',
      pairs: [
        { a: 'aldeia', b: 'povoação pequena' },
        { a: 'casaco', b: 'peça de roupa' },
        { a: 'sereno', b: 'calmo' },
        { a: 'caminho', b: 'percurso' }
      ]
    });
  });

  it('uses only local recovered illustrations for puzzles', () => {
    assert.equal(generatePuzzleActivity(makeStory({
      assets: { background: 'https://example.test/background.jpg' }
    })), null);

    assert.deepEqual(generatePuzzleActivity(makeStory({
      assets: { background: '/recovered/0000/03/04/images/hash/Background.jpg' }
    })), {
      type: 'puzzle-ilustracao',
      level: 'descobrir',
      image: '/recovered/0000/03/04/images/hash/Background.jpg',
      grid: [3, 2],
      credit: 'Ana Ilustradora'
    });
  });

  it('extracts three to five ordered story sentences only when enough paragraphs support it', () => {
    const activity = generateSequenceActivity(makeStory());
    assert.equal(activity.type, 'ordena-historia');
    assert.equal(activity.sentences.length, 5);
    assert.match(activity.sentences[0], /^A casa colorida/);
    assert.match(activity.sentences.at(-1), /^Todos recordavam/);

    assert.equal(generateSequenceActivity(makeStory({
      textSegments: [{ layer: 'html-layer-2', paragraphs: ['Uma frase longa e utilizável sobre a casa tranquila.', 'Outra frase curta.'] }]
    })), null);

    const withoutFragment = generateSequenceActivity(makeStory({
      textSegments: [{
        layer: 'html-layer-2',
        paragraphs: [
          'A primeira frase completa apresenta a casa no início da história.',
          'Uma introdução incompleta que anuncia a fala seguinte:',
          'A segunda frase completa mostra o caminho seguido pelo cavalo.',
          'A terceira frase completa encerra a aventura com toda a serenidade.'
        ]
      }]
    }));
    assert.equal(withoutFragment.sentences.length, 3);
    assert.equal(withoutFragment.sentences.some((sentence) => sentence.endsWith(':')), false);
  });

  it('rejects lowercase and punctuation-led fragments and removes repeated sentences', () => {
    const activity = generateSequenceActivity(makeStory({
      textSegments: [{
        layer: 'html-layer-2',
        paragraphs: [
          '), deram-lhe um banho demorado e cheio de espuma.',
          ', porque desta vez ninguém quis esperar pelo cavalo.',
          'perguntou o homem, apontando a de barro.',
          '— A primeira frase válida apresenta o começo desta aventura.',
          'A primeira frase válida apresenta o começo desta aventura.',
          '“A segunda frase válida mostra uma mudança importante na história.',
          'A terceira frase válida encerra a história com toda a serenidade.'
        ]
      }]
    }));

    assert.deepEqual(activity.sentences, [
      'A primeira frase válida apresenta o começo desta aventura.',
      'A segunda frase válida mostra uma mudança importante na história.',
      'A terceira frase válida encerra a história com toda a serenidade.'
    ]);
  });

  it('removes orphan punctuation before a truncation ellipsis', async () => {
    const story = JSON.parse(await readFile('data/stories/12-09.json', 'utf8'));
    const activity = generateSequenceActivity(story);

    for (const sentence of activity.sentences) {
      assert.doesNotMatch(sentence, /[\s,;:]…/u);
    }
  });

  it('keeps truncated find-word excerpts anchored at a complete sentence start', async () => {
    const story = JSON.parse(await readFile('data/stories/01-01.json', 'utf8'));
    const activity = generateFindWordActivity(story);

    assert.ok(activity);
    for (const { sentence } of activity.rounds) {
      assert.match(sentence, /^\p{Lu}/u);
    }
  });
});

describe('complete activity generation', () => {
  it('returns no data for placeholder-only stories', () => {
    const story = makeStory({
      textSegments: [{ layer: 'archive-placeholder', paragraphs: ['História ainda não recuperada.'] }]
    });

    assert.equal(generateActivitiesForStory(story, new Set()), null);
  });

  it('publishes only supported activities and always at least two', () => {
    const data = generateActivitiesForStory(makeStory(), new Set());

    assert.equal(data.id, '03-04');
    assert.equal(data.generatedFrom, 'recovered-text');
    assert.equal(data.generatorVersion, 1);
    assert.ok(data.activities.length >= 2);
    assert.equal(data.activities.some(({ type, level }) => type === 'jogo-memoria' && level === 'aprofundar'), false);
    assert.equal(data.activities.some(({ type }) => type === 'puzzle-ilustracao'), false);
  });

  it('writes no placeholder file and produces identical bytes on repeated runs', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'activities-test-'));
    const storiesDir = path.join(root, 'stories');
    const outputDir = path.join(root, 'activities');
    await mkdir(storiesDir);
    await writeFile(path.join(storiesDir, '03-04.json'), `${JSON.stringify(makeStory())}\n`);
    await writeFile(path.join(storiesDir, '03-05.json'), `${JSON.stringify(makeStory({
      id: '03-05',
      textSegments: [{ layer: 'archive-placeholder', paragraphs: ['Texto indisponível.'] }]
    }))}\n`);

    try {
      await generateActivities({ storiesDir, outputDir });
      const first = await readFile(path.join(outputDir, '03-04.json'), 'utf8');
      assert.deepEqual(await readdir(outputDir), ['03-04.json']);
      const parsed = JSON.parse(first);
      assert.ok(parsed.activities.length >= 2);

      await generateActivities({ storiesDir, outputDir });
      const second = await readFile(path.join(outputDir, '03-04.json'), 'utf8');
      assert.equal(second, first);
      assert.deepEqual(await readdir(outputDir), ['03-04.json']);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
