/**
 * Audio Compressor Tool Settings & Actions
 *
 * Reduces audio file size using preset bitrates or calculating target size bitrate.
 *
 * @module tools/compressor
 */

import { createProgressBar } from '../components/progress-bar.js';
import { ffmpegEngine } from '../core/ffmpeg-engine.js';
import {
  formatFileSize,
  createDownloadLink,
} from '../core/audio-utils.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function bitrateForTargetSize(targetBytes, durationSec) {
  if (!durationSec || durationSec <= 0) return 0;
  // Apply a 7% safety margin to account for container overhead and metadata tags
  const targetBytesWithMargin = targetBytes * 0.93;
  const rawBitrate = (targetBytesWithMargin * 8) / (durationSec * 1000);
  // Floor the bitrate to ensure it remains strictly under the user's target limit, capped between 32 and 320 kbps
  return Math.max(32, Math.min(320, Math.floor(rawBitrate)));
}

function parseTargetBytes(value, unit) {
  const num = parseFloat(value);
  if (isNaN(num) || num <= 0) return 0;
  return unit === 'MB' ? num * 1000 * 1000 : num * 1000;
}

/* ------------------------------------------------------------------ */
/*  Main export                                                       */
/* ------------------------------------------------------------------ */

/**
 * Render the Audio Compressor settings panel into `settingsSlot`.
 *
 * @param {HTMLElement} settingsSlot – DOM element to render into.
 * @param {File} file – Uploaded audio file object.
 * @param {object} metadata – Decoded audio metadata.
 * @param {HTMLElement} progressSlot – DOM element to show progress bar in.
 * @param {HTMLElement} resultsSlot – DOM element to render output comparison and download in.
 * @returns {Function} cleanup – call to tear down listeners.
 */
