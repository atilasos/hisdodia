document.querySelectorAll('.glossary-item').forEach((item) => {
  item.addEventListener('click', () => {
    const isOpen = item.classList.toggle('is-open');
    item.setAttribute('aria-expanded', String(isOpen));
  });
});
