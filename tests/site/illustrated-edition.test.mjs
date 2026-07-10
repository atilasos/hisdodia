import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderIllustratedEdition } from '../../src/site/illustrated-edition.mjs';

const baseStory = {
  id: '01-01',
  dateLabel: '1 de Janeiro',
  title: 'História teste',
  author: 'Autora',
  textSegments: [{ paragraphs: ['Primeiro parágrafo.', 'Segundo parágrafo.', 'Terceiro parágrafo.'] }],
  illustratedEdition: {
    status: 'complete',
    credit: 'Edição ilustrada contemporânea gerada com IA',
    scenes: [
      { id: 'opening', status: 'complete', after: null, layout: 'opening', image: '/assets/01-01/illustrated/opening.webp', alt: 'Abertura.' },
      { id: 'middle', status: 'complete', after: { segment: 0, paragraph: 0 }, layout: 'marginal', image: '/assets/01-01/illustrated/middle.webp', alt: 'Cena intermédia.' },
      { id: 'ending', status: 'failed', after: { segment: 0, paragraph: 2 }, layout: 'vignette', image: '/assets/01-01/illustrated/failed.webp', alt: 'Cena falhada.' }
    ]
  }
};

const helpers = {
  escapeHtml: (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'),
  safeAssetUrl: (_story, value) => String(value).startsWith('/') ? value : null
};

describe('illustrated story renderer', () => {
  it('renders completed scenes after their anchored paragraphs', () => {
    const html = renderIllustratedEdition(baseStory, helpers);

    assert.match(html, /id="edicao-ilustrada"/);
    assert.match(html, /class="illustrated-opening"/);
    assert.match(html, /class="illustrated-scene scene-marginal scene-side-right"/);
    assert.ok(html.indexOf('Primeiro parágrafo') < html.indexOf('middle.webp'));
    assert.ok(html.indexOf('middle.webp') < html.indexOf('Segundo parágrafo'));
    assert.doesNotMatch(html, /failed.webp/);
    assert.doesNotMatch(html, /javascript:/);
    assert.match(html, /Edição ilustrada contemporânea gerada com IA/);
  });

  it('credits every non-opening figure with escaped edition text', () => {
    const story = structuredClone(baseStory);
    story.illustratedEdition.credit = 'Edição <IA> & contemporânea';
    story.illustratedEdition.scenes[2].status = 'complete';

    const html = renderIllustratedEdition(story, helpers);
    const caption = '<figcaption>Edição &lt;IA&gt; &amp; contemporânea</figcaption>';

    assert.equal(html.split(caption).length - 1, 2);
    assert.doesNotMatch(html, /<figcaption>Edição <IA>/);
  });

  it('returns null without a completed safe opening', () => {
    assert.equal(renderIllustratedEdition({ ...baseStory, illustratedEdition: undefined }, helpers), null);
    const unsafe = structuredClone(baseStory);
    unsafe.illustratedEdition.scenes[0].image = 'javascript:alert(1)';
    assert.equal(renderIllustratedEdition(unsafe, helpers), null);
  });
});
