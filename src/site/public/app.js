document.querySelectorAll('.glossary-item').forEach((item) => {
  item.addEventListener('click', () => {
    const isOpen = item.classList.toggle('is-open');
    item.setAttribute('aria-expanded', String(isOpen));
  });
});

const editionLinks = [...document.querySelectorAll('[data-edition-target]')];

if (editionLinks.length > 0) {
  const panels = [...document.querySelectorAll('.edition-panel')];
  const activateEdition = (targetId, updateHash) => {
    for (const panel of panels) panel.hidden = panel.id !== targetId;
    for (const link of editionLinks) {
      link.setAttribute('aria-current', String(link.dataset.editionTarget === targetId));
    }
    if (updateHash) history.replaceState(null, '', `#${targetId}`);
  };
  const initial = editionLinks.some((link) => `#${link.dataset.editionTarget}` === location.hash)
    ? location.hash.slice(1)
    : 'edicao-ilustrada';
  activateEdition(initial, false);
  for (const link of editionLinks) {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      activateEdition(link.dataset.editionTarget, true);
      document.getElementById(link.dataset.editionTarget)?.focus({ preventScroll: true });
    });
  }
}
