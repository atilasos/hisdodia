import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildCdxUrl, fetchCdx, storyPageUrl } from '../../src/recovery/cdx.mjs';

describe('cdx helpers', () => {
  it('builds a CDX query for a URL pattern', () => {
    const url = buildCdxUrl('www.historiadodia.pt/pt/*', { limit: 25 });

    assert.equal(url.hostname, 'web.archive.org');
    assert.equal(url.pathname, '/cdx/search/cdx');
    assert.equal(url.searchParams.get('url'), 'www.historiadodia.pt/pt/*');
    assert.equal(url.searchParams.get('output'), 'json');
    assert.equal(url.searchParams.get('fl'), 'timestamp,original,statuscode,mimetype,digest,length');
    assert.equal(url.searchParams.get('filter'), 'statuscode:200');
    assert.equal(url.searchParams.get('collapse'), 'urlkey');
    assert.equal(url.searchParams.get('limit'), '25');
  });

  it('formats original story page URLs', () => {
    assert.equal(
      storyPageUrl({ month: 1, day: 2 }),
      'http://www.historiadodia.pt/pt/historias/01/02/historia.aspx'
    );
  });

  it('maps CDX JSON header and capture rows to objects', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      assert.equal(url.searchParams.get('url'), 'www.historiadodia.pt/pt/*');
      assert.equal(url.searchParams.get('limit'), '2');
      return {
        ok: true,
        async json() {
          return [
            ['timestamp', 'original', 'statuscode', 'mimetype'],
            ['20200101000000', 'http://example.test/one', '200', 'text/html'],
            ['20200102000000', 'http://example.test/two', '200', 'text/html'],
          ];
        },
      };
    };

    try {
      const captures = await fetchCdx('www.historiadodia.pt/pt/*', { limit: 2 });

      assert.deepEqual(captures, [
        {
          timestamp: '20200101000000',
          original: 'http://example.test/one',
          statuscode: '200',
          mimetype: 'text/html',
        },
        {
          timestamp: '20200102000000',
          original: 'http://example.test/two',
          statuscode: '200',
          mimetype: 'text/html',
        },
      ]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('throws with status and pattern for non-OK CDX responses', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: false,
      status: 503,
    });

    try {
      await assert.rejects(
        fetchCdx('www.historiadodia.pt/pt/*'),
        /CDX request failed with 503 for www\.historiadodia\.pt\/pt\/\*/
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
