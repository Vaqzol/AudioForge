/**
 * drop-zone.js — Drag-and-drop file upload component for AudioForge.
 *
 * Exports `createDropZone(options)` which builds a drop area that:
 *   • Accepts files via drag-and-drop or a click-to-browse file input
 *   • Validates MIME type against an `accept` pattern (default 'audio/*')
 *   • Enforces a 2 GB size limit
 *   • Calls `options.onFile(file)` for each valid file
 *   • Exposes a `reset()` method on the returned element
 */

/** Maximum allowed file size in bytes (2 GB). */
const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024;

/**
 * Cloud-upload SVG icon.
 */
const UPLOAD_ICON_SVG = `
<svg class="drop-zone__icon" viewBox="0 0 24 24"
     fill="none" stroke="currentColor" stroke-width="2"
     stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"></path>
  <path d="M12 12v9"></path>
  <polyline points="8 16 12 12 16 16"></polyline>
</svg>`;

/**
 * Check whether a file's MIME type matches a pattern like 'audio/*'.
 *
 * @param {File} file
 * @param {string} acceptPattern — e.g. 'audio/*', 'image/png'
 * @returns {boolean}
 */
function matchesMime(file, acceptPattern) {
  if (!acceptPattern || acceptPattern === '*/*') return true;

  // Handle wildcard subtypes: 'audio/*'
  if (acceptPattern.endsWith('/*')) {
    const prefix = acceptPattern.slice(0, acceptPattern.indexOf('/'));
    return file.type.startsWith(prefix + '/');
  }

  return file.type === acceptPattern;
}

/**
 * Format bytes into a human-readable string.
 *
 * @param {number} bytes
 * @returns {string}
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/**
 * Create a drag-and-drop file upload zone.
 *
 * @param {HTMLElement|object} [parentContainer] — Parent container to append to, or options object if no container.
 * @param {object} [options]
 * @param {string} [options.accept='audio/*'] — MIME type pattern for validation.
 * @param {function} [options.onFile]         — Callback receiving a valid `File`.
 * @param {boolean} [options.multiple=false]  — Allow multiple file selection.
 * @returns {HTMLElement} The drop-zone element with a `reset()` method attached.
 */
export function createDropZone(parentContainer, options = {}) {
  let actualContainer = parentContainer;
  let actualOptions = options;

  // Gracefully handle calls like createDropZone(options) where container is omitted
  if (parentContainer && !(parentContainer instanceof HTMLElement)) {
    actualOptions = parentContainer;
    actualContainer = null;
  }

  const {
    accept = 'audio/*',
    onFile = () => {},
    multiple = false,
  } = actualOptions;

  // --- Container -------------------------------------------------------------
  const zone = document.createElement('div');
  zone.className = 'drop-zone';
  zone.setAttribute('role', 'button');
  zone.setAttribute('tabindex', '0');

  // --- Inner markup ----------------------------------------------------------
  zone.innerHTML = `
    <div class="drop-zone__default-state" style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--space-md);">
      ${UPLOAD_ICON_SVG}
      <div class="drop-zone__text">
        <p class="drop-zone__title">Drop your audio file here</p>
        <p class="drop-zone__subtitle">or <span>click to browse</span> &bull; Supports MP3, WAV, OGG, FLAC, AAC</p>
      </div>
      <p class="drop-zone__formats">Max file size: ${formatBytes(MAX_FILE_SIZE)}</p>
    </div>
    <div class="drop-zone__loading-state" style="display: none; flex-direction: column; align-items: center; justify-content: center; gap: var(--space-md); padding: 20px 0;">
      <div class="spinner spinner--lg"><div class="spinner__circle"></div></div>
      <p class="drop-zone__loading-text" style="color: var(--text-primary); font-weight: 600; font-size: 1rem;"></p>
    </div>
  `;

  // --- Hidden file input -----------------------------------------------------
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.multiple = multiple;
  input.style.display = 'none';
  zone.appendChild(input);

  // --- Click & keyboard activation -------------------------------------------
  zone.addEventListener('click', () => {
    if (zone.classList.contains('drop-zone--loading')) return;
    input.click();
  });
  zone.addEventListener('keydown', (e) => {
    if (zone.classList.contains('drop-zone--loading')) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      input.click();
    }
  });

  // --- File input change handler ---------------------------------------------
  input.addEventListener('change', () => {
    if (input.files && input.files.length) {
      handleFiles(input.files);
    }
  });

  // --- Drag-and-drop events --------------------------------------------------
  let dragCounter = 0; // Track nested drag enter/leave pairs.

  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (zone.classList.contains('drop-zone--loading')) return;
    e.dataTransfer.dropEffect = 'copy';
  });

  zone.addEventListener('dragenter', (e) => {
    e.preventDefault();
    if (zone.classList.contains('drop-zone--loading')) return;
    dragCounter++;
    zone.classList.add('drop-zone--active');
  });

  zone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    if (zone.classList.contains('drop-zone--loading')) return;
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      zone.classList.remove('drop-zone--active');
    }
  });

  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    if (zone.classList.contains('drop-zone--loading')) return;
    dragCounter = 0;
    zone.classList.remove('drop-zone--active');

    if (e.dataTransfer.files && e.dataTransfer.files.length) {
      handleFiles(e.dataTransfer.files);
    }
  });

  // --- Validation & callback -------------------------------------------------

  /**
   * Validate each file and forward valid ones to the `onFile` callback.
   *
   * @param {FileList} files
   */
  function handleFiles(files) {
    const list = multiple ? Array.from(files) : [files[0]];

    for (const file of list) {
      // MIME-type check
      if (!matchesMime(file, accept)) {
        console.warn(`[drop-zone] Rejected "${file.name}" — type "${file.type}" does not match "${accept}".`);
        continue;
      }

      // Size check
      if (file.size > MAX_FILE_SIZE) {
        console.warn(`[drop-zone] Rejected "${file.name}" — exceeds max size (${formatBytes(file.size)} > ${formatBytes(MAX_FILE_SIZE)}).`);
        continue;
      }

      onFile(file);
    }
  }

  // --- Public API attached to the element ------------------------------------

  /**
   * Reset the drop zone to its initial state.
   * Clears the file input value so the same file can be re-selected.
   */
  zone.reset = function reset() {
    input.value = '';
    zone.classList.remove('drop-zone--active');
    zone.setLoading(false);
  };

  /**
   * Set loading state
   */
  zone.setLoading = function setLoading(isLoading, text = 'Reading audio file...') {
    const defaultState = zone.querySelector('.drop-zone__default-state');
    const loadingState = zone.querySelector('.drop-zone__loading-state');
    const loadingText = zone.querySelector('.drop-zone__loading-text');

    if (isLoading) {
      zone.classList.add('drop-zone--loading');
      defaultState.style.display = 'none';
      loadingState.style.display = 'flex';
      loadingText.textContent = text;
    } else {
      zone.classList.remove('drop-zone--loading');
      defaultState.style.display = 'flex';
      loadingState.style.display = 'none';
    }
  };

  if (actualContainer) {
    actualContainer.appendChild(zone);
  }

  return zone;
}
