import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  archiveCapturePath,
  archiveDayDir,
  captureDayId,
  classifyCapture,
  dayPrefixes,
  selectUniqueCaptures
} from '../../src/recovery/download-archive.mjs';

describe('download archive helpers', () => {
  it('formats day archive directories and source prefixes', () => {
    assert.equal(archiveDayDir({ month: 1, day: 5 }), 'archive/0000/01/05');
    assert.deepEqual(dayPrefixes({ month: 1, day: 5 }), [
      'www.historiadodia.pt/pt/historias/01/05/',
      'www.historiadodia.pt/pt/Historias/01/05/',
      'sons.historiadodia.pt/01/05/'
    ]);
  });

  it('classifies captures by recovered asset type', () => {
    assert.equal(classifyCapture({ original: 'http://x/pt/historias/01/05/historia.aspx', mimetype: 'text/html' }), 'html');
    assert.equal(classifyCapture({ original: 'http://x/pt/historias/01/05/imprimir.pdf', mimetype: 'application/pdf' }), 'pdf');
    assert.equal(classifyCapture({ original: 'http://x/pt/historias/01/05/imagens/background.jpg', mimetype: 'image/jpeg' }), 'images');
    assert.equal(classifyCapture({ original: 'http://sons.historiadodia.pt/01/05/dois.swf', mimetype: 'application/x-shockwave-flash' }), 'audio');
  });

  it('keeps one latest capture for each digest and original URL', () => {
    const selected = selectUniqueCaptures([
      { timestamp: '2001', original: 'http://x/a', digest: 'same', statuscode: '200' },
      { timestamp: '2002', original: 'http://x/a', digest: 'same', statuscode: '200' },
      { timestamp: '2003', original: 'http://x/a', digest: 'changed', statuscode: '200' },
      { timestamp: '2004', original: 'http://x/b', digest: 'same', statuscode: '404' }
    ]);

    assert.deepEqual(
      selected.map((capture) => `${capture.original} ${capture.digest} ${capture.timestamp}`),
      ['http://x/a same 2002', 'http://x/a changed 2003']
    );
  });

  it('creates stable archive paths preserving nested original path hints', () => {
    const capture = {
      timestamp: '20081022160159',
      original: 'http://www.historiadodia.pt/pt/historias/01/05/Imagens/Background.jpg',
      mimetype: 'image/jpeg',
      digest: 'ABCDEF0123456789'
    };

    assert.equal(
      archiveCapturePath({ month: 1, day: 5 }, capture),
      'archive/0000/01/05/images/abcdef0123456789/Imagens/Background.jpg'
    );
  });

  it('extracts day ids from story and audio URLs', () => {
    assert.equal(captureDayId({ original: 'http://www.historiadodia.pt/pt/historias/02/14/historia.aspx' }), '02-14');
    assert.equal(captureDayId({ original: 'http://www.historiadodia.pt/pt/Historias/03/04/Imagens/icone.jpg' }), '03-04');
    assert.equal(captureDayId({ original: 'http://sons.historiadodia.pt/12/24/dois.swf' }), '12-24');
    assert.equal(captureDayId({ original: 'http://www.historiadodia.pt/pt/index.aspx' }), null);
  });
});
