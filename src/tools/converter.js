/**
 * Audio Format Converter Tool Settings & Actions
 *
 * Converts between MP3, WAV, OGG and FLAC formats using FFmpeg.
 *
 * @module tools/converter
 */

import { createProgressBar } from '../components/progress-bar.js';
import { ffmpegEngine } from '../core/ffmpeg-engine.js';
import {
  formatFileSize,
  createDownloadLink,
  detectFormat,
} from '../core/audio-utils.js';

/* ------------------------------------------------------------------ */
/*  Format definitions                                                */
/* ------------------------------------------------------------------ */

const FORMATS = [
  {
    id: 'mp3',
    label: 'MP3',
    desc: 'Compressed • Small size • Universal',
    ext: '.mp3',
    mime: 'audio/mpeg',
    args: (quality = '2') => ['-c:a', 'libmp3lame', '-q:a', quality],
  },
  {
    id: 'wav',
    label: 'WAV',
    desc: 'Uncompressed • Lossless • Large',
    ext: '.wav',
    mime: 'audio/wav',
    args: () => ['-c:a', 'pcm_s16le'],
  },
  {
    id: 'ogg',
    label: 'OGG',
    desc: 'Compressed • Open source • Good quality',
    ext: '.ogg',
    mime: 'audio/ogg',
    args: () => ['-c:a', 'libvorbis', '-q:a', '5'],
  },
  {
    id: 'flac',
    label: 'FLAC',
    desc: 'Lossless • Compressed • Audiophile',
    ext: '.flac',
    mime: 'audio/flac',
    args: () => ['-c:a', 'flac'],
  },
];

