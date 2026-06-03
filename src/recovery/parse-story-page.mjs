const namedEntities = {
  amp: '&',
  quot: '"',
  apos: "'",
  lt: '<',
  gt: '>',
  nbsp: ' ',
  iexcl: '¡',
  cent: '¢',
  pound: '£',
  curren: '¤',
  yen: '¥',
  brvbar: '¦',
  sect: '§',
  uml: '¨',
  copy: '©',
  ordf: 'ª',
  laquo: '«',
  not: '¬',
  shy: '\u00ad',
  reg: '®',
  macr: '¯',
  deg: '°',
  plusmn: '±',
  sup2: '²',
  sup3: '³',
  acute: '´',
  micro: 'µ',
  para: '¶',
  middot: '·',
  cedil: '¸',
  sup1: '¹',
  ordm: 'º',
  raquo: '»',
  frac14: '¼',
  frac12: '½',
  frac34: '¾',
  iquest: '¿',
  times: '×',
  divide: '÷',
  Aacute: 'Á',
  Agrave: 'À',
  Acirc: 'Â',
  Auml: 'Ä',
  Atilde: 'Ã',
  Aring: 'Å',
  AElig: 'Æ',
  Ccedil: 'Ç',
  Eacute: 'É',
  Egrave: 'È',
  Ecirc: 'Ê',
  Euml: 'Ë',
  Iacute: 'Í',
  Igrave: 'Ì',
  Icirc: 'Î',
  Iuml: 'Ï',
  ETH: 'Ð',
  Ntilde: 'Ñ',
  Oacute: 'Ó',
  Ograve: 'Ò',
  Ocirc: 'Ô',
  Otilde: 'Õ',
  Ouml: 'Ö',
  Oslash: 'Ø',
  Uacute: 'Ú',
  Ugrave: 'Ù',
  Ucirc: 'Û',
  Uuml: 'Ü',
  Yacute: 'Ý',
  THORN: 'Þ',
  szlig: 'ß',
  aacute: 'á',
  agrave: 'à',
  acirc: 'â',
  auml: 'ä',
  atilde: 'ã',
  aring: 'å',
  aelig: 'æ',
  ccedil: 'ç',
  eacute: 'é',
  egrave: 'è',
  ecirc: 'ê',
  euml: 'ë',
  iacute: 'í',
  igrave: 'ì',
  icirc: 'î',
  iuml: 'ï',
  eth: 'ð',
  ntilde: 'ñ',
  oacute: 'ó',
  ograve: 'ò',
  ocirc: 'ô',
  otilde: 'õ',
  ouml: 'ö',
  oslash: 'ø',
  uacute: 'ú',
  ugrave: 'ù',
  ucirc: 'û',
  uuml: 'ü',
  yacute: 'ý',
  thorn: 'þ',
  yuml: 'ÿ',
  OElig: 'Œ',
  oelig: 'œ',
  Scaron: 'Š',
  scaron: 'š',
  Yuml: 'Ÿ',
  fnof: 'ƒ',
  circ: 'ˆ',
  tilde: '˜',
  ensp: ' ',
  emsp: ' ',
  thinsp: ' ',
  zwnj: '',
  zwj: '',
  lrm: '',
  rlm: '',
  ndash: '–',
  mdash: '—',
  lsquo: '‘',
  rsquo: '’',
  sbquo: '‚',
  ldquo: '“',
  rdquo: '”',
  bdquo: '„',
  dagger: '†',
  Dagger: '‡',
  bull: '•',
  hellip: '…',
  permil: '‰',
  prime: '′',
  Prime: '″',
  lsaquo: '‹',
  rsaquo: '›',
  euro: '€',
  trade: '™',
  Alpha: 'Α',
  Beta: 'Β',
  Gamma: 'Γ',
  Delta: 'Δ',
  Epsilon: 'Ε',
  Zeta: 'Ζ',
  Eta: 'Η',
  Theta: 'Θ',
  Iota: 'Ι',
  Kappa: 'Κ',
  Lambda: 'Λ',
  Mu: 'Μ',
  Nu: 'Ν',
  Xi: 'Ξ',
  Omicron: 'Ο',
  Pi: 'Π',
  Rho: 'Ρ',
  Sigma: 'Σ',
  Tau: 'Τ',
  Upsilon: 'Υ',
  Phi: 'Φ',
  Chi: 'Χ',
  Psi: 'Ψ',
  Omega: 'Ω',
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  epsilon: 'ε',
  zeta: 'ζ',
  eta: 'η',
  theta: 'θ',
  iota: 'ι',
  kappa: 'κ',
  lambda: 'λ',
  mu: 'μ',
  nu: 'ν',
  xi: 'ξ',
  omicron: 'ο',
  pi: 'π',
  rho: 'ρ',
  sigmaf: 'ς',
  sigma: 'σ',
  tau: 'τ',
  upsilon: 'υ',
  phi: 'φ',
  chi: 'χ',
  psi: 'ψ',
  omega: 'ω',
  thetasym: 'ϑ',
  upsih: 'ϒ',
  piv: 'ϖ',
  spades: '♠',
  clubs: '♣',
  hearts: '♥',
  diams: '♦',
  loz: '◊',
  larr: '←',
  uarr: '↑',
  rarr: '→',
  darr: '↓',
  harr: '↔',
  crarr: '↵',
  forall: '∀',
  part: '∂',
  exist: '∃',
  empty: '∅',
  nabla: '∇',
  isin: '∈',
  notin: '∉',
  ni: '∋',
  prod: '∏',
  sum: '∑',
  minus: '−',
  lowast: '∗',
  radic: '√',
  prop: '∝',
  infin: '∞',
  ang: '∠',
  and: '∧',
  or: '∨',
  cap: '∩',
  cup: '∪',
  int: '∫',
  there4: '∴',
  sim: '∼',
  cong: '≅',
  asymp: '≈',
  ne: '≠',
  equiv: '≡',
  le: '≤',
  ge: '≥',
  sub: '⊂',
  sup: '⊃',
  nsub: '⊄',
  sube: '⊆',
  supe: '⊇',
  oplus: '⊕',
  otimes: '⊗',
  perp: '⊥',
  sdot: '⋅',
  lceil: '⌈',
  rceil: '⌉',
  lfloor: '⌊',
  rfloor: '⌋',
  lang: '〈',
  rang: '〉'
};

