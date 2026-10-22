(() => {
  'use strict';
  const comparison = document.querySelector('.real-comparison');
  const switcher = document.querySelector('.comparison-switch');
  const buttons = [...document.querySelectorAll('[data-comparison]')];
  const mobile = window.matchMedia('(max-width: 620px)');
  let selected = 'after';

  function renderComparison() {
    switcher.hidden = !mobile.matches;
    comparison.dataset.view = selected;
    comparison.querySelectorAll('[data-stage]').forEach(figure => {
      figure.hidden = mobile.matches && figure.dataset.stage !== selected;
    });
    buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.comparison === selected)));
  }
  buttons.forEach(button => button.addEventListener('click', () => {
    selected = button.dataset.comparison;
    renderComparison();
  }));
  mobile.addEventListener('change', renderComparison);
  renderComparison();

  const openTools = document.querySelector('#open-tools');
  const tools = document.querySelector('#self-tools');
  openTools.addEventListener('click', () => {
    tools.hidden = !tools.hidden;
    openTools.setAttribute('aria-expanded', String(!tools.hidden));
    if (!tools.hidden) {
      document.querySelector('#tools-title').setAttribute('tabindex', '-1');
      document.querySelector('#tools-title').focus({ preventScroll: true });
      tools.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
    }
  });
})();
