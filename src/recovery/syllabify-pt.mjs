/**
 * Silabificador ortográfico conservador para português europeu.
 *
 * Regras cobertas:
 * - nh, lh e ch ficam no mesmo ataque; rr e ss dividem-se entre sílabas;
 * - qu/gu antes de e/i pertencem ao ataque e o u não cria núcleo;
 * - pr, br, tr, cr, dr, fr, gr, pl, bl, cl, fl e gl ficam juntos;
 * - ai, au, ei, eu, oi, ou e iu são tratados como ditongos, salvo ai/ei/oi
 *   antes de nh; ãe, ão e õe são ditongos nasais e ua depois de g/q é
 *   tratado como ditongo crescente;
 * - duas vogais fortes e i/u tónicos com acento formam hiato;
 * - vogais com til são núcleos vocálicos e preservam o ditongo nasal.
 *
 * A função prefere devolver null a adivinhar: rejeita hífen, apóstrofo,
 * caracteres alheios ao alfabeto português (incluindo k/w/y), vogais
 * repetidas, cadeias de três vogais e sequências vocálicas não abrangidas
 * pelas regras acima (incluindo ui, que pode representar ditongo ou hiato),
 * ataques iniciais impossíveis e terminações -air/-uir sem acento explícito.
 */

const VOWELS = new Set([...`aáàâãeéêiíoóôõuú`]);
const ACCENTED_WEAK_VOWELS = new Set(['í', 'ú']);
const STRONG_VOWELS = new Set([...`aáàâãeéêoóôõ`]);
const FALLING_DIPHTHONGS = new Set(['ai', 'au', 'ei', 'eu', 'oi', 'ou', 'iu']);
const NASAL_DIPHTHONGS = new Set(['ãe', 'ão', 'õe']);
const ONSET_CLUSTERS = new Set([
  'pr', 'br', 'tr', 'cr', 'dr', 'fr', 'gr',
  'pl', 'bl', 'cl', 'fl', 'gl', 'tl', 'vl', 'vr',
  'nh', 'lh', 'ch', 'qu', 'gu'
]);
const INITIAL_SINGLE_ONSETS = new Set([...`bcçdfghjlmnprstvxz`]);
const INITIAL_ONSET_CLUSTERS = new Set([
  'pr', 'br', 'tr', 'cr', 'dr', 'fr', 'gr',
  'pl', 'bl', 'cl', 'fl', 'gl', 'ch', 'qu', 'gu'
]);

function baseVowel(letter) {
  return letter.normalize('NFD').replace(/\p{M}/gu, '');
}

function isSilentU(word, index) {
  if (word[index] !== 'u' || index === 0 || index + 1 >= word.length) return false;
  return (word[index - 1] === 'q' || word[index - 1] === 'g')
    && ['e', 'é', 'ê', 'i', 'í'].includes(word[index + 1]);
}

function isVowelAt(word, index) {
  return VOWELS.has(word[index]) && !isSilentU(word, index);
}

function vowelPairKind(word, leftIndex, rightIndex) {
  const left = word[leftIndex];
  const right = word[rightIndex];
  const pair = `${baseVowel(left)}${baseVowel(right)}`;
  const literalPair = `${left}${right}`;

  if (left === right || baseVowel(left) === baseVowel(right)) return 'reject';
  if (NASAL_DIPHTHONGS.has(literalPair)) return 'join';
  if (ACCENTED_WEAK_VOWELS.has(left) || ACCENTED_WEAK_VOWELS.has(right)) return 'split';
  if (FALLING_DIPHTHONGS.has(pair)) return 'join';
  if (pair === 'ua' && leftIndex > 0 && ['g', 'q'].includes(word[leftIndex - 1])) return 'join';
  if (STRONG_VOWELS.has(left) && STRONG_VOWELS.has(right)) return 'split';
  return 'reject';
}

function findNuclei(word) {
  for (let start = 0; start < word.length; start += 1) {
    if (!isVowelAt(word, start)) continue;
    let end = start;
    while (end + 1 < word.length && isVowelAt(word, end + 1)) end += 1;
    const runLength = end - start + 1;
    const isKnownHiatusThenDiphthong = runLength === 3
      && vowelPairKind(word, start, start + 1) === 'split'
      && vowelPairKind(word, start + 1, start + 2) === 'join';
    if (runLength >= 3 && !isKnownHiatusThenDiphthong) return null;
    start = end;
  }

  const nuclei = [];
  for (let index = 0; index < word.length; index += 1) {
    if (!isVowelAt(word, index)) continue;

    let end = index;
    while (end + 1 < word.length && isVowelAt(word, end + 1)) {
      const kind = vowelPairKind(word, end, end + 1);
      if (kind === 'reject') return null;
      if (kind === 'split') break;
      end += 1;
    }
    nuclei.push({ start: index, end });
    index = end;
  }
  return nuclei;
}

function onsetLength(cluster) {
  if (cluster.length >= 2 && ONSET_CLUSTERS.has(cluster.slice(-2))) return 2;
  return 1;
}

function hasValidInitialOnset(word, firstNucleus) {
  if (firstNucleus.start === 0) return true;
  const onset = word.slice(0, firstNucleus.start);
  if (onset.length === 1) {
    return INITIAL_SINGLE_ONSETS.has(onset) || (onset === 'q' && word[1] === 'u');
  }
  return onset.length === 2 && INITIAL_ONSET_CLUSTERS.has(onset);
}

export function syllabifyPortuguese(input) {
  if (typeof input !== 'string') return null;
  const word = input.trim().normalize('NFC').toLocaleLowerCase('pt-PT');
  if (!word || !/^[a-jl-vxzçáàâãéêíóôõú]+$/u.test(word) || /[kwy]/u.test(word)) return null;
  if (/(?:ai|ei|oi|ui)(?=nh)/u.test(word) || /(?:air|uir)$/u.test(word)) return null;

  const nuclei = findNuclei(word);
  if (!nuclei || nuclei.length === 0) return null;
  if (!hasValidInitialOnset(word, nuclei[0])) return null;

  const boundaries = [0];
  for (let index = 0; index < nuclei.length - 1; index += 1) {
    const left = nuclei[index];
    const right = nuclei[index + 1];
    const clusterStart = left.end + 1;
    const cluster = word.slice(clusterStart, right.start);

    if (cluster.length === 0) {
      boundaries.push(right.start);
      continue;
    }

    if (cluster === 'rr' || cluster === 'ss') {
      boundaries.push(clusterStart + 1);
      continue;
    }

    boundaries.push(right.start - onsetLength(cluster));
  }
  boundaries.push(word.length);

  const syllables = [];
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const syllable = word.slice(boundaries[index], boundaries[index + 1]);
    if (!syllable || ![...syllable].some((_, offset) => isVowelAt(syllable, offset))) return null;
    syllables.push(syllable);
  }
  return syllables.join('') === word ? syllables : null;
}
