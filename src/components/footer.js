/**
 * footer.js — Site footer component for AudioForge.
 *
 * Exports `createFooter()` which builds a <footer> element containing:
 *   • A privacy reassurance message (local-only processing)
 *   • Copyright text
 */

/**
 * Create the site footer element.
 *
 * @returns {HTMLElement} The <footer> element.
 */
export function createFooter() {
  const footer = document.createElement('footer');
  footer.className = 'site-footer';

  // --- Privacy message -------------------------------------------------------
  const privacy = document.createElement('p');
  privacy.className = 'footer-privacy';
  privacy.textContent = '🔒 Your files never leave your device. All processing happens locally in your browser.';

  // --- Copyright -------------------------------------------------------------
  const copyright = document.createElement('p');
  copyright.className = 'footer-copyright';
  copyright.textContent = '© 2025 AudioForge. Free & Open Source.';

  // --- Assemble --------------------------------------------------------------
  footer.appendChild(privacy);
  footer.appendChild(copyright);

  return footer;
}
