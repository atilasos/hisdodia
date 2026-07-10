export const ART_DIRECTION_VERSION = '1';
export const ILLUSTRATION_CREDIT = 'Edição ilustrada contemporânea gerada com IA';
export const PLANNING_MODEL = 'gpt-5.6-luna';

const LAYOUTS = new Set(['opening', 'double-page', 'marginal', 'vignette']);
const ARTIST_PATTERN = /(?:\bin the style of\b|\bno estilo de\b|à maneira de\b|\b(?:paint|draw)\s+like\b|\binspired\s+by\b|\b(?:imitate|emulate)\b|\bcristina malaquias\b)/iu;

function assertText(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${field} must be non-empty text`);
  }
}

function assertAnchor(story, anchor) {
  if (!anchor || !Number.isInteger(anchor.segment) || !Number.isInteger(anchor.paragraph)) {
    throw new Error('Every non-opening scene must reference a valid paragraph');
  }
  const paragraphs = story.textSegments?.[anchor.segment]?.paragraphs;
  if (!paragraphs || anchor.paragraph < 0 || anchor.paragraph >= paragraphs.length) {
    throw new Error('Every non-opening scene must reference a valid paragraph');
  }
}

export function validateScenePlan(story, plan) {
  const scenes = plan?.scenes;
  if (!Array.isArray(scenes) || scenes.length < 3 || scenes.length > 6) {
    throw new Error('A scene plan must contain three to six scenes');
  }
  const ids = new Set(scenes.map((scene) => scene.id));
  if (ids.size !== scenes.length || scenes.some(
    (scene) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(scene.id ?? '')
  )) {
    throw new Error('Scene ids must be safe and unique');
  }
  scenes.forEach((scene, index) => {
    if (!LAYOUTS.has(scene.layout)) throw new Error(`Unsupported layout: ${scene.layout}`);
    assertText(scene.description, 'description');
    assertText(scene.alt, 'alt');
    assertText(scene.prompt, 'prompt');
    if (ARTIST_PATTERN.test(scene.prompt)) throw new Error('Prompts must not imitate a specific artist');
    if (index === 0) {
      if (scene.id !== 'opening' || scene.layout !== 'opening' || scene.after !== null) {
        throw new Error('The first scene must be the opening');
      }
    } else {
      if (scene.layout === 'opening') throw new Error('Only the first scene may use the opening layout');
      assertAnchor(story, scene.after);
    }
  });
  return true;
}

export function applyScenePlan(story, plan) {
  validateScenePlan(story, plan);
  return {
    ...story,
    illustratedEdition: {
      status: 'generating',
      credit: ILLUSTRATION_CREDIT,
      artDirectionVersion: ART_DIRECTION_VERSION,
      planningModel: PLANNING_MODEL,
      visualBrief: `/assets/${story.id}/illustrated/brief.json`,
      scenes: plan.scenes.map(({ id, after, layout, alt }) => ({
        id,
        status: 'pending',
        attempts: 0,
        after,
        layout,
        image: `/assets/${story.id}/illustrated/${id}.webp`,
        alt
      }))
    }
  };
}

export function completedOpening(story) {
  return story.illustratedEdition?.scenes?.find(
    (scene) => scene.id === 'opening' && scene.status === 'complete'
  ) ?? null;
}