const MUSIC_NOTE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24"
  fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
  stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/>
  <circle cx="18" cy="16" r="3"/></svg>`;

/* ------------------------------------------------------------------ */
/*  Main export                                                       */
/* ------------------------------------------------------------------ */

/**
 * Render the Audio Format Converter settings panel into `settingsSlot`.
 *
 * @param {HTMLElement} settingsSlot
 * @param {File} file
 * @param {object} metadata
 * @param {HTMLElement} progressSlot
 * @param {HTMLElement} resultsSlot
 * @returns {Function} cleanup
 */
export function initConverterSettings(settingsSlot, file, metadata, progressSlot, resultsSlot) {
  const cleanups = [];
  let selectedFormat = FORMATS[0]; // default MP3

  settingsSlot.innerHTML = `
    <div class="tool-settings">
      <h3 class="tool-settings__title">Output Format</h3>
      
      <div class="format-grid"></div>
      
      <div class="mp3-quality" style="margin-top: var(--space-md);">
        <label class="setting-group__label">
          MP3 VBR Quality
          <span class="setting-group__value"><span class="quality-value">2</span> <small style="color: var(--text-muted); font-weight: normal;">(0 = best, 9 = smallest)</small></span>
        </label>
        <input type="range" class="range-slider" min="0" max="9" step="1" value="2" />
      </div>

      <!-- process button -->
      <div class="action-section" style="margin-top: var(--space-lg); text-align: center;">
        <button class="btn-primary" style="width: 100%;">Convert Audio</button>
      </div>
    </div>
  `;

  /* ---- element references ---------------------------------------- */

  const formatGrid = settingsSlot.querySelector('.format-grid');
  const mp3QualitySection = settingsSlot.querySelector('.mp3-quality');
  const qualitySlider = settingsSlot.querySelector('.mp3-quality input');
  const qualityLabel = settingsSlot.querySelector('.quality-value');
  const processBtn = settingsSlot.querySelector('.btn-primary');

  /* ---- build format grid ----------------------------------------- */

  FORMATS.forEach((fmt) => {
    const card = document.createElement('button');
    card.className = 'format-card' + (fmt.id === selectedFormat.id ? ' active' : '');
    card.dataset.format = fmt.id;
    card.innerHTML = `
      <span class="format-card__icon">${MUSIC_NOTE_SVG}</span>
      <span class="format-card__name">${fmt.label}</span>
      <span class="format-card__desc">${fmt.desc}</span>
    `;
    formatGrid.appendChild(card);
  });

  function onFormatClick(e) {
    const card = e.target.closest('.format-card');
    if (!card) return;
    const fmt = FORMATS.find((f) => f.id === card.dataset.format);
    if (!fmt) return;

    selectedFormat = fmt;
    formatGrid.querySelectorAll('.format-card').forEach((c) =>
      c.classList.toggle('active', c.dataset.format === fmt.id),
    );

    // Show MP3 quality slider only when MP3 is selected
    mp3QualitySection.style.display = fmt.id === 'mp3' ? '' : 'none';
  }

  formatGrid.addEventListener('click', onFormatClick);
  cleanups.push(() => formatGrid.removeEventListener('click', onFormatClick));

  /* ---- quality slider -------------------------------------------- */

  function updateSliderFill(slider) {
    const min = parseFloat(slider.min);
    const max = parseFloat(slider.max);
    const val = parseFloat(slider.value);
    
    const minVal = isNaN(min) ? 0 : min;
    const maxVal = isNaN(max) ? 100 : max;
    const currentVal = isNaN(val) ? 0 : val;
    
    const percent = maxVal !== minVal ? ((currentVal - minVal) / (maxVal - minVal)) * 100 : 0;
    slider.style.setProperty('--fill', `${percent}%`);
  }

  function onQualityInput() {
    qualityLabel.textContent = qualitySlider.value;
    updateSliderFill(qualitySlider);
  }

  qualitySlider.addEventListener('input', onQualityInput);
  cleanups.push(() => qualitySlider.removeEventListener('input', onQualityInput));

  // Initialize fill
  updateSliderFill(qualitySlider);

  /* ---- process --------------------------------------------------- */

  async function onProcess() {
    processBtn.disabled = true;
    resultsSlot.style.display = 'none';
    progressSlot.style.display = '';

    const progress = createProgressBar(progressSlot);

    try {
      await ffmpegEngine.init((p) => progress.update(p * 0.1, 'Loading FFmpeg…'));

      const inputExt = file.name.substring(file.name.lastIndexOf('.')) || '.mp3';
      const inputName = 'input' + inputExt;
      const outputName = 'output' + selectedFormat.ext;

      const fileData = new Uint8Array(await file.arrayBuffer());
      await ffmpegEngine.writeFile(inputName, fileData);

      // Build codec args (pass quality when MP3)
      const codecArgs =
        selectedFormat.id === 'mp3'
          ? selectedFormat.args(qualitySlider.value)
          : selectedFormat.args();

      const args = ['-i', inputName, ...codecArgs, outputName];
      await ffmpegEngine.run(args, (p) => progress.update(10 + p * 0.85, 'Converting…'));

      const outputData = await ffmpegEngine.readFile(outputName);
      const outputBlob = new Blob([outputData.buffer], { type: selectedFormat.mime });

      progress.update(100, 'Done!');

      const origFormat = detectFormat(file.name) || inputExt.replace('.', '').toUpperCase();

      resultsSlot.innerHTML = `
        <div class="results-card glass-card">
          <h3>Conversion Results</h3>
          <div class="result-stats">
            <div class="stat">
              <span class="stat-label">Format</span>
              <span class="stat-value">${origFormat} → ${selectedFormat.label}</span>
            </div>
            <div class="stat">
              <span class="stat-label">Original size</span>
              <span class="stat-value">${formatFileSize(file.size)}</span>
            </div>
            <div class="stat">
              <span class="stat-label">Converted size</span>
              <span class="stat-value">${formatFileSize(outputBlob.size)}</span>
            </div>
          </div>
          <div class="download-slot" style="margin-top: var(--space-md); text-align: center;"></div>
        </div>
      `;

      const downloadSlot = resultsSlot.querySelector('.download-slot');
      const baseName = file.name.replace(/\.[^.]+$/, '');
      createDownloadLink(downloadSlot, outputBlob, `${baseName}${selectedFormat.ext}`);

      resultsSlot.style.display = '';
      resultsSlot.classList.add('slide-up');

      await ffmpegEngine.deleteFile(inputName).catch(() => {});
      await ffmpegEngine.deleteFile(outputName).catch(() => {});
    } catch (err) {
      console.error('[Converter]', err);
      progressSlot.innerHTML = `<p class="error-message">❌ Conversion failed: ${err.message}</p>`;
    } finally {
      processBtn.disabled = false;
    }
  }

  processBtn.addEventListener('click', onProcess);
  cleanups.push(() => processBtn.removeEventListener('click', onProcess));

  return function cleanup() {
    cleanups.forEach((fn) => fn());
    cleanups.length = 0;
  };
}
