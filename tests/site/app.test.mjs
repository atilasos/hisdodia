import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

let script;

before(async () => {
  script = await readFile('src/site/public/app.js', 'utf8');
});

function fakeElement({ id, editionTarget } = {}) {
  const attributes = new Map();
  const listeners = new Map();

  return {
    id,
    dataset: editionTarget ? { editionTarget } : {},
    hidden: false,
    focusArguments: [],
    setAttribute(name, value) {
      attributes.set(name, value);
    },
    getAttribute(name) {
      return attributes.get(name);
    },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    dispatch(type, event) {
      listeners.get(type)?.(event);
    },
    focus(options) {
      this.focusArguments.push(options);
    }
  };
}

function runApp({ hash = '', withSwitcher = true } = {}) {
  const illustratedLink = fakeElement({ editionTarget: 'edicao-ilustrada' });
  const originalLink = fakeElement({ editionTarget: 'edicao-original' });
  const illustratedPanel = fakeElement({ id: 'edicao-ilustrada' });
  const originalPanel = fakeElement({ id: 'edicao-original' });
  const links = withSwitcher ? [illustratedLink, originalLink] : [];
  const panels = [illustratedPanel, originalPanel];
  const historyCalls = [];
  let getElementByIdCalls = 0;

  const document = {
    querySelectorAll(selector) {
      if (selector === '.glossary-item') return [];
      if (selector === '[data-edition-target]') return links;
      if (selector === '.edition-panel') return panels;
      throw new Error(`Unexpected selector: ${selector}`);
    },
    getElementById(id) {
      getElementByIdCalls += 1;
      return panels.find((panel) => panel.id === id) ?? null;
    }
  };

  vm.runInNewContext(script, {
    document,
    location: { hash },
    history: {
      replaceState(...args) {
        historyCalls.push(args);
      }
    }
  });

  return {
    illustratedLink,
    originalLink,
    illustratedPanel,
    originalPanel,
    historyCalls,
    getElementByIdCalls: () => getElementByIdCalls
  };
}

describe('edition switcher', () => {
  it('does nothing when the page has no edition links', () => {
    const state = runApp({ withSwitcher: false });

    assert.equal(state.illustratedPanel.hidden, false);
    assert.equal(state.originalPanel.hidden, false);
    assert.equal(state.illustratedLink.getAttribute('aria-current'), undefined);
    assert.equal(state.originalLink.getAttribute('aria-current'), undefined);
    assert.deepEqual(state.illustratedPanel.focusArguments, []);
    assert.deepEqual(state.originalPanel.focusArguments, []);
    assert.deepEqual(state.historyCalls, []);
    assert.equal(state.getElementByIdCalls(), 0);
  });

  it('defaults missing and unknown hashes to the illustrated edition', () => {
    for (const hash of ['', '#edicao-desconhecida']) {
      const state = runApp({ hash });

      assert.equal(state.illustratedPanel.hidden, false);
      assert.equal(state.originalPanel.hidden, true);
      assert.equal(state.illustratedLink.getAttribute('aria-current'), 'true');
      assert.equal(state.originalLink.getAttribute('aria-current'), 'false');
      assert.deepEqual(state.historyCalls, []);
    }
  });

  it('initializes a valid original-edition hash', () => {
    const state = runApp({ hash: '#edicao-original' });

    assert.equal(state.illustratedPanel.hidden, true);
    assert.equal(state.originalPanel.hidden, false);
    assert.equal(state.illustratedLink.getAttribute('aria-current'), 'false');
    assert.equal(state.originalLink.getAttribute('aria-current'), 'true');
    assert.deepEqual(state.historyCalls, []);
  });

  it('activates, announces, hashes, and focuses the clicked edition', () => {
    const state = runApp();
    let prevented = false;

    state.originalLink.dispatch('click', {
      preventDefault() {
        prevented = true;
      }
    });

    assert.equal(prevented, true);
    assert.equal(state.illustratedPanel.hidden, true);
    assert.equal(state.originalPanel.hidden, false);
    assert.equal(state.illustratedLink.getAttribute('aria-current'), 'false');
    assert.equal(state.originalLink.getAttribute('aria-current'), 'true');
    assert.deepEqual(state.historyCalls, [[null, '', '#edicao-original']]);
    assert.equal(JSON.stringify(state.originalPanel.focusArguments), '[{"preventScroll":true}]');
  });
});
