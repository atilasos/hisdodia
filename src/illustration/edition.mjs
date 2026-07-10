export const ART_DIRECTION_VERSION = '1';
export const ILLUSTRATION_CREDIT = 'Edição ilustrada contemporânea gerada com IA';
export const PLANNING_MODEL = 'gpt-5.6-luna';

const LAYOUTS = new Set(['opening', 'double-page', 'marginal', 'vignette']);
const MODEL_SLUG_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/u;
const OPENING_EXCERPT_MAX_LENGTH = 600;
const OBSERVABLE_ART_DIRECTION = 'soft watercolour, pencil texture, irregular fine lines, warm paper, pale incomplete backgrounds, expressive lightly caricatured anatomy, gentle humour, and generous negative space.';
const CONTINUITY_DIRECTION = 'Maintain the established characters, clothes, recurring objects, setting, and palette from the opening and previous scenes.';
const SAFETY_DIRECTION = 'Do not imitate any named artist; no words, lettering, logos, or signatures.';
const UNSAFE_DESCRIPTION_PATTERNS = [
  /\b(?:style|estilo)\b/iu,
  /\b(?:visual\s+language|linguagem\s+visual)\b/iu,
  /(?:^|[\s,;:])à\s+maneira(?:\s+d[aeo])?\b/iu,
  /\b(?:draw|illustrate|paint|render)(?:\s+(?:it|this|the\s+(?:image|scene)))?\s+like\b/iu,
  /\b(?:emulate|imitate)\b/iu,
  /\binspired\s+by\b/iu,
  /^\s*inspirad[ao]s?\s+(?:em|por)\b/iu,
  /^\s*(?:emular|imitar)\s+[\p{L}]/iu,
  /\b(?:desconsidera|esquece|ignora|ignorar)\b[\s\S]{0,120}\b(?:emular|emule|imitar|imite)\b/iu,
  /\b(?:desenhar|ilustrar|pintar)(?:\s+(?:isto|esta\s+(?:abertura|cena|imagem)))?\s+como\b/iu,
];

function assertText(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${field} must be non-empty text`);
  }
}

export function validatePlanningModel(value) {
  if (typeof value !== 'string' || !MODEL_SLUG_PATTERN.test(value)) {
    throw new Error('planningModel must be a safe model slug');
  }
  return value;
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

function normalizedText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/gu, ' ')
    .toLocaleLowerCase('pt-PT');
}

function escapeRegularExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function containsUnicodePhrase(text, phrase) {
  if (phrase === '') return false;
  return new RegExp(
    `(?:^|[^\\p{L}\\p{N}])${escapeRegularExpression(phrase)}(?=$|[^\\p{L}\\p{N}])`,
    'u'
  ).test(text);
}

function assertSafeSceneDescription(story, description) {
  assertText(description, 'description');
  const normalizedDescription = normalizedText(description);
  const illustrator = normalizedText(story.illustrator);
  if (
    containsUnicodePhrase(normalizedDescription, illustrator)
    || UNSAFE_DESCRIPTION_PATTERNS.some((pattern) => pattern.test(description))
  ) {
    throw new Error('description contains unsafe artist or style instructions');
  }
}

function clipAtWordBoundary(text, maximumLength) {
  if (text.length <= maximumLength) return text;
  const candidate = text.slice(0, maximumLength);
  if (/\s/u.test(text[maximumLength])) return candidate.trimEnd();
  for (let index = candidate.length - 1; index >= 0; index -= 1) {
    if (/\s/u.test(candidate[index])) return candidate.slice(0, index).trimEnd();
  }
  throw new Error(`Opening story evidence cannot be clipped at a word boundary within ${maximumLength} characters`);
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
    if (paragraph.length <= remaining) {
      excerpt += `${separator}${paragraph}`;
      continue;
    }
    if (excerpt === '') excerpt = clipAtWordBoundary(paragraph, remaining);
    break;
  }
  return excerpt;
}

export function buildCanonicalScenePrompt(story, scene) {
  assertSafeSceneDescription(story, scene.description);
  const isOpening = scene.after === null;
  let excerpt;
  if (isOpening) {
    excerpt = openingExcerpt(story);
  } else {
    assertAnchor(story, scene.after);
    excerpt = String(story.textSegments[scene.after.segment].paragraphs[scene.after.paragraph]).trim();
  }
  assertText(excerpt, 'Story evidence');
  return [
    OBSERVABLE_ART_DIRECTION,
    `Scene composition: ${scene.description.trim()}`,
    `Story evidence: ${excerpt}`,
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

export function applyScenePlan(story, plan, options = {}) {
  const planningModel = validatePlanningModel(
    options.planningModel === undefined ? PLANNING_MODEL : options.planningModel
  );
  validateScenePlan(story, plan);
  return {
    ...story,
    illustratedEdition: {
      status: 'generating',
      credit: ILLUSTRATION_CREDIT,
      artDirectionVersion: ART_DIRECTION_VERSION,
      planningModel,
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
