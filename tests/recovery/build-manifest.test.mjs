import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildManifest, renderRecoveryReport } from '../../src/recovery/build-manifest.mjs';

describe('buildManifest', () => {
  it('summarizes story recovery state', async () => {
    const manifest = await buildManifest({ storiesDir: 'data/stories' });

    assert.equal(manifest.totalStories, 1);
    assert.equal(manifest.stories[0].id, '01-01');
    assert.equal(manifest.stories[0].hasRecoveredText, true);
    assert.equal(manifest.stories[0].hasOriginalIllustration, true);
    assert.equal(manifest.stories[0].hasOriginalAudioReference, true);
    assert.equal(manifest.stories[0].hasRerecordedAudio, true);
    assert.equal(manifest.stories[0].hasPdf, true);
    assert.equal(manifest.stories[0].completeness, 'complete-pdf-text');
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
          hasOriginalAudioReference: false,
          hasRerecordedAudio: true
        }
      ]
    });

    assert.match(
      report,
      /\| test-date \| Recovered \\\| title with line break \| partial \\\| sample with note \| yes \| no \| yes \|/
    );
    assert.doesNotMatch(report, /Recovered \| title/);
    assert.doesNotMatch(report, /partial \| sample/);
  });
});
