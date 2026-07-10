import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  captureReplayUrl,
  segmentSortKey,
  selectAudioCaptures
} from '../../src/recovery/recover-audio.mjs';

describe('recover audio helpers', () => {
  it('sorts Portuguese numbered audio segments in story order', () => {
    const names = ['dez.swf', 'dois.swf', 'um.swf', 'tres.swf', 'onze.swf'];

    assert.deepEqual(
      names.sort((a, b) => segmentSortKey(a) - segmentSortKey(b)),
      ['um.swf', 'dois.swf', 'tres.swf', 'dez.swf', 'onze.swf']
    );
  });

  it('selects latest successful SWF capture for each original segment', () => {
    const captures = selectAudioCaptures([
      {
        timestamp: '20080101000000',
        original: 'http://sons.historiadodia.pt/01/05/dois.swf',
        statuscode: '200',
        mimetype: 'application/x-shockwave-flash'
      },
      {
        timestamp: '20090101000000',
        original: 'http://sons.historiadodia.pt/01/05/dois.swf',
        statuscode: '200',
        mimetype: 'application/x-shockwave-flash'
      },
      {
        timestamp: '20090101000000',
        original: 'http://sons.historiadodia.pt/01/05/um.swf',
        statuscode: '200',
        mimetype: 'application/x-shockwave-flash'
      },
      {
        timestamp: '20090101000000',
        original: 'http://sons.historiadodia.pt/01/05/tres.gif',
        statuscode: '200',
        mimetype: 'image/gif'
      }
    ]);

    assert.deepEqual(
      captures.map((capture) => capture.original),
      [
        'http://sons.historiadodia.pt/01/05/um.swf',
        'http://sons.historiadodia.pt/01/05/dois.swf'
      ]
    );
    assert.equal(captures[1].timestamp, '20090101000000');
  });

  it('formats id_ replay URLs for binary SWF downloads', () => {
    assert.equal(
      captureReplayUrl({
        timestamp: '20081022160159',
        original: 'http://sons.historiadodia.pt/01/05/dois.swf'
      }),
      'https://web.archive.org/web/20081022160159id_/http://sons.historiadodia.pt/01/05/dois.swf'
    );
  });

  it('formats id_ replay URLs for arquivo.pt captures', () => {
    assert.equal(
      captureReplayUrl({
        timestamp: '20070724132414',
        original: 'http://sons.historiadodia.pt/12/08/dois.swf',
        archive: 'arquivo.pt'
      }),
      'https://arquivo.pt/wayback/20070724132414id_/http://sons.historiadodia.pt/12/08/dois.swf'
    );
  });
});
