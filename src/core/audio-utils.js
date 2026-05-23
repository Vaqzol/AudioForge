/**
 * audio-utils.js
 * Utility functions for audio metadata, formatting, and file handling.
 */

/**
 * Extract audio metadata from a File using the Web Audio API.
 *
 * @param {File} file — An audio File object.
 * @returns {Promise<{ duration: number, sampleRate: number, channels: number, bitrate: number, format: string, size: number }>}
 * @throws {Error} If the file cannot be decoded.
 *
 * @example
 * ```js
 * const meta = await getAudioMetadata(fileInput.files[0]);
 * console.log(meta.duration, meta.bitrate);
 * ```
 */
export async function getAudioMetadata(file) {
  if (!file || !(file instanceof File)) {
    throw new Error('A valid File object is required.');
  }

  const format = detectFormat(file.name);
  const size = file.size;

  let audioCtx = null;
  try {
    const arrayBuffer = await file.arrayBuffer();
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    const duration = audioBuffer.duration;
    const sampleRate = audioBuffer.sampleRate;
    const channels = audioBuffer.numberOfChannels;
    // Bitrate in kbps derived from file size and duration.
    const bitrate = duration > 0
      ? Math.round((size * 8) / (duration * 1000))
      : 0;

    return { name: file.name, duration, sampleRate, channels, bitrate, format, size };
  } catch (err) {
    throw new Error(`Failed to decode audio file "${file.name}": ${err.message}`);
  } finally {
    if (audioCtx) {
      try { await audioCtx.close(); } catch { /* ignored */ }
    }
  }
}

/**
 * Format a duration in seconds into a human-readable string.
 *
 * @param {number} seconds — Duration in seconds.
 * @returns {string} `'MM:SS'` or `'HH:MM:SS'` if ≥ 1 hour.
 *
 * @example
 * formatDuration(125);  // '02:05'
 * formatDuration(3661); // '01:01:01'
 */
export function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';

  const totalSeconds = Math.round(seconds);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  const pad = (n) => String(n).padStart(2, '0');

  return h > 0
    ? `${pad(h)}:${pad(m)}:${pad(s)}`
    : `${pad(m)}:${pad(s)}`;
}

/**
 * Format a byte count into a human-readable size string.
 *
 * @param {number} bytes
 * @returns {string} e.g. `'1.5 MB'`, `'320 KB'`
 */
export function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let idx = 0;
  let size = bytes;

  while (size >= 1000 && idx < units.length - 1) {
    size /= 1000;
    idx++;
  }

  return idx === 0
    ? `${size} ${units[idx]}`
    : `${parseFloat(size.toFixed(2))} ${units[idx]}`;
}

/**
 * Detect audio format from a filename extension.
 *
 * @param {string} filename
 * @returns {string} Lowercase format string (`'mp3'`, `'wav'`, …) or `'unknown'`.
 */
export function detectFormat(filename) {
  if (!filename || typeof filename !== 'string') return 'unknown';

  const ext = filename.split('.').pop().toLowerCase();

  const known = new Set([
    'mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a',
    'wma', 'opus', 'webm', 'aiff', 'aif', 'pcm',
  ]);

  return known.has(ext) ? ext : 'unknown';
}

/**
 * Map a format name to its canonical file extension.
 *
 * @param {string} format — e.g. `'mp3'`, `'flac'`.
 * @returns {string} File extension including the leading dot, e.g. `'.mp3'`.
 */
export function getOutputExtension(format) {
  const map = {
    mp3: '.mp3',
    wav: '.wav',
    ogg: '.ogg',
    flac: '.flac',
    aac: '.aac',
    m4a: '.m4a',
    wma: '.wma',
    opus: '.opus',
    webm: '.webm',
    aiff: '.aiff',
    aif: '.aif',
    pcm: '.pcm',
  };

  return map[(format || '').toLowerCase()] || `.${(format || 'bin').toLowerCase()}`;
}

/**
 * Return the MIME type for an audio format.
 *
 * @param {string} format — e.g. `'mp3'`, `'ogg'`.
 * @returns {string} MIME type string.
 */
export function getMimeType(format) {
  const map = {
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    flac: 'audio/flac',
    aac: 'audio/aac',
    m4a: 'audio/mp4',
    wma: 'audio/x-ms-wma',
    opus: 'audio/opus',
    webm: 'audio/webm',
    aiff: 'audio/aiff',
    aif: 'audio/aiff',
    pcm: 'audio/pcm',
  };

  return map[(format || '').toLowerCase()] || 'application/octet-stream';
}

/**
 * Calculate the required bitrate (kbps) to reach a target file size.
 *
 * @param {number} targetSizeBytes  — Desired output size in bytes.
 * @param {number} durationSeconds  — Audio duration in seconds.
 * @returns {number} Bitrate in kbps, or `0` if inputs are invalid.
 */
export function calculateBitrate(targetSizeBytes, durationSeconds) {
  if (
    !Number.isFinite(targetSizeBytes) || targetSizeBytes <= 0 ||
    !Number.isFinite(durationSeconds) || durationSeconds <= 0
  ) {
    return 0;
  }

  return (targetSizeBytes * 8) / (durationSeconds * 1000);
}

/**
 * Create a temporary download link and trigger a file download in the browser.
 *
 * @param {Uint8Array} data     — Raw file bytes.
 * @param {string}     filename — Suggested download filename.
 * @param {string}     mimeType — MIME type for the Blob.
 */
export function createDownloadLink(container, blobOrData, filename) {
  if (!container || !(container instanceof HTMLElement)) {
    throw new Error('Container must be a valid HTMLElement.');
  }

  let blob;
  if (blobOrData instanceof Blob) {
    blob = blobOrData;
  } else if (blobOrData instanceof Uint8Array) {
    blob = new Blob([blobOrData], { type: 'application/octet-stream' });
  } else {
    throw new Error('Data must be a Blob or a Uint8Array.');
  }

  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.className = 'download-btn';
  anchor.href = url;
  anchor.download = filename || 'download';
  
  // Custom download icon (arrow down)
  const downloadIcon = `
    <svg class="download-btn__icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
      <polyline points="7 10 12 15 17 10"></polyline>
      <line x1="12" y1="15" x2="12" y2="3"></line>
    </svg>
  `;

  anchor.innerHTML = `${downloadIcon} <span>Download File</span>`;

  container.innerHTML = '';
  container.appendChild(anchor);

  return anchor;
}
