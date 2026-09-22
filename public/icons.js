// Lucide icons are bundled locally; no external requests or icon fonts required.
export function icon(name) {
  const span = document.createElement('span');
  span.className = `icon icon-${name}`;
  span.setAttribute('aria-hidden', 'true');
  return span;
}
export function decorateIcons() {
  for (const element of document.querySelectorAll('[data-icon]')) {
    element.prepend(icon(element.dataset.icon));
    element.removeAttribute('data-icon');
  }
}
