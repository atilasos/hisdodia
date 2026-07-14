export const ART_DIRECTION_VERSION = '2';
export const ILLUSTRATION_CREDIT = 'Edição ilustrada contemporânea gerada com IA';
export const PLANNING_MODEL = 'gpt-5.4-mini';

const LAYOUTS = new Set(['opening', 'double-page', 'marginal', 'vignette']);
const MODEL_SLUG_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/u;
const EVIDENCE_REF_PATTERN = /^s(?:0|[1-9]\d*)p(?:0|[1-9]\d*)$/u;
const OBSERVABLE_ART_DIRECTION = 'soft watercolour, pencil texture, irregular fine lines, warm paper, pale incomplete backgrounds, expressive lightly caricatured anatomy, gentle humour, and generous negative space.';
const CONTINUITY_DIRECTION = 'Maintain the established characters, clothes, recurring objects, setting, and palette from the opening and previous scenes.';
const SAFETY_DIRECTION = 'Do not imitate any named artist; no words, lettering, logos, or signatures.';

export function validateStoryId(storyId) {
  if (typeof storyId !== 'string' || !/^\d{2}-\d{2}$/u.test(storyId)) {
    throw new Error('storyId must be exactly MM-DD');
  }
  return storyId;
}

export function assertStoryIdMatches(story, expectedStoryId) {
  validateStoryId(expectedStoryId);
  if (story?.id !== expectedStoryId) {
    throw new Error(`Story id mismatch: expected ${expectedStoryId}, found ${String(story?.id)}`);
  }
}

export function illustrationAssetDirectory(storyId, artDirectionVersion) {
  validateStoryId(storyId);
  if (typeof artDirectionVersion !== 'string' || !/^[1-9]\d*$/u.test(artDirectionVersion)) {
    throw new Error('artDirectionVersion must be a positive decimal string');
  }
  const base = `/assets/${storyId}/illustrated`;
  return artDirectionVersion === '1' ? base : `${base}/v${artDirectionVersion}`;
}

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
  const plainObject = anchor !== null
    && typeof anchor === 'object'
    && !Array.isArray(anchor)
    && Object.getPrototypeOf(anchor) === Object.prototype;
  const enumerableKeys = plainObject
    ? Reflect.ownKeys(anchor).filter((key) => (
      Object.getOwnPropertyDescriptor(anchor, key)?.enumerable === true
    ))
    : [];
  if (
    !plainObject
    || enumerableKeys.length !== 2
    || !enumerableKeys.includes('segment')
    || !enumerableKeys.includes('paragraph')
    || !Number.isInteger(anchor.segment)
    || !Number.isInteger(anchor.paragraph)
  ) {
    throw new Error(
      'Every non-opening anchor must be a plain object with exactly own enumerable keys segment and paragraph, both integers'
    );
  }
  const paragraphs = story.textSegments?.[anchor.segment]?.paragraphs;
  if (!paragraphs || anchor.paragraph < 0 || anchor.paragraph >= paragraphs.length) {
    throw new Error('Every non-opening scene must reference a valid paragraph');
  }
}

function storyParagraphs(story) {
  return (story.textSegments ?? []).flatMap((segment, segmentIndex) => (
    (segment?.paragraphs ?? []).map((paragraph, paragraphIndex) => ({
      segment: segmentIndex,
      paragraph: paragraphIndex,
      ref: `s${segmentIndex}p${paragraphIndex}`,
      text: typeof paragraph === 'string' ? paragraph.trim() : ''
    }))
  )).filter(({ text }) => text !== '');
}

