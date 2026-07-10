export const ART_DIRECTION_VERSION = '1';
export const ILLUSTRATION_CREDIT = 'Edição ilustrada contemporânea gerada com IA';
export const PLANNING_MODEL = 'gpt-5.6-luna';

const LAYOUTS = new Set(['opening', 'double-page', 'marginal', 'vignette']);
const OPENING_EXCERPT_MAX_LENGTH = 600;
const OBSERVABLE_ART_DIRECTION = 'soft watercolour, pencil texture, irregular fine lines, warm paper, pale incomplete backgrounds, expressive lightly caricatured anatomy, gentle humour, and generous negative space.';
const CONTINUITY_DIRECTION = 'Maintain the established characters, clothes, recurring objects, setting, and palette from the opening and previous scenes.';
const SAFETY_DIRECTION = 'Do not imitate any named artist; no words, lettering, logos, or signatures.';

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

function openingExcerpt(story) {
  const paragraphs = (story.textSegments ?? [])
    .flatMap((segment) => segment?.paragraphs ?? [])
    .filter((paragraph) => typeof paragraph === 'string' && paragraph.trim() !== '')
    .map((paragraph) => paragraph.trim());
  let excerpt = '';
  for (const paragraph of paragraphs) {
    const separator = excerpt === '' ? '' : ' ';
    const remaining = OPENING_EXCERPT_MAX_LENGTH - excerpt.length - separator.length;
    if (remaining <= 0) break;
    excerpt += `${separator}${paragraph.slice(0, remaining)}`;
    if (paragraph.length > remaining) break;
  }
  return excerpt;
}

export function buildCanonicalScenePrompt(story, scene) {
  const isOpening = scene.after === null;
  let excerpt;
  if (isOpening) {
    excerpt = openingExcerpt(story);
  } else {
    assertAnchor(story, scene.after);
    excerpt = String(story.textSegments[scene.after.segment].paragraphs[scene.after.paragraph]).trim();
  }
  return [
    OBSERVABLE_ART_DIRECTION,
    excerpt,
    isOpening ? null : CONTINUITY_DIRECTION,
    SAFETY_DIRECTION
  ].filter(Boolean).join(' ');
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
    if (index === 0) {
      if (scene.id !== 'opening' || scene.layout !== 'opening' || scene.after !== null) {
        throw new Error('The first scene must be the opening');
      }
    } else {
      if (scene.layout === 'opening') throw new Error('Only the first scene may use the opening layout');
      assertAnchor(story, scene.after);
    }
    if (scene.prompt !== buildCanonicalScenePrompt(story, scene)) {
      throw new Error('Every prompt must equal its canonical scene prompt');
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
