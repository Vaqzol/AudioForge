/**
 * file-info.js — File metadata display card for AudioForge.
 *
 * Exports `createFileInfo()` which builds a glass-card element showing audio
 * file metadata (name, format, size, duration, bitrate, sample rate, channels).
 *
 * Methods on the returned element:
 *   • setInfo(metadata)  — Populate the card with metadata values.
 *   • clear()            — Reset all fields to their default placeholder.
 *   • show() / hide()    — Toggle visibility with animation classes.
 */

import { formatDuration, formatFileSize } from '../core/audio-utils.js';

// ---------------------------------------------------------------------------
// Field definitions — each item describes one metadata row.
// ---------------------------------------------------------------------------

/**
 * @typedef {object} FieldDef
 * @property {string} key   — Property name on the metadata object.
 * @property {string} label — Human-readable label.
 * @property {string} icon  — Inline SVG markup for the field icon.
 */

/** @type {FieldDef[]} */
const FIELDS = [
  {
    key: 'name',
    label: 'File Name',
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
             <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
             <polyline points="14 2 14 8 20 8"></polyline>
           </svg>`,
  },
  {
    key: 'format',
    label: 'Format',
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
             <circle cx="5.5" cy="17.5" r="2.5"></circle>
             <circle cx="17.5" cy="15.5" r="2.5"></circle>
             <path d="M8 17V5l12-2v12"></path>
           </svg>`,
  },
  {
    key: 'size',
    label: 'File Size',
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
             <rect x="2" y="2" width="20" height="20" rx="2"></rect>
             <line x1="12" y1="8" x2="12" y2="16"></line>
             <line x1="8" y1="12" x2="16" y2="12"></line>
           </svg>`,
  },
  {
    key: 'duration',
    label: 'Duration',
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
             <circle cx="12" cy="12" r="10"></circle>
             <polyline points="12 6 12 12 16 14"></polyline>
           </svg>`,
  },
  {
    key: 'bitrate',
    label: 'Bitrate',
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
             <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
           </svg>`,
  },
  {
    key: 'sampleRate',
    label: 'Sample Rate',
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
             <line x1="4"  y1="8"  x2="4"  y2="16"></line>
             <line x1="8"  y1="4"  x2="8"  y2="20"></line>
             <line x1="12" y1="6"  x2="12" y2="18"></line>
             <line x1="16" y1="4"  x2="16" y2="20"></line>
             <line x1="20" y1="8"  x2="20" y2="16"></line>
           </svg>`,
  },
  {
    key: 'channels',
    label: 'Channels',
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
             <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
             <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
             <line x1="12" y1="19" x2="12" y2="23"></line>
             <line x1="8"  y1="23" x2="16" y2="23"></line>
           </svg>`,
  },
];

// Default placeholder text for empty values.
const PLACEHOLDER = '—';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Create a file-info metadata display card.
 *
 * @param {HTMLElement} [parentContainer]  — Parent container to append to.
 * @param {object}      [initialMetadata] — Initial metadata to display.
 * @returns {HTMLElement} The card element with setInfo/clear/show/hide methods.
 */
export function createFileInfo(parentContainer, initialMetadata) {
  const card = document.createElement('div');
  card.className = 'file-info';

  // --- Build the grid --------------------------------------------------------
  const grid = document.createElement('div');
  grid.className = 'file-info__grid';

  /** Map of field key → value element for quick updates. */
  const valueElements = {};

  FIELDS.forEach(({ key, label, icon }) => {
    const item = document.createElement('div');
    item.className = 'file-info__item';

    const labelEl = document.createElement('div');
    labelEl.className = 'file-info__label';
    labelEl.innerHTML = `${icon} <span>${label}</span>`;

    const valueEl = document.createElement('div');
    valueEl.className = 'file-info__value';
    valueEl.textContent = PLACEHOLDER;

    item.appendChild(labelEl);
    item.appendChild(valueEl);
    grid.appendChild(item);

    valueElements[key] = valueEl;
  });

  card.appendChild(grid);

  // --- Formatting helpers ----------------------------------------------------

  /**
   * Format a raw metadata value for display.
   *
   * @param {string} key   — Field key.
   * @param {*}      value — Raw value from the metadata object.
   * @returns {string} Formatted string for the UI.
   */
  function formatValue(key, value) {
    if (value === undefined || value === null) return PLACEHOLDER;

    switch (key) {
      case 'size':
        return typeof value === 'number' ? formatFileSize(value) : String(value);
      case 'duration':
        return typeof value === 'number' ? formatDuration(value) : String(value);
      case 'bitrate':
        if (typeof value === 'number') {
          return value >= 1000 ? `${Math.round(value / 1000)} kbps` : `${value} bps`;
        }
        return String(value);
      case 'sampleRate':
        if (typeof value === 'number') {
          return value >= 1000 ? `${(value / 1000).toFixed(1)} kHz` : `${value} Hz`;
        }
        return String(value);
      case 'channels':
        if (typeof value === 'number') {
          if (value === 1) return 'Mono';
          if (value === 2) return 'Stereo';
          return `${value} channels`;
        }
        return String(value);
      default:
        return String(value);
    }
  }

  // --- Public API ------------------------------------------------------------

  /**
   * Populate the card with metadata values.
   *
   * @param {object} metadata
   * @param {string}  [metadata.name]       — File name.
   * @param {string}  [metadata.format]     — Audio format (e.g. 'MP3').
   * @param {number}  [metadata.size]       — File size in bytes.
   * @param {number}  [metadata.duration]   — Duration in seconds.
   * @param {number}  [metadata.bitrate]    — Bitrate in bps.
   * @param {number}  [metadata.sampleRate] — Sample rate in Hz.
   * @param {number}  [metadata.channels]   — Number of audio channels.
   */
  card.setInfo = function setInfo(metadata) {
    FIELDS.forEach(({ key }) => {
      valueElements[key].textContent = formatValue(key, metadata[key]);
    });
  };

  /**
   * Clear all metadata fields back to the placeholder value.
   */
  card.clear = function clear() {
    FIELDS.forEach(({ key }) => {
      valueElements[key].textContent = PLACEHOLDER;
    });
  };

  /**
   * Show the card with a fade-in animation class.
   */
  card.show = function show() {
    card.classList.remove('file-info--hidden');
    card.classList.add('file-info--visible');
  };

  /**
   * Hide the card with a fade-out animation class.
   */
  card.hide = function hide() {
    card.classList.remove('file-info--visible');
    card.classList.add('file-info--hidden');
  };

  // Start hidden by default.
  card.classList.add('file-info--hidden');

  // Handle auto-append & auto-populate
  if (parentContainer) {
    parentContainer.appendChild(card);
  }
  if (initialMetadata) {
    card.setInfo(initialMetadata);
    card.show();
  }

  return card;
}
