import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function loadStories(storiesDir) {
  const files = (await readdir(storiesDir)).filter((file) => file.endsWith('.json')).sort();
  return Promise.all(files.map(async (file) => {
    const json = await readFile(path.join(storiesDir, file), 'utf8');
    return JSON.parse(json);
  }));
}

export async function buildManifest({ storiesDir }) {
  const stories = await loadStories(storiesDir);
  return {
    totalStories: stories.length,
    stories: stories.map((story) => ({
      id: story.id,
      title: story.title,
      dateLabel: story.dateLabel,
      hasRecoveredText: story.textSegments.some((segment) => segment.paragraphs.length > 0),
      hasOriginalIllustration: Boolean(story.assets.background || story.assets.icon),
      hasOriginalAudioReference: Boolean(story.assets.originalAudioSwf),
      hasRerecordedAudio: Boolean(story.assets.rerecordedAudio),
      hasPdf: Boolean(story.assets.printPdf),
      completeness: story.recovery.completeness
    }))
  };
}

function formatMarkdownTableCell(value) {
  return String(value).replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');
}

export function renderRecoveryReport(manifest) {
  const rows = manifest.stories.map((story) => (
    `| ${formatMarkdownTableCell(story.id)} | ${formatMarkdownTableCell(story.title)} | ${formatMarkdownTableCell(story.completeness)} | ${story.hasRecoveredText ? 'yes' : 'no'} | ${story.hasOriginalAudioReference ? 'yes' : 'no'} | ${story.hasRerecordedAudio ? 'yes' : 'no'} |`
  ));
  return [
    '# Recovery Report',
    '',
    `Total stories in manifest: ${manifest.totalStories}`,
    '',
    '| Date | Title | Completeness | Text | Original audio ref | Rerecorded audio |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows,
    ''
  ].join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const manifest = await buildManifest({ storiesDir: 'data/stories' });
  await writeFile('docs/recovery-report.md', renderRecoveryReport(manifest));
  console.log(`Wrote docs/recovery-report.md for ${manifest.totalStories} stories`);
}
