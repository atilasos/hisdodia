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

describe('illustrated edition contract', () => {
  it('accepts three to six ordered scenes with valid paragraph anchors', () => {
    assert.equal(validateScenePlan(story(), plan()), true);
  });

  it('rejects invalid counts, duplicate ids, invalid anchors, and named-style imitation', () => {
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
    assert.throws(() => validateScenePlan(story(), {
      ...plan(),
      scenes: plan().scenes.map((scene, index) => index === 1
        ? { ...scene, prompt: 'In the style of Cristina Malaquias.' }
        : scene)
    }), /specific artist/);
  });

  it('maps a valid plan to resumable public metadata', () => {
    const result = applyScenePlan(story(), plan());
    assert.equal(result.illustratedEdition.status, 'generating');
    assert.equal(result.illustratedEdition.planningModel, 'gpt-5.6-luna');
    assert.equal(result.illustratedEdition.visualBrief, '/assets/01-01/illustrated/brief.json');
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