export function initCompressorSettings(settingsSlot, file, metadata, progressSlot, resultsSlot) {
  const cleanups = [];
  const audioDuration = metadata.duration || 0;

  settingsSlot.innerHTML = `
    <div class="tool-settings">
      <h3 class="tool-settings__title">Compression Settings</h3>
      
      <!-- mode toggle -->
      <div class="radio-group">
        <div class="radio-group__option">
          <input type="radio" id="comp-mode-preset" name="comp-mode" value="preset" checked />
          <label for="comp-mode-preset">Quality Preset</label>
        </div>
        <div class="radio-group__option">
          <input type="radio" id="comp-mode-target" name="comp-mode" value="target" />
          <label for="comp-mode-target">Target File Size</label>
        </div>
      </div>

      <!-- preset mode -->
      <div class="mode-panel mode-panel--preset" style="margin-top: var(--space-md);">
        <div class="quality-presets">
          <button class="quality-preset" data-bitrate="256">
            High
            <span class="quality-preset__sub">256 kbps</span>
          </button>
          <button class="quality-preset active" data-bitrate="128">
            Medium
            <span class="quality-preset__sub">128 kbps</span>
          </button>
          <button class="quality-preset" data-bitrate="64">
            Low
            <span class="quality-preset__sub">64 kbps</span>
          </button>
        </div>
        <div class="setting-group" style="margin-top: var(--space-lg);">
          <label class="setting-group__label">
            Custom bitrate
            <span class="setting-group__value"><span class="bitrate-value">128</span> kbps</span>
          </label>
          <input type="range" class="range-slider" min="32" max="320" step="8" value="128" />
        </div>
      </div>

      <!-- target size mode -->
      <div class="mode-panel mode-panel--target" style="display:none; margin-top: var(--space-md);">
        <div class="setting-group">
          <label class="setting-group__label">Target File Size</label>
          <div class="target-size-input">
            <input type="number" class="number-input" min="0.1" step="0.1" placeholder="Size" value="5" />
            <div class="target-size-input__unit-selector">
              <span class="target-size-input__unit active" data-unit="MB">MB</span>
              <span class="target-size-input__unit" data-unit="KB">KB</span>
            </div>
          </div>
        </div>
        <p class="calc-bitrate" style="margin-top: var(--space-sm); font-size: 0.85rem; color: var(--text-secondary);"></p>
        <p class="target-warning" style="display:none; margin-top: var(--space-xs); font-size: 0.85rem;"></p>
      </div>

      <!-- process button -->
      <div class="action-section" style="margin-top: var(--space-lg); text-align: center;">
        <button class="btn-primary" style="width: 100%;">Compress Audio</button>
      </div>
    </div>
  `;

  /* ---- element references ---------------------------------------- */

  const presetPanel = settingsSlot.querySelector('.mode-panel--preset');
  const targetPanel = settingsSlot.querySelector('.mode-panel--target');
  const bitrateSlider = presetPanel.querySelector('.range-slider');
  const bitrateLabel = presetPanel.querySelector('.bitrate-value');
  const presetButtons = presetPanel.querySelectorAll('.quality-preset');
  const sizeInput = targetPanel.querySelector('.target-size-input input[type="number"]');
  const calcBitrateP = targetPanel.querySelector('.calc-bitrate');
  const targetWarning = targetPanel.querySelector('.target-warning');
  const processBtn = settingsSlot.querySelector('.btn-primary');

  /* ---- state ----------------------------------------------------- */

  let mode = 'preset'; // 'preset' | 'target'
  let selectedBitrate = 128;
  let selectedUnit = 'MB';

  /* ---- mode toggle ----------------------------------------------- */

  const modeRadios = settingsSlot.querySelectorAll('input[name="comp-mode"]');
  function onModeChange(e) {
    mode = e.target.value;
    presetPanel.style.display = mode === 'preset' ? '' : 'none';
    targetPanel.style.display = mode === 'target' ? '' : 'none';

    if (mode === 'target') updateTargetCalc();
  }
  modeRadios.forEach((r) => r.addEventListener('change', onModeChange));
  cleanups.push(() => modeRadios.forEach((r) => r.removeEventListener('change', onModeChange)));

  /* ---- preset controls ------------------------------------------- */

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

  function onPresetClick(e) {
    const btn = e.currentTarget;
    selectedBitrate = parseInt(btn.dataset.bitrate, 10);
    presetButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    bitrateSlider.value = selectedBitrate;
    bitrateLabel.textContent = selectedBitrate;
    updateSliderFill(bitrateSlider);
  }
  presetButtons.forEach((b) => b.addEventListener('click', onPresetClick));
  cleanups.push(() => presetButtons.forEach((b) => b.removeEventListener('click', onPresetClick)));

  function onSliderInput() {
    selectedBitrate = parseInt(bitrateSlider.value, 10);
    bitrateLabel.textContent = selectedBitrate;
    presetButtons.forEach((b) => b.classList.remove('active'));
    updateSliderFill(bitrateSlider);
  }
  bitrateSlider.addEventListener('input', onSliderInput);
  cleanups.push(() => bitrateSlider.removeEventListener('input', onSliderInput));

  // Initialize fill
  updateSliderFill(bitrateSlider);

  /* ---- target-size controls -------------------------------------- */

  const unitSpans = targetPanel.querySelectorAll('.target-size-input__unit');
  function onUnitClick(e) {
    const span = e.currentTarget;
    selectedUnit = span.dataset.unit;
    unitSpans.forEach((s) => s.classList.toggle('active', s.dataset.unit === selectedUnit));
    updateTargetCalc();
  }
  unitSpans.forEach((s) => s.addEventListener('click', onUnitClick));
  cleanups.push(() => unitSpans.forEach((s) => s.removeEventListener('click', onUnitClick)));

  function onSizeInput() {
    updateTargetCalc();
  }
  sizeInput.addEventListener('input', onSizeInput);
  cleanups.push(() => sizeInput.removeEventListener('input', onSizeInput));

  function updateTargetCalc() {
    const targetBytes = parseTargetBytes(sizeInput.value, selectedUnit);
    const br = bitrateForTargetSize(targetBytes, audioDuration);

    if (targetBytes <= 0 || br <= 0) {
      calcBitrateP.textContent = '';
      targetWarning.style.display = 'none';
      processBtn.disabled = true;
      return;
    }

    calcBitrateP.textContent = `Estimated bitrate: ${br} kbps`;

    if (targetBytes >= file.size) {
      targetWarning.style.display = '';
      targetWarning.textContent = '❌ Target size is larger than original';
      targetWarning.style.color = 'var(--error)';
      processBtn.disabled = true;
    } else if (br < 64) {
      targetWarning.style.display = '';
      targetWarning.textContent = '⚠️ Quality may be noticeably reduced';
      targetWarning.style.color = 'var(--warning)';
      processBtn.disabled = false;
    } else {
      targetWarning.style.display = 'none';
      processBtn.disabled = false;
    }
  }

  /* ---- process --------------------------------------------------- */

  async function onProcess() {
    let bitrate;
    if (mode === 'preset') {
      bitrate = selectedBitrate;
    } else {
      const targetBytes = parseTargetBytes(sizeInput.value, selectedUnit);
      bitrate = bitrateForTargetSize(targetBytes, audioDuration);
      if (bitrate <= 0) return;
    }

    processBtn.disabled = true;
    resultsSlot.style.display = 'none';
    progressSlot.style.display = '';

    const progress = createProgressBar(progressSlot);

    try {
      await ffmpegEngine.init((p) => progress.update(p * 0.1, 'Loading FFmpeg…'));

      const inputName = 'input' + (file.name.substring(file.name.lastIndexOf('.')) || '.mp3');
      const outputName = 'output.mp3';

      const fileData = new Uint8Array(await file.arrayBuffer());
      await ffmpegEngine.writeFile(inputName, fileData);

      const args = ['-i', inputName, '-c:a', 'libmp3lame', '-b:a', bitrate + 'k', outputName];
      await ffmpegEngine.run(args, (p) => progress.update(10 + p * 0.85, 'Compressing…'));

      const outputData = await ffmpegEngine.readFile(outputName);
      const outputBlob = new Blob([outputData.buffer], { type: 'audio/mpeg' });

      progress.update(100, 'Done!');

      const originalSize = file.size;
      const compressedSize = outputBlob.size;
      const ratio = ((1 - compressedSize / originalSize) * 100).toFixed(1);
      const savings = originalSize - compressedSize;

      resultsSlot.innerHTML = `
        <div class="results-card glass-card">
          <h3>Compression Results</h3>
          <div class="result-stats">
            <div class="stat">
              <span class="stat-label">Original size</span>
              <span class="stat-value">${formatFileSize(originalSize)}</span>
            </div>
            <div class="stat">
              <span class="stat-label">Compressed size</span>
              <span class="stat-value">${formatFileSize(compressedSize)}</span>
            </div>
            <div class="stat">
              <span class="stat-label">Compression ratio</span>
              <span class="stat-value">${ratio}%</span>
            </div>
            <div class="stat">
              <span class="stat-label">Savings</span>
              <span class="stat-value">${formatFileSize(savings)}</span>
            </div>
          </div>
          <div class="download-slot" style="margin-top: var(--space-md); text-align: center;"></div>
        </div>
      `;

      const downloadSlot = resultsSlot.querySelector('.download-slot');
      const baseName = file.name.replace(/\.[^.]+$/, '');
      createDownloadLink(downloadSlot, outputBlob, `${baseName}_compressed.mp3`);

      resultsSlot.style.display = '';
      resultsSlot.classList.add('slide-up');

      await ffmpegEngine.deleteFile(inputName).catch(() => {});
      await ffmpegEngine.deleteFile(outputName).catch(() => {});
    } catch (err) {
      console.error('[Compressor]', err);
      progressSlot.innerHTML = `<p class="error-message">❌ Compression failed: ${err.message}</p>`;
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
