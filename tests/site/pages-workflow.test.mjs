import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

describe('GitHub Pages workflow', () => {
  it('tests, builds with the configured base path, and deploys dist', async () => {
    const workflow = await readFile('.github/workflows/pages.yml', 'utf8');

    assert.match(workflow, /branches:\s*\[main\]/);
    assert.match(workflow, /actions\/checkout@v7/);
    assert.match(workflow, /actions\/setup-node@v7/);
    assert.match(workflow, /actions\/configure-pages@v6/);
    assert.match(workflow, /run:\s*npm run test:site/);
    assert.match(workflow, /run:\s*npm run build/);
    assert.match(workflow, /SITE_BASE_PATH:\s*\$\{\{ steps\.pages\.outputs\.base_path \}\}/);
    assert.match(workflow, /actions\/upload-pages-artifact@v5/);
    assert.match(workflow, /path:\s*\.\/dist/);
    assert.match(workflow, /actions\/deploy-pages@v5/);
    assert.match(workflow, /pages:\s*write/);
    assert.match(workflow, /id-token:\s*write/);
  });
});
