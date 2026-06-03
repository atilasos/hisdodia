import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm, stat } from 'node:fs/promises';
import {
  audioSwfPattern,
  audioSwfPrefix,
  extractAudioFromSwf,
  inspectSwfAudio,
  parseSwfTags
} from '../../src/recovery/swf-audio.mjs';

describe('swf audio recovery', () => {
  it('formats a day-wide CDX pattern for all audio SWF segments', () => {
    assert.equal(audioSwfPattern({ month: 1, day: 5 }), 'sons.historiadodia.pt/01/05/*.swf');
    assert.equal(audioSwfPrefix({ month: 1, day: 5 }), 'sons.historiadodia.pt/01/05/');
  });

  it('detects stream audio tags in a real segmented SWF fixture', async () => {
    const tags = await parseSwfTags('tests/fixtures/audio/01-05-dois.swf');
    const audio = await inspectSwfAudio('tests/fixtures/audio/01-05-dois.swf');

    assert.equal(tags.some((tag) => tag.code === 18), true);
    assert.equal(tags.some((tag) => tag.code === 19), true);
    assert.equal(audio.hasAudio, true);
    assert.equal(audio.hasSoundStreamHead, true);
    assert.equal(audio.soundStreamBlocks > 100, true);
  });

  it('reports no recoverable audio tags for a small wrapper SWF fixture', async () => {
    const audio = await inspectSwfAudio('tests/fixtures/audio/01-01-um.swf');

    assert.equal(audio.hasAudio, false);
    assert.equal(audio.hasDefineSound, false);
    assert.equal(audio.soundStreamBlocks, 0);
  });

  it('extracts recoverable stream audio with ffmpeg', async () => {
    await rm('tmp/audio-test', { recursive: true, force: true });
    await mkdir('tmp/audio-test', { recursive: true });

    const result = await extractAudioFromSwf({
      swfPath: 'tests/fixtures/audio/01-05-dois.swf',
      outPath: 'tmp/audio-test/01-05-dois.mp3'
    });
    const info = await stat(result.outPath);

    assert.equal(result.extracted, true);
    assert.equal(result.audio.hasAudio, true);
    assert.ok(info.size > 300_000);
  });
});
