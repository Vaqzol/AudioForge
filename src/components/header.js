/**
 * header.js — Site header for AudioForge.
 *
 * Exports `createHeader(options)` which builds a <header> element containing:
 *   • Logo with inline SVG waveform icon and gradient text
 *   • "Upload Different File" button, visible conditionally
 */

const WAVEFORM_ICON_SVG = `
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
     stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
     aria-hidden="true" class="logo-icon-svg" style="vertical-align: middle; margin-right: 8px;">
  <line x1="4"  y1="8"  x2="4"  y2="16"></line>
  <line x1="8"  y1="4"  x2="8"  y2="20"></line>
  <line x1="12" y1="6"  x2="12" y2="18"></line>
  <line x1="16" y1="4"  x2="16" y2="20"></line>
  <line x1="20" y1="8"  x2="20" y2="16"></line>
</svg>`;

/**
 * Create the site header element.
 *
 * @param {object} [options]
 * @param {Function} [options.onReset] — Callback to reset application state
 * @returns {HTMLElement} The fully-wired <header> element.
 */
export function createHeader(options = {}) {
  const { onReset } = options;
  const header = document.createElement('header');
  header.className = 'site-header';

  const inner = document.createElement('div');
  inner.className = 'header-inner';
  header.appendChild(inner);

  // --- Logo ------------------------------------------------------------------
  const logoLink = document.createElement('a');
  logoLink.href = '#';
  logoLink.className = 'logo';
  logoLink.innerHTML = `${WAVEFORM_ICON_SVG}<span class="gradient-text">AudioForge</span>`;
  logoLink.addEventListener('click', (e) => {
    e.preventDefault();
    if (onReset) onReset();
  });
  inner.appendChild(logoLink);

  // --- Reset Button ----------------------------------------------------------
  const resetBtn = document.createElement('button');
  resetBtn.className = 'btn-secondary';
  resetBtn.textContent = 'Upload Different File';
  resetBtn.style.display = 'none'; // Hidden by default
  resetBtn.style.padding = '8px 16px';
  resetBtn.style.fontSize = '0.85rem';
  resetBtn.style.borderRadius = 'var(--radius-md)';
  resetBtn.addEventListener('click', () => {
    if (onReset) onReset();
  });
  inner.appendChild(resetBtn);

  // --- Scroll Effect ---------------------------------------------------------
  const handleScroll = () => {
    header.classList.toggle('scrolled', window.scrollY > 10);
  };
  window.addEventListener('scroll', handleScroll);

  // --- Public API ------------------------------------------------------------
  header.setResetButtonVisible = function(visible) {
    resetBtn.style.display = visible ? 'block' : 'none';
  };

  header.destroy = function() {
    window.removeEventListener('scroll', handleScroll);
  };

  return header;
}