function decodeEntity(entity) {
  if (entity.startsWith('#x') || entity.startsWith('#X')) {
    const codePoint = Number.parseInt(entity.slice(2), 16);
    return Number.isNaN(codePoint) || codePoint > 0x10ffff ? `&${entity};` : String.fromCodePoint(codePoint);
  }

  if (entity.startsWith('#')) {
    const codePoint = Number.parseInt(entity.slice(1), 10);
    return Number.isNaN(codePoint) || codePoint > 0x10ffff ? `&${entity};` : String.fromCodePoint(codePoint);
  }

  return namedEntities[entity] ?? `&${entity};`;
}

function decodeHtml(value) {
  return value
    .replaceAll(/&(#\d+|#x[\da-f]+|[a-z][\da-z]+);/gi, (_, entity) => decodeEntity(entity))
    .replaceAll(/\s+/g, ' ')
    .trim();
}

function stripTags(value) {
  return decodeHtml(value.replaceAll(/<[^>]+>/g, ' '));
}

function firstMatch(input, pattern) {
  const match = input.match(pattern);
  return match ? match[1] : null;
}

function getQuotedAttribute(attributes, name) {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*(['"])(.*?)\\1`, 'i');
  const match = attributes.match(pattern);
  return match ? decodeHtml(match[2]) : null;
}

function hasClassToken(attributes, className) {
  const classValue = getQuotedAttribute(attributes, 'class');
  return classValue ? classValue.split(/\s+/).includes(className) : false;
}

function parseGlossary(html) {
  const pattern = /Text\s*\[\s*(\d+)\s*\]\s*=\s*\[\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\]/g;
  return [...html.matchAll(pattern)].map((match) => ({
    id: match[1],
    term: decodeHtml(match[2]),
    definition: decodeHtml(match[3])
  }));
}

function parseTextSegments(html) {
  const layerStartPattern = /<div\b(?=[^>]*\bid\s*=\s*(['"])Layer(\d+)\1)[^>]*>/gi;
  const layerStarts = [...html.matchAll(layerStartPattern)];

  return layerStarts
    .flatMap((layerMatch, index) => {
      const nextLayer = layerStarts[index + 1];
      const layerHtml = html.slice(layerMatch.index + layerMatch[0].length, nextLayer?.index);
      const textFonts = [...layerHtml.matchAll(/<font\b([^>]*)>([\s\S]*?)<\/font>/gi)]
        .filter((fontMatch) => hasClassToken(fontMatch[1], 'historia-text'));

      return textFonts.map((fontMatch) => {
        const paragraphs = [...fontMatch[2].matchAll(/<div[^>]*>([\s\S]*?)<\/div>/gi)]
          .map((paragraph) => stripTags(paragraph[1]))
          .filter(Boolean);
        return {
          layer: Number(layerMatch[2]),
          paragraphs
        };
      });
    })
    .filter((segment) => segment.paragraphs.length > 0);
}

export function parseStoryPage(html, base) {
  const title = firstMatch(html, /class="atitulohistoria"><b>\s*([\s\S]*?)<\/b>/i);
  const author = firstMatch(html, /class="anomeautores"><b>\s*([\s\S]*?)<\/b>/i);
  const illustrator = firstMatch(html, /class="anomeilustrador">\s*<b>\s*([\s\S]*?)<\/b>/i);

  return {
    ...base,
    title: title ? stripTags(title) : null,
    author: author ? stripTags(author) : null,
    illustrator: illustrator ? stripTags(illustrator) : null,
    textSegments: parseTextSegments(html),
    glossary: parseGlossary(html),
    assets: {
      background: firstMatch(html, /background="([^"]+)"/i),
      printPdf: firstMatch(html, /href="([^"]*imprimir\.pdf)"/i),
      originalAudioSwf: firstMatch(html, /value="(http:\/\/sons\.historiadodia\.pt\/[^"]+\.swf)"/i)
    },
    provenance: {
      sourceUrl: base.sourceUrl
    }
  };
}
