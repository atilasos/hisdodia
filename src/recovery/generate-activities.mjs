#!/usr/bin/env node

import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { syllabifyPortuguese } from './syllabify-pt.mjs';

const WORD_PATTERN = /\p{L}+(?:[-'’]\p{L}+)*/gu;
const CONTENT_WORD_MIN_LENGTH = 4;
const CONTENT_WORD_MAX_LENGTH = 9;
const PREPARED_LEXICONS = new WeakMap();
const CORPUS_PROPER_NAMES = new WeakMap();

const STOPWORDS = new Set(`
  a à às ao aos o os as um uma uns umas
  de da das do dos dum duma em na nas no nos num numa
  por pela pelas pelo pelos para até após ante contra desde entre perante sem sob sobre trás
  e ou mas nem que se porque pois como quando enquanto embora contudo porém portanto também
  eu tu ele ela nós vós eles elas me te lhe nos vos lhes mim ti si comigo contigo consigo
  meu minha meus minhas teu tua teus tuas seu sua seus suas nosso nossa nossos nossas
  este esta estes estas esse essa esses essas aquele aquela aqueles aquelas isto isso aquilo
  deste desta destes destas desse dessa desses dessas daquele daquela daqueles daquelas
  neste nesta nestes nestas nesse nessa nesses nessas naquele naquela naqueles naquelas
  dele dela deles delas àquele àquela àqueles àquelas
  quem qual quais quanto quanta quantos quantas onde aqui ali aí cá lá
  não sim já ainda só muito muita muitos muitas pouco pouca poucos poucas mais menos tão tanto
  todo toda todos todas outro outra outros outras mesmo mesma mesmos mesmas cada algum alguma
  alguns algumas nenhum nenhuma nada algo tudo
  ser sou és é somos sois são era eras éramos eram fui foste foi fomos foram seja sejam sendo sido
  estar estou estás está estamos estão estava estavam estive esteve estiveram esteja estejam estando estado
  ter tenho tens tem temos têm tinha tinham tive teve tiveram tenha tenham tendo tido
  haver hei hás há havemos hão havia haviam houve houveram haja hajam havendo havido
  ir vou vais vai vamos vão ia iam fui foste foi fomos foram vá vão indo ido
  fazer faço faz fazes fazemos fazem fazia faziam fiz fez fizeram faça façam fazendo feito
  dizer digo dizes diz dizemos dizem dizia diziam disse disseram diga digam dizendo dito
  poder posso podes pode podemos podem podia podiam pude pôde puderam
  querer quero queres quer queremos querem queria queriam quis quiseram
  ver vejo vês vê vemos veem via viam vi viu viram
  dar dou dás dá damos dão dava davam dei deu deram
`.trim().split(/\s+/u));

export function normalizeWord(value) {
  if (typeof value !== 'string') return '';
  return value
    .trim()
    .normalize('NFC')
    .toLocaleLowerCase('pt-PT')
    .replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
}

function tokenize(text) {
  return [...String(text ?? '').matchAll(WORD_PATTERN)].map((match) => ({
    raw: match[0],
    normalized: normalizeWord(match[0]),
    index: match.index
  }));
}

export function extractReadableParagraphs(story) {
  return (story.textSegments ?? [])
    .filter((segment) => segment?.layer !== 'archive-placeholder')
    .flatMap((segment) => segment?.paragraphs ?? [])
    .map((paragraph) => String(paragraph).replace(/\s+/gu, ' ').trim())
    .filter(Boolean);
}

export function buildCorpusLexicon(stories) {
  const words = new Set();
  const capitalization = new Map();
  for (const story of stories) {
    for (const paragraph of extractReadableParagraphs(story)) {
      for (const token of tokenize(paragraph)) {
        if (!token.normalized) continue;
        words.add(token.normalized);
        if (!capitalization.has(token.normalized)) {
          capitalization.set(token.normalized, { lowercase: false, proper: false });
        }
        const evidence = capitalization.get(token.normalized);
        const startsUppercase = token.raw[0] !== token.raw[0].toLocaleLowerCase('pt-PT');
        if (!startsUppercase) evidence.lowercase = true;
        if (startsUppercase && !isSentenceStart(paragraph, token.index)) evidence.proper = true;
      }
    }
  }
  CORPUS_PROPER_NAMES.set(words, new Set(
    [...capitalization]
      .filter(([, evidence]) => evidence.proper && !evidence.lowercase)
      .map(([word]) => word)
  ));
  return words;
}

function glossaryTerms(story) {
  return new Set((story.glossary ?? []).map(({ term }) => normalizeWord(term)).filter(Boolean));
}

function isSentenceStart(text, index) {
  const prefix = text.slice(0, index).trimEnd();
  return prefix === '' || /[.!?…]["»”')\]]?$/u.test(prefix);
}

function wordRecords(story) {
  const records = new Map();
  const glossary = glossaryTerms(story);
  let order = 0;

  for (const paragraph of extractReadableParagraphs(story)) {
    for (const token of tokenize(paragraph)) {
      const word = token.normalized;
      if (!records.has(word)) {
        records.set(word, {
          word,
          count: 0,
          firstSeen: order,
          glossary: glossary.has(word),
          properEvidence: false
        });
      }
      const record = records.get(word);
      record.count += 1;
      const startsUppercase = token.raw[0] !== token.raw[0].toLocaleLowerCase('pt-PT');
      if (startsUppercase && !isSentenceStart(paragraph, token.index)) record.properEvidence = true;
      order += 1;
    }
  }

  return [...records.values()];
}

function letterLength(word) {
  return [...word].length;
}

function significantRecords(story) {
  return wordRecords(story)
    .filter(({ word }) => {
      const length = letterLength(word);
      return length >= CONTENT_WORD_MIN_LENGTH
        && length <= CONTENT_WORD_MAX_LENGTH
        && !STOPWORDS.has(word)
        && syllabifyPortuguese(word) !== null;
    })
    .sort((left, right) => {
      if (left.properEvidence !== right.properEvidence) return Number(left.properEvidence) - Number(right.properEvidence);
      const leftPriority = left.count >= 2 || left.glossary;
      const rightPriority = right.count >= 2 || right.glossary;
      if (leftPriority !== rightPriority) return Number(rightPriority) - Number(leftPriority);
      if (left.count !== right.count) return right.count - left.count;
      if (left.glossary !== right.glossary) return Number(right.glossary) - Number(left.glossary);
      return left.firstSeen - right.firstSeen;
    });
}

export function selectSignificantWords(story) {
  return significantRecords(story).map(({ word }) => word);
}

function rawSentences(paragraph) {
  return (paragraph.match(/[^.!?…]+(?:[.!?…]+|$)/gu) ?? [])
    .map((sentence) => sentence
      .replace(/\s+/gu, ' ')
      .trim()
      .replace(/^(?:["“«]\s*)?(?:[-–—]\s*)?/u, '')
      .replace(/^["“«]\s*/u, ''))
    .filter((sentence) => /^\p{Lu}/u.test(sentence) && /[.!?…]+$/u.test(sentence));
}

function truncateSentence(sentence) {
  if (sentence.length < 40) return null;
  if (sentence.length <= 140) return sentence;

  const start = 0;
  let end = Math.min(sentence.length, 136);
  if (end < sentence.length) {
    const previousSpace = sentence.lastIndexOf(' ', end);
    if (previousSpace > start) end = previousSpace;
  }

  const suffix = end < sentence.length ? '…' : '';
  const excerpt = sentence.slice(start, end).trim().replace(suffix ? /[\s,;:]+$/u : /$^/u, '');
  const result = `${excerpt}${suffix}`;
  return result.length >= 40 && result.length <= 140 ? result : null;
}

function sentenceContainsWord(sentence, word) {
  return tokenize(sentence).some(({ normalized }) => normalized === word);
}

function sentenceForWord(story, word, excludedSentences = new Set()) {
  for (const paragraph of extractReadableParagraphs(story)) {
    for (const sentence of rawSentences(paragraph)) {
      if (!sentenceContainsWord(sentence, word)) continue;
      const usable = truncateSentence(sentence);
      if (usable && !excludedSentences.has(usable) && sentenceContainsWord(usable, word)) return usable;
    }
  }
  return null;
}

function wordsHaveSimilarShape(left, right) {
  return left[0] === right[0] || Math.abs(letterLength(left) - letterLength(right)) <= 1;
}

export function generateFindWordActivity(story) {
  const words = selectSignificantWords(story);
  const rounds = [];
  const usedSentences = new Set();

  for (const target of words) {
    const sentence = sentenceForWord(story, target, usedSentences);
    if (!sentence) continue;
    const distractors = words.filter((word) => word !== target && wordsHaveSimilarShape(target, word)).slice(0, 3);
    if (distractors.length !== 3) continue;
    rounds.push({ target, distractors, sentence });
    usedSentences.add(sentence);
    if (rounds.length === 4) break;
  }

  if (rounds.length !== 4) return null;
  return { type: 'encontra-palavra', level: 'descobrir', rounds };
}

function syllableCounts(syllables) {
  const counts = new Map();
  for (const syllable of syllables) counts.set(syllable, (counts.get(syllable) ?? 0) + 1);
  return counts;
}

function canBuildWord(syllables, availableCounts) {
  const needed = syllableCounts(syllables);
  return [...needed].every(([syllable, count]) => (availableCounts.get(syllable) ?? 0) >= count);
}

function prepareCorpusLexicon(corpusLexicon) {
  if (PREPARED_LEXICONS.has(corpusLexicon)) return PREPARED_LEXICONS.get(corpusLexicon);
  const seen = new Set();
  const properNames = CORPUS_PROPER_NAMES.get(corpusLexicon) ?? new Set();
  const prepared = [...corpusLexicon]
    .map(normalizeWord)
    .filter((word) => {
      if (!word || seen.has(word)) return false;
      seen.add(word);
      return !properNames.has(word)
        && !STOPWORDS.has(word)
        && letterLength(word) >= CONTENT_WORD_MIN_LENGTH
        && letterLength(word) <= CONTENT_WORD_MAX_LENGTH;
    })
    .sort()
    .map((word) => ({ word, syllables: syllabifyPortuguese(word) }))
    .filter(({ syllables }) => syllables && syllables.length >= 2 && syllables.length <= 4);
  PREPARED_LEXICONS.set(corpusLexicon, prepared);
  return prepared;
}

export function generateWordFactoryActivity(story, corpusLexicon) {
  const storyWords = new Set(wordRecords(story).map(({ word }) => word));
  const composeCandidates = selectSignificantWords(story)
    .map((word) => ({ word, syllables: syllabifyPortuguese(word) }))
    .filter(({ syllables }) => syllables && syllables.length >= 2 && syllables.length <= 4)
    .slice(0, 14);

  if (composeCandidates.length < 3) return null;
  const candidateSyllables = new Set(composeCandidates.flatMap(({ syllables }) => syllables));
  const recombineCandidates = prepareCorpusLexicon(corpusLexicon)
    .filter(({ word, syllables }) => !storyWords.has(word)
      && syllables.every((syllable) => candidateSyllables.has(syllable)));

  for (let first = 0; first < composeCandidates.length - 2; first += 1) {
    for (let second = first + 1; second < composeCandidates.length - 1; second += 1) {
      for (let third = second + 1; third < composeCandidates.length; third += 1) {
        const compose = [composeCandidates[first], composeCandidates[second], composeCandidates[third]];
        const available = syllableCounts(compose.flatMap(({ syllables }) => syllables));
        const recombine = recombineCandidates
          .filter(({ syllables }) => canBuildWord(syllables, available))
          .slice(0, 3);
        if (recombine.length >= 2) {
          return {
            type: 'fabrica-palavras',
            level: 'descobrir',
            compose,
            recombine
          };
        }
      }
    }
  }
  return null;
}

export function generateMemoryActivities(story) {
  const words = selectSignificantWords(story).slice(0, 3);
  const activities = [];
  if (words.length === 3) {
    activities.push({
      type: 'jogo-memoria',
      level: 'descobrir',
      pairs: words.map((word) => ({ a: word, b: word }))
    });
  }

  const glossary = (story.glossary ?? [])
    .map(({ term, definition }) => ({ a: String(term ?? '').trim(), b: String(definition ?? '').trim() }))
    .filter(({ a, b }) => a && b)
    .slice(0, 4);
  if (glossary.length === 4) {
    activities.push({ type: 'jogo-memoria', level: 'aprofundar', pairs: glossary });
  }
  return activities;
}

function isLocalAsset(asset) {
  return typeof asset === 'string' && (asset.startsWith('/assets/') || asset.startsWith('/recovered/'));
}

export function generatePuzzleActivity(story) {
  const assets = story.assets ?? {};
  const image = [
    assets.background,
    assets.archiveBackground,
    assets.icon,
    assets.archiveIcon,
    ...(assets.gallery ?? [])
  ].find(isLocalAsset);
  if (!image) return null;

  return {
    type: 'puzzle-ilustracao',
    level: 'descobrir',
    image,
    grid: [3, 2],
    credit: String(story.illustrator ?? '').trim()
  };
}

function evenlySpaced(items, count) {
  if (items.length <= count) return items;
  return Array.from({ length: count }, (_, index) => items[Math.round(index * (items.length - 1) / (count - 1))]);
}

export function generateSequenceActivity(story) {
  const paragraphs = extractReadableParagraphs(story);
  if (paragraphs.length < 3) return null;

  const seen = new Set();
  const sentences = paragraphs
    .map((paragraph) => rawSentences(paragraph).map((sentence) => truncateSentence(sentence)).find(Boolean))
    .filter((sentence) => {
      if (!sentence || seen.has(sentence)) return false;
      seen.add(sentence);
      return true;
    });
  if (sentences.length < 3) return null;

  return {
    type: 'ordena-historia',
    level: 'aprofundar',
    sentences: evenlySpaced(sentences, Math.min(5, sentences.length))
  };
}

export function generateActivitiesForStory(story, corpusLexicon) {
  if (extractReadableParagraphs(story).length === 0) return null;

  const activities = [];
  const findWord = generateFindWordActivity(story);
  if (findWord) activities.push(findWord);
  const wordFactory = generateWordFactoryActivity(story, corpusLexicon);
  if (wordFactory) activities.push(wordFactory);
  activities.push(...generateMemoryActivities(story));
  const puzzle = generatePuzzleActivity(story);
  if (puzzle) activities.push(puzzle);
  const sequence = generateSequenceActivity(story);
  if (sequence) activities.push(sequence);

  if (activities.length < 2) return null;
  return {
    id: story.id,
    generatedFrom: 'recovered-text',
    generatorVersion: 1,
    activities
  };
}

export async function generateActivities({ storiesDir = 'data/stories', outputDir = 'data/activities' } = {}) {
  const files = (await readdir(storiesDir)).filter((file) => file.endsWith('.json')).sort();
  const stories = await Promise.all(files.map(async (file) => (
    JSON.parse(await readFile(path.join(storiesDir, file), 'utf8'))
  )));
  const corpusLexicon = buildCorpusLexicon(stories);

  await mkdir(outputDir, { recursive: true });
  const staleFiles = (await readdir(outputDir)).filter((file) => file.endsWith('.json'));
  await Promise.all(staleFiles.map((file) => rm(path.join(outputDir, file))));

  const generated = [];
  for (const story of stories) {
    const data = generateActivitiesForStory(story, corpusLexicon);
    if (!data) continue;
    const filePath = path.join(outputDir, `${story.id}.json`);
    await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`);
    generated.push(data);
  }
  return generated;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const generated = await generateActivities();
  console.log(`Wrote ${generated.length} activity files to data/activities`);
}
