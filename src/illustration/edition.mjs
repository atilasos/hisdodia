export const ART_DIRECTION_VERSION = '2';
export const ILLUSTRATION_CREDIT = 'Edição ilustrada contemporânea gerada com IA';
export const PLANNING_MODEL = 'gpt-5.6-luna';

const LAYOUTS = new Set(['opening', 'double-page', 'marginal', 'vignette']);
const MODEL_SLUG_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/u;
const EVIDENCE_REF_PATTERN = /^s(?:0|[1-9]\d*)p(?:0|[1-9]\d*)$/u;
const OBSERVABLE_ART_DIRECTION = 'soft watercolour, pencil texture, irregular fine lines, warm paper, pale incomplete backgrounds, expressive lightly caricatured anatomy, gentle humour, and generous negative space.';
const CONTINUITY_DIRECTION = 'Maintain the established characters, clothes, recurring objects, setting, and palette from the opening and previous scenes.';
const SAFETY_DIRECTION = 'Do not imitate any named artist; no words, lettering, logos, or signatures.';
const UNSAFE_DESCRIPTION_PATTERNS = [
  /^\s*(?:please\s+)?(?:compose|draw|illustrate|paint|render|use)\b[\s\S]{0,80}\b(?:aesthetic|manner|style|visual\s+language)\b/iu,
  /^\s*(?:please\s+)?(?:compose|draw|illustrate|paint|render|use)\b[\s\S]{0,80}\b(?:as\s+if\s+by|by|like)\b/iu,
  /^\s*(?:compor|componha|compõe|desenhar|desenhe|ilustrar|ilustre|pintar|pinte|renderizar|renderize|usar|use)\b[\s\S]{0,80}\b(?:estética|estilo|linguagem\s+visual|maneira)\b/iu,
  /^\s*(?:compor|componha|compõe|desenhar|desenhe|ilustrar|ilustre|pintar|pinte|renderizar|renderize|usar|use)\b[\s\S]{0,80}\bcomo\b/iu,
  /\b(?:drawing|illustration|painting|watercolou?r)\s+by\b/iu,
  /\b(?:[Aa]guarela|[Aa]quarela|[Dd]esenho|[Ii]lustração|[Pp]intura)\s+por\s+\p{Lu}[\p{L}'’-]+\s+(?:(?:d[aeo]s?|das)\s+)?\p{Lu}[\p{L}'’-]+\b/u,
  /^\s*[\p{L}'’-]+(?:\s+[\p{L}'’-]+){1,3}\s+style\b/iu,
  /^\s*[\p{L}'’-]+(?:\s+[\p{L}'’-]+){0,3}['’]s\s+(?:aesthetic|style)\b/iu,
  /^\s*(?:[Aa]esthetic|[Ss]tyle|[Ee]stética|[Ee]stilo)\s+(?:of|d[aeo])\s+\p{Lu}[\p{L}'’-]+\s+(?:(?:d[aeo]s?|das)\s+)?\p{Lu}[\p{L}'’-]+\b/u,
  /^\s*(?:[Vv]isual\s+language|[Ll]inguagem\s+visual)\s+(?:of|d[aeo])\s+\p{Lu}[\p{L}'’-]+\s+(?:(?:d[aeo]s?|das)\s+)?\p{Lu}[\p{L}'’-]+\b/u,
  /^\s*[Àà]\s+maneira\s+d[aeo]\s+\p{Lu}[\p{L}'’-]+\s+(?:(?:d[aeo]s?|das)\s+)?\p{Lu}[\p{L}'’-]+\b/u,
  /\b(?:[Aa]guarela|[Aa]quarela|[Dd]esenho|[Ii]lustração|[Pp]intura)\b[\s\S]{0,80}\b[Ee]stética\s+d[aeo]\s+\p{Lu}[\p{L}'’-]+\s+(?:(?:d[aeo]s?|das)\s+)?\p{Lu}[\p{L}'’-]+\b/u,
  /(?:^\s*|\b(?:composition|illustration|image|scene|composição|ilustração|imagem|cena)\b[\s\S]{0,80})inspired\s+by\b/iu,
  /\b(?:composição|ilustração|imagem|cena)\b[\s\S]{0,80}\binspirad[ao]s?\s+(?:em|por)\b/iu,
  /^\s*(?:emulate|imitate)\b/iu,
  /\b(?:disregard|forget|ignore)\b[\s\S]{0,120}\b(?:emulate|imitate)\b/iu,
  /^\s*(?:emular|imitar)\s+[\p{L}]/iu,
  /\b(?:desconsidera|esquece|ignora|ignorar)\b[\s\S]{0,120}\b(?:emular|emule|imitar|imite)\b/iu,
];

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
  assertSafeSceneDescription(story, scene.description);
  const isOpening = scene.after === null;
  if (!isOpening) assertAnchor(story, scene.after);
  const excerpt = typeof scene.evidence === 'string' ? scene.evidence.trim() : scene.evidence;
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
