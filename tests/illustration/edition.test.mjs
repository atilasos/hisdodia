import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyScenePlan,
  completedOpening,
  validateScenePlan
} from '../../src/illustration/edition.mjs';

function story() {
  return {
    id: '01-01',
    textSegments: [
      { paragraphs: ['Primeiro parágrafo.', 'Segundo parágrafo.'] },
      { paragraphs: ['Terceiro parágrafo.'] }
    ]
  };
}

function plan() {
  return {
    characters: [{ name: 'Rapaz', appearance: 'Cabelo escuro e casaco azul.' }],
    environment: 'Estrada rural luminosa.',
    palette: ['azul lavado', 'cinzento de carvão'],
    recurringObjects: ['saco de farinha'],
    scenes: [
      {
        id: 'opening',
        after: null,
        layout: 'opening',
        description: 'Encontro na estrada.',
        alt: 'Dois rapazes encontram-se numa estrada.',
        prompt: 'Watercolour and pencil on warm paper; expressive children; no text.'
      },
      {
        id: 'encontro',
        after: { segment: 0, paragraph: 1 },
        layout: 'marginal',
        description: 'Os rapazes discutem.',
        alt: 'Os dois rapazes discutem junto dos pais.',
        prompt: 'Watercolour vignette; the same children argue; no text.'
      },
      {
        id: 'abraco',
        after: { segment: 1, paragraph: 0 },
        layout: 'vignette',
        description: 'Todos se reconciliam.',
        alt: 'As duas famílias abraçam-se e riem.',
        prompt: 'Watercolour vignette; the same families embrace; no text.'
      }
    ]
  };
}

function planWithPrompt(prompt) {
  const result = plan();
  result.scenes[1] = { ...result.scenes[1], prompt };
  return result;
}

describe('illustrated edition contract', () => {
  it('accepts three to six ordered scenes with valid paragraph anchors', () => {
    assert.equal(validateScenePlan(story(), plan()), true);
  });

  it('rejects invalid counts, duplicate ids, and invalid anchors', () => {
    assert.throws(() => validateScenePlan(story(), { ...plan(), scenes: plan().scenes.slice(0, 2) }), /three to six/);
    assert.throws(() => validateScenePlan(story(), {
      ...plan(),
      scenes: plan().scenes.map((scene) => ({ ...scene, id: 'same' }))
    }), /unique/);
    assert.throws(() => validateScenePlan(story(), {
      ...plan(),
      scenes: plan().scenes.map((scene, index) => index === 1
        ? { ...scene, after: { segment: 4, paragraph: 0 } }
        : scene)
    }), /valid paragraph/);
  });

  it('rejects explicit references to Cristina Malaquias', () => {
    assert.throws(
      () => validateScenePlan(story(), planWithPrompt('Watercolour by Cristina Malaquias; no text.')),
      /specific artist/
    );
  });

  it('rejects common named-style request formulations', () => {
    const prompts = [
      'Paint like Beatrix Potter.',
      'Draw like Quentin Blake.',
      'Inspired by Tove Jansson.',
      'Imitate Maurice Sendak.',
      'Emulate Leo Lionni.',
      'In the style of Eric Carle.',
      'No estilo de Paula Rego.',
      'À maneira de Júlio Pomar.'
    ];

    for (const prompt of prompts) {
      assert.throws(
        () => validateScenePlan(story(), planWithPrompt(prompt)),
        /specific artist/,
        prompt
      );
    }
  });

  it('allows the opening layout only on the first scene', () => {
    const duplicateOpening = plan();
    duplicateOpening.scenes[1] = { ...duplicateOpening.scenes[1], layout: 'opening' };

    assert.throws(
      () => validateScenePlan(story(), duplicateOpening),
      /Only the first scene may use the opening layout/
    );
  });

  it('maps a valid plan to resumable public metadata', () => {
    const original = {
      ...story(),
      author: 'Maria Alberta Menéres',
      illustrator: 'Cristina Malaquias'
    };
    const result = applyScenePlan(original, plan());
    assert.equal(result.illustratedEdition.status, 'generating');
    assert.equal(result.illustratedEdition.credit, 'Edição ilustrada contemporânea gerada com IA');
    assert.equal(result.illustratedEdition.planningModel, 'gpt-5.6-luna');
    assert.equal(result.illustratedEdition.visualBrief, '/assets/01-01/illustrated/brief.json');
    assert.equal(result.author, original.author);
    assert.equal(result.illustrator, original.illustrator);
    assert.deepEqual(result.illustratedEdition.scenes[1], {
      id: 'encontro',
      status: 'pending',
      attempts: 0,
      after: { segment: 0, paragraph: 1 },
      layout: 'marginal',
      image: '/assets/01-01/illustrated/encontro.webp',
      alt: 'Os dois rapazes discutem junto dos pais.'
    });
    assert.equal(completedOpening(result), null);
    result.illustratedEdition.scenes[0].status = 'complete';
    assert.equal(completedOpening(result).id, 'opening');
  });
});
