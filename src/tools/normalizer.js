/**
 * Volume Normalizer Tool Settings & Actions
 *
 * Normalizes audio loudness using the loudnorm filter.
 *
 * @module tools/normalizer
 */

import { createProgressBar } from '../components/progress-bar.js';
import { ffmpegEngine } from '../core/ffmpeg-engine.js';
import {
  formatFileSize,
  createDownloadLink,
  detectFormat,
} from '../core/audio-utils.js';

const LUFS_PRESETS = [
  { value: -16, label: 'Podcast (-16)' },
  { value: -14, label: 'Music (-14)' },
  { value: -23, label: 'Broadcast (-23)' },
];

/* ------------------------------------------------------------------ */
/*  Main export                                                       */
/* ------------------------------------------------------------------ */

/**
 * Render the Volume Normalizer settings panel into `settingsSlot`.
 *
 * @param {HTMLElement} settingsSlot
 * @param {File} file
 * @param {object} metadata
 * @param {HTMLElement} progressSlot
 * @param {HTMLElement} resultsSlot
 * @returns {Function} cleanup
 */
export function initNormalizerSettings(settingsSlot, file, metadata, progressSlot, resultsSlot) {
  const cleanups = [];

  settingsSlot.innerHTML = `
    <div class="tool-settings">
      <h3 class="tool-settings__title">Normalization Settings</h3>
      
      <!-- Target loudness -->
      <div class="setting-group">
        <label class="setting-group__label">
          Target loudness: <span class="setting-group__value"><span class="lufs-value">-16</span> LUFS</span>
        </label>
        <input type="range" class="range-slider slider-lufs" min="-24" max="-8" step="1" value="-16" />
        <div class="preset-labels" style="display: flex; gap: var(--space-xs); margin-top: var(--space-xs);">
          ${LUFS_PRESETS.map(
            (p) => `<button class="btn-preset-small" data-lufs="${p.value}">${p.label}</button>`,
          ).join('')}
        </div>
      </div>

      <!-- True peak limit -->
      <div class="setting-group" style="margin-top: var(--space-md);">
        <label class="setting-group__label">
          True peak limit: <span class="setting-group__value"><span class="tp-value">-1.5</span> dB</span>
        </label>
        <input type="range" class="range-slider slider-tp" min="-3" max="0" step="0.5" value="-1.5" />
      </div>

      <!-- Loudness range -->
      <div class="setting-group" style="margin-top: var(--space-md);">
        <label class="setting-group__label">
          Loudness range: <span class="setting-group__value"><span class="lra-value">11</span></span>
        </label>
        <input type="range" class="range-slider slider-lra" min="1" max="20" step="1" value="11" />
      </div>

      <!-- Output format -->
      <div class="setting-group" style="margin-top: var(--space-md);">
        <label class="setting-group__label">Output format</label>
        <select class="select-input output-format" style="width: 100%; max-width: none;">
          <option value="keep">Keep original</option>
          <option value="mp3">MP3</option>
          <option value="wav">WAV</option>
          <option value="ogg">OGG</option>
          <option value="flac">FLAC</option>
        </select>
      </div>

      <!-- process button -->
      <div class="action-section" style="margin-top: var(--space-lg); text-align: center;">
        <button class="btn-primary" style="width: 100%;">Normalize Audio</button>
      </div>
    </div>
  `;

  /* ---- element references ---------------------------------------- */

  const lufsSlider = settingsSlot.querySelector('.slider-lufs');
  const lufsLabel = settingsSlot.querySelector('.lufs-value');
  const tpSlider = settingsSlot.querySelector('.slider-tp');
  const tpLabel = settingsSlot.querySelector('.tp-value');
  const lraSlider = settingsSlot.querySelector('.slider-lra');
  const lraLabel = settingsSlot.querySelector('.lra-value');
  const outputFormatSelect = settingsSlot.querySelector('.output-format');
  const presetBtns = settingsSlot.querySelectorAll('.btn-preset-small');
  const processBtn = settingsSlot.querySelector('.btn-primary');

  /* ---- slider live labels ---------------------------------------- */

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

  function updateActivePreset() {
    const val = parseInt(lufsSlider.value, 10);
    presetBtns.forEach((btn) => {
      const btnVal = parseInt(btn.dataset.lufs, 10);
      btn.classList.toggle('active', btnVal === val);
    });
  }

  function onLufsInput() {
    lufsLabel.textContent = lufsSlider.value;
    updateSliderFill(lufsSlider);
    updateActivePreset();
  }
  function onTpInput() {
    tpLabel.textContent = tpSlider.value;
    updateSliderFill(tpSlider);
  }
  function onLraInput() {
    lraLabel.textContent = lraSlider.value;
    updateSliderFill(lraSlider);
  }

  lufsSlider.addEventListener('input', onLufsInput);
  tpSlider.addEventListener('input', onTpInput);
  lraSlider.addEventListener('input', onLraInput);
  cleanups.push(() => {
    lufsSlider.removeEventListener('input', onLufsInput);
    tpSlider.removeEventListener('input', onTpInput);
    lraSlider.removeEventListener('input', onLraInput);
  });

  // Initialize fills & active presets
  updateSliderFill(lufsSlider);
  updateSliderFill(tpSlider);
  updateSliderFill(lraSlider);
  updateActivePreset();

  /* ---- preset buttons -------------------------------------------- */

  function onPresetClick(e) {
    const lufs = e.currentTarget.dataset.lufs;
    lufsSlider.value = lufs;
    lufsLabel.textContent = lufs;
    updateSliderFill(lufsSlider);
    updateActivePreset();
  }

  presetBtns.forEach((b) => b.addEventListener('click', onPresetClick));
  cleanups.push(() => presetBtns.forEach((b) => b.removeEventListener('click', onPresetClick)));

  /* ---- codec helpers --------------------------------------------- */

  function resolveOutputFormat() {
    const choice = outputFormatSelect.value;

    const map = {
      mp3:  { ext: '.mp3',  codecArgs: ['-c:a', 'libmp3lame', '-q:a', '2'], mime: 'audio/mpeg' },
      wav:  { ext: '.wav',  codecArgs: ['-c:a', 'pcm_s16le'],               mime: 'audio/wav' },
      ogg:  { ext: '.ogg',  codecArgs: ['-c:a', 'libvorbis', '-q:a', '5'],  mime: 'audio/ogg' },
      flac: { ext: '.flac', codecArgs: ['-c:a', 'flac'],                    mime: 'audio/flac' },
    };

    if (choice === 'keep') {
      const detected = (detectFormat(file.name) || 'mp3').toLowerCase();
      return map[detected] || map.mp3;
    }

    return map[choice] || map.mp3;
  }

  /* ---- process --------------------------------------------------- */

  async function onProcess() {
    processBtn.disabled = true;
    resultsSlot.style.display = 'none';
    progressSlot.style.display = '';

    const progress = createProgressBar(progressSlot);

    try {
      await ffmpegEngine.init((p) => progress.update(p * 0.1, 'Loading FFmpeg…'));

      const srcExt = file.name.substring(file.name.lastIndexOf('.')) || '.mp3';
      const inputName = 'input' + srcExt;
      const { ext: outExt, codecArgs, mime } = resolveOutputFormat();
      const outputName = 'output' + outExt;

      const fileData = new Uint8Array(await file.arrayBuffer());
      await ffmpegEngine.writeFile(inputName, fileData);

      const lufs = lufsSlider.value;
      const tp = tpSlider.value;
      const lra = lraSlider.value;
      const afFilter = `loudnorm=I=${lufs}:TP=${tp}:LRA=${lra}`;

      const args = ['-i', inputName, '-af', afFilter, ...codecArgs, outputName];
      await ffmpegEngine.run(args, (p) => progress.update(10 + p * 0.85, 'Normalizing…'));

      const outputData = await ffmpegEngine.readFile(outputName);
      const outputBlob = new Blob([outputData.buffer], { type: mime });

      progress.update(100, 'Done!');

      resultsSlot.innerHTML = `
        <div class="results-card glass-card">
          <h3>Normalization Results</h3>
          <div class="result-stats">
            <div class="stat">
              <span class="stat-label">Target loudness</span>
              <span class="stat-value">${lufs} LUFS</span>
            </div>
            <div class="stat">
              <span class="stat-label">True peak limit</span>
              <span class="stat-value">${tp} dB</span>
            </div>
            <div class="stat">
              <span class="stat-label">Original size</span>
              <span class="stat-value">${formatFileSize(file.size)}</span>
            </div>
            <div class="stat">
              <span class="stat-label">Normalized size</span>
              <span class="stat-value">${formatFileSize(outputBlob.size)}</span>
            </div>
          </div>
          <div class="download-slot" style="margin-top: var(--space-md); text-align: center;"></div>
        </div>
      `;

      const downloadSlot = resultsSlot.querySelector('.download-slot');
      const baseName = file.name.replace(/\.[^.]+$/, '');
      createDownloadLink(downloadSlot, outputBlob, `${baseName}_normalized${outExt}`);

      resultsSlot.style.display = '';
      resultsSlot.classList.add('slide-up');

      await ffmpegEngine.deleteFile(inputName).catch(() => {});
      await ffmpegEngine.deleteFile(outputName).catch(() => {});
    } catch (err) {
      console.error('[Normalizer]', err);
      progressSlot.innerHTML = `<p class="error-message">❌ Normalization failed: ${err.message}</p>`;
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
