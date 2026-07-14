const NON_OPENING_LAYOUTS = new Set(['double-page', 'marginal', 'vignette']);

export function illustratedCover(story) {
  return story.illustratedEdition?.scenes?.find(
    (scene) => scene.id === 'opening' && scene.status === 'complete'
  ) ?? null;
}

function renderScene(story, scene, index, { escapeHtml, safeAssetUrl }) {
  const source = safeAssetUrl(story, scene.image);
  if (!source || !NON_OPENING_LAYOUTS.has(scene.layout)) {
    return '';
  }

  const side = scene.layout === 'marginal'
    ? ` scene-side-${index % 2 === 0 ? 'right' : 'left'}`
    : '';

  return `<figure class="illustrated-scene scene-${scene.layout}${side}">
        <img src="${escapeHtml(source)}" alt="${escapeHtml(scene.alt)}" loading="lazy">
        <figcaption>${escapeHtml(story.illustratedEdition.credit)}</figcaption>
      </figure>`;
}

export function renderIllustratedEdition(story, helpers) {
  const opening = illustratedCover(story);
  const openingSource = opening && helpers.safeAssetUrl(story, opening.image);

  if (!openingSource) {
    return null;
  }

  const { escapeHtml } = helpers;
  const scenesByAnchor = new Map();
  const scenes = (story.illustratedEdition?.scenes ?? [])
    .filter((scene) => scene.id !== 'opening' && scene.status === 'complete');

  scenes.forEach((scene, index) => {
    if (!Number.isInteger(scene.after?.segment) || !Number.isInteger(scene.after?.paragraph)) {
      return;
    }

    const figure = renderScene(story, scene, index, helpers);
    if (!figure) {
      return;
    }

    const anchor = `${scene.after.segment}:${scene.after.paragraph}`;
    scenesByAnchor.set(anchor, [...(scenesByAnchor.get(anchor) ?? []), figure]);
  });

  const text = (story.textSegments ?? [])
    .map((segment, segmentIndex) => `<section class="story-segment">
${(segment.paragraphs ?? []).map((paragraph, paragraphIndex) => {
  const figures = scenesByAnchor.get(`${segmentIndex}:${paragraphIndex}`) ?? [];
  return `      <p>${escapeHtml(paragraph)}</p>${figures.length ? `\n${figures.join('\n')}` : ''}`;
}).join('\n')}
    </section>`)
    .join('\n');

  return `<section id="edicao-ilustrada" class="edition-panel illustrated-edition" tabindex="-1">
      <header class="illustrated-opening">
        <img src="${escapeHtml(openingSource)}" alt="${escapeHtml(opening.alt)}" loading="eager">
        <div class="illustrated-opening-copy">
          <p class="eyebrow">${escapeHtml(story.dateLabel)}</p>
          <h1>${escapeHtml(story.title)}</h1>
          <p class="credits">${escapeHtml(story.author)} escreveu.</p>
          <p class="illustrated-credit">${escapeHtml(story.illustratedEdition.credit)}</p>
          <p class="ai-disclosure">Ilustrações desta edição geradas com inteligência artificial.</p>
        </div>
      </header>
${text}
    </section>`;
}
