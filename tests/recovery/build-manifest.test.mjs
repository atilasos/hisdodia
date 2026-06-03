import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildManifest, renderRecoveryReport } from '../../src/recovery/build-manifest.mjs';

describe('buildManifest', () => {
  it('summarizes story recovery state', async () => {
    const manifest = await buildManifest({ storiesDir: 'data/stories' });
    const firstStory = manifest.stories.find((story) => story.id === '01-01');
    const secondStory = manifest.stories.find((story) => story.id === '01-02');

    assert.equal(manifest.totalStories, 366);
    assert.equal(firstStory.hasRecoveredText, true);
    assert.equal(firstStory.hasOriginalIllustration, true);
    assert.equal(firstStory.hasOriginalAudioReference, true);
    assert.equal(firstStory.hasRecoveredAudio, false);
    assert.equal(firstStory.hasRerecordedAudio, true);
    assert.equal(firstStory.hasPdf, true);
    assert.equal(firstStory.completeness, 'complete-pdf-text');
    assert.equal(secondStory.hasRecoveredText, true);
    assert.equal(secondStory.hasOriginalIllustration, true);
    assert.equal(secondStory.hasRecoveredAudio, false);
    assert.equal(secondStory.hasPdf, true);
    assert.equal(secondStory.completeness, 'html-text');
  });

  it('escapes recovered content in report table cells', () => {
    const report = renderRecoveryReport({
      totalStories: 1,
      stories: [
        {
          id: 'test-date',
          title: 'Recovered | title\nwith line break',
          completeness: 'partial | sample\r\nwith note',
          hasRecoveredText: true,
          hasOriginalIllustration: true,
          hasOriginalAudioReference: false,
          hasRecoveredAudio: true,
          hasRerecordedAudio: true
        }
      ]
    });

    assert.match(
      report,
      /\| test-date \| Recovered \\\| title with line break \| partial \\\| sample with note \| yes \| yes \| no \| yes \| yes \|/
    );
    assert.doesNotMatch(report, /Recovered \| title/);
    assert.doesNotMatch(report, /partial \| sample/);
  });
});
