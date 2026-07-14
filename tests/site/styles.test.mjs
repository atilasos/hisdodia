import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

let stylesheet;

before(async () => {
  stylesheet = await readFile('src/site/public/styles.css', 'utf8');
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function blockFor(source, selector) {
  let start = -1;

  for (let open = source.indexOf('{'); open !== -1; open = source.indexOf('{', open + 1)) {
    const boundary = Math.max(source.lastIndexOf('{', open - 1), source.lastIndexOf('}', open - 1));
    if (source.slice(boundary + 1, open).trim() === selector) {
      start = open;
      break;
    }
  }

  assert.notEqual(start, -1, `expected block for ${selector}`);
  let depth = 0;

  for (let index = start; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start + 1, index);
  }

  assert.fail(`expected closing brace for ${selector}`);
}

function assertDeclaration(block, property, value) {
  assert.match(
    block,
    new RegExp(`(?:^|;)\\s*${escapeRegExp(property)}:\\s*${escapeRegExp(value)}\\s*;`),
    `expected ${property}: ${value}`
  );
}

describe('illustrated book styles', () => {
  it('keeps ordinary and illustrated readers at their distinct measures', () => {
    assertDeclaration(blockFor(stylesheet, '.reader'), 'max-width', '72ch');
    assertDeclaration(blockFor(stylesheet, '.reader-illustrated'), 'max-width', '72rem');
    assertDeclaration(blockFor(stylesheet, '.illustrated-text'), 'max-width', '65ch');
    assertDeclaration(blockFor(stylesheet, '.illustrated-text'), 'margin-inline', 'auto');
  });

  it('bounds and positions each non-opening scene layout', () => {
    const doublePage = blockFor(stylesheet, '.scene-double-page');
    assertDeclaration(doublePage, 'width', 'min(72rem, calc(100vw - 2rem))');
    assertDeclaration(doublePage, 'margin-inline', '50%');
    assertDeclaration(doublePage, 'transform', 'translateX(-50%)');

    assertDeclaration(blockFor(stylesheet, '.scene-marginal'), 'width', 'min(18rem, 42%)');
    assertDeclaration(blockFor(stylesheet, '.scene-side-left'), 'float', 'inline-start');
    assertDeclaration(blockFor(stylesheet, '.scene-side-right'), 'float', 'inline-end');

    const vignette = blockFor(stylesheet, '.scene-vignette');
    assertDeclaration(vignette, 'width', 'min(24rem, 100%)');
    assertDeclaration(vignette, 'margin-inline', 'auto');
  });

  it('collapses the book to source-ordered full-width scenes at 48rem', () => {
    const mobile = blockFor(stylesheet, '@media (max-width: 48rem)');
    assertDeclaration(blockFor(mobile, '.illustrated-opening'), 'grid-template-columns', '1fr');

    const doublePage = blockFor(mobile, '.scene-double-page');
    assertDeclaration(doublePage, 'width', '100%');
    assertDeclaration(doublePage, 'margin-inline', '0');
    assertDeclaration(doublePage, 'transform', 'none');

    const scenes = blockFor(mobile, '.scene-marginal,\n  .scene-vignette');
    assertDeclaration(scenes, 'float', 'none');
    assertDeclaration(scenes, 'width', '100%');
    assertDeclaration(scenes, 'margin-inline', '0');
  });

  it('contains images and preserves focus and reduced-motion accessibility', () => {
    assertDeclaration(blockFor(stylesheet, '.illustrated-opening img'), 'object-fit', 'contain');
    assertDeclaration(blockFor(stylesheet, '.illustrated-scene img'), 'object-fit', 'contain');

    const focus = blockFor(stylesheet, ':focus-visible');
    assertDeclaration(focus, 'outline', '4px solid var(--amber)');
    assertDeclaration(focus, 'outline-offset', '3px');

    const reducedMotion = blockFor(stylesheet, '@media (prefers-reduced-motion: reduce)');
    const reducedElements = blockFor(reducedMotion, '.play-corner *,\n  .play-corner *::before,\n  .play-corner *::after');
    assertDeclaration(reducedElements, 'transition', 'none !important');
    assertDeclaration(reducedElements, 'animation', 'none !important');
  });
});