export function buildSceneEvidenceContext(story, evidenceRef, options = {}) {
  const paragraphs = storyParagraphs(story);
  const opening = options.opening === true;
  const anchorIndex = opening
    ? 0
    : paragraphs.findIndex(({ ref }) => ref === evidenceRef);
  if (anchorIndex < 0 || !paragraphs[anchorIndex]) {
    throw new Error('evidenceRef must identify an existing non-empty story paragraph');
  }
  const context = opening
    ? paragraphs.slice(0, 3)
    : paragraphs.slice(Math.max(0, anchorIndex - 2), anchorIndex + 1);
  const anchor = paragraphs[anchorIndex];
  return {
    evidenceRef: anchor.ref,
    evidenceRefs: context.map(({ ref }) => ref),
    evidence: context.map(({ text }) => text).join(' '),
    after: opening ? null : { segment: anchor.segment, paragraph: anchor.paragraph }
  };
}

function sameRefs(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((ref, index) => ref === expected[index]);
}

export function buildCanonicalScenePrompt(story, scene) {
  const isOpening = scene.after === null;
  if (!isOpening) assertAnchor(story, scene.after);
  const excerpt = typeof scene.evidence === 'string' ? scene.evidence.trim() : scene.evidence;
  assertText(excerpt, 'Story evidence');
  return [
    OBSERVABLE_ART_DIRECTION,
    `Story evidence: ${excerpt}`,
    isOpening ? null : CONTINUITY_DIRECTION,
    SAFETY_DIRECTION
  ].filter(Boolean).join(' ');
}

export function canonicalSceneAlt(story, scene) {
  if (scene?.after !== null) return '';
  const title = typeof story?.title === 'string' ? story.title.trim() : '';
  return title === ''
    ? 'Ilustração de abertura da história.'
    : `Ilustração de abertura da história «${title}».`;
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
    if (Object.hasOwn(scene, 'description')) throw new Error('Final scenes must not persist description');
    if (typeof scene.evidenceRef !== 'string' || !EVIDENCE_REF_PATTERN.test(scene.evidenceRef)) {
      throw new Error('evidenceRef must be a canonical paragraph reference');
    }
    assertText(scene.evidence, 'evidence');
    assertText(scene.prompt, 'prompt');
    let expectedContext;
    if (index === 0) {
      if (scene.id !== 'opening' || scene.layout !== 'opening' || scene.after !== null) {
        throw new Error('The first scene must be the opening');
      }
      expectedContext = buildSceneEvidenceContext(story, scene.evidenceRef, { opening: true });
      if (scene.evidenceRef !== expectedContext.evidenceRef) {
        throw new Error('Opening evidenceRef must identify the first non-empty paragraph');
      }
    } else {
      if (scene.layout === 'opening') throw new Error('Only the first scene may use the opening layout');
      assertAnchor(story, scene.after);
      const anchoredRef = `s${scene.after.segment}p${scene.after.paragraph}`;
      if (scene.evidenceRef !== anchoredRef) {
        throw new Error('Scene evidenceRef must agree exactly with its anchor paragraph');
      }
      expectedContext = buildSceneEvidenceContext(story, scene.evidenceRef);
      if (
        scene.after.segment !== expectedContext.after.segment
        || scene.after.paragraph !== expectedContext.after.paragraph
      ) {
        throw new Error('Scene after must agree exactly with the anchor ref');
      }
    }
    if (scene.alt !== canonicalSceneAlt(story, scene)) {
      throw new Error('Every scene alt must equal the canonical alt policy');
    }
    if (!sameRefs(scene.evidenceRefs, expectedContext.evidenceRefs)) {
      throw new Error('Scene evidenceRefs must equal the deterministic context window');
    }
    if (scene.evidence !== expectedContext.evidence) {
      throw new Error('Scene evidence text must equal the referenced paragraphs in the context window');
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
  const assetDirectory = illustrationAssetDirectory(story.id, ART_DIRECTION_VERSION);
  return {
    ...story,
    illustratedEdition: {
      status: 'generating',
      credit: ILLUSTRATION_CREDIT,
      artDirectionVersion: ART_DIRECTION_VERSION,
      planningModel,
      visualBrief: `${assetDirectory}/brief.json`,
      scenes: plan.scenes.map(({ id, after, layout, alt }) => ({
        id,
        status: 'pending',
        attempts: 0,
        after,
        layout,
        image: `${assetDirectory}/${id}.webp`,
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
