import { formatStoryId } from './calendar.mjs';

function decodeHtml(value) {
  return value
    .replaceAll('&oacute;', 'ó')
    .replaceAll('&uacute;', 'ú')
    .replaceAll('&atilde;', 'ã')
    .replaceAll('&ccedil;', 'ç')
    .replaceAll('&ecirc;', 'ê')
    .replaceAll('&aacute;', 'á')
    .replaceAll('&eacute;', 'é')
    .replaceAll('&iacute;', 'í')
    .replaceAll('&nbsp;', ' ')
    .replaceAll(/<[^>]+>/g, '')
    .replaceAll(/\s+/g, ' ')
    .trim();
}

function firstMatch(input, pattern) {
  const match = input.match(pattern);
  return match ? match[1] : null;
}

export function parseMonthArchive(html, { month, sourceUrl }) {
  const rowPattern = /<tr align="left" valign="top">([\s\S]*?)<\/tr>/gi;
  const rows = [...html.matchAll(rowPattern)].map((match) => match[1]);

  return rows
    .map((row) => {
      const storyPath = firstMatch(row, /openwindow\('([^']+historia\.aspx)'\)/i);
      const iconPath = firstMatch(row, /<img src="([^"]*icone\.jpg)"/i);
      const title = firstMatch(row, /class="arquivo-titulos">([\s\S]*?)<\/span>/i);
      const dateLabel = firstMatch(row, /class="arquivo-data">([\s\S]*?)<\/span>/i);
      const dayContext = firstMatch(row, /class="arquivo-descricao">([\s\S]*?)<\/span>/i);

      if (!storyPath || !title || !dateLabel) {
        return null;
      }

      const day = Number(firstMatch(dateLabel, /(\d+)/));

      return {
        id: formatStoryId(month, day),
        month,
        day,
        title: decodeHtml(title),
        dateLabel: decodeHtml(dateLabel),
        dayContext: dayContext ? decodeHtml(dayContext) : null,
        storyPath,
        iconPath,
        sourceUrl
      };
    })
    .filter(Boolean);
}
