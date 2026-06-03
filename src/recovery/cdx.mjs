import { formatStoryId } from './calendar.mjs';

export function buildCdxUrl(pattern, options = {}) {
  const url = new URL('https://web.archive.org/cdx/search/cdx');
  url.searchParams.set('url', pattern);
  url.searchParams.set('output', 'json');
  url.searchParams.set('fl', 'timestamp,original,statuscode,mimetype,digest,length');
  url.searchParams.set('filter', 'statuscode:200');
  if (options.matchType) {
    url.searchParams.set('matchType', options.matchType);
  }
  if (options.collapse !== false) {
    url.searchParams.set('collapse', 'urlkey');
  }
  if (options.limit) {
    url.searchParams.set('limit', String(options.limit));
  }
  return url;
}

export function storyPageUrl({ month, day }) {
  const [monthPart, dayPart] = formatStoryId(month, day).split('-');
  return `http://www.historiadodia.pt/pt/historias/${monthPart}/${dayPart}/historia.aspx`;
}

export async function fetchCdx(pattern, options = {}) {
  const response = await fetch(buildCdxUrl(pattern, options));
  if (!response.ok) {
    throw new Error(`CDX request failed with ${response.status} for ${pattern}`);
  }
  const rows = await response.json();
  const [header, ...captures] = rows;
  return captures.map((capture) => Object.fromEntries(header.map((key, index) => [key, capture[index]])));
}
