import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { contentTypeFor, resolveRequestPath } from '../../src/site/dev-server.mjs';

describe('dev server helpers', () => {
  it('resolves site paths inside the dist root', () => {
    const root = path.resolve('dist');

    assert.equal(resolveRequestPath('dist', '/'), root);
    assert.equal(resolveRequestPath('dist', '/archive/'), path.join(root, 'archive'));
    assert.equal(resolveRequestPath('dist', '/stories/01-01/'), path.join(root, 'stories', '01-01'));
  });

  it('rejects traversal outside the site root', () => {
    assert.equal(resolveRequestPath('dist', '/../package.json'), null);
    assert.equal(resolveRequestPath('dist', '/%2e%2e/package.json'), null);
  });

  it('returns stable content types for generated assets', () => {
    assert.equal(contentTypeFor('index.html'), 'text/html; charset=utf-8');
    assert.equal(contentTypeFor('styles.css'), 'text/css; charset=utf-8');
    assert.equal(contentTypeFor('app.js'), 'text/javascript; charset=utf-8');
    assert.equal(contentTypeFor('narracao.mp3'), 'audio/mpeg');
    assert.equal(contentTypeFor('legendas.vtt'), 'text/vtt; charset=utf-8');
    assert.equal(contentTypeFor('story.pdf'), 'application/pdf');
    assert.equal(contentTypeFor('asset.unknown'), 'application/octet-stream');
  });
});
