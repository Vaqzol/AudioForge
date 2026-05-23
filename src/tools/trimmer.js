/**
 * Audio Trimmer Tool Settings & Actions
 *
 * Trims audio with start/end time selection using a draggable visual region.
 *
 * @module tools/trimmer
 */

import { createProgressBar } from '../components/progress-bar.js';
import { ffmpegEngine } from '../core/ffmpeg-engine.js';
import {
  formatFileSize,
  formatDuration,
  createDownloadLink,
} from '../core/audio-utils.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function secsToMMSS(totalSec) {
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function mmssToSecs(str) {
  const parts = str.split(':');
  if (parts.length !== 2) return NaN;
  const m = parseInt(parts[0], 10);
  const s = parseInt(parts[1], 10);
  if (isNaN(m) || isNaN(s)) return NaN;
  return m * 60 + s;
}

/* ------------------------------------------------------------------ */
/*  Main export                                                       */
/* ------------------------------------------------------------------ */

/**
 * Render the Audio Trimmer settings panel into `settingsSlot`.
 *
 * @param {HTMLElement} settingsSlot
 * @param {File} file
 * @param {object} metadata
 * @param {HTMLElement} progressSlot
 * @param {HTMLElement} resultsSlot
 * @param {object} wavesurferInstance — persistent WaveSurfer instance
 * @returns {Function} cleanup
 */
export function initTrimmerSettings(settingsSlot, file, metadata, progressSlot, resultsSlot, wavesurferInstance) {
  const cleanups = [];
  const audioDuration = metadata.duration || 0;

  settingsSlot.innerHTML = `
    <div class="tool-settings">
      <h3 class="tool-settings__title">Trimming Selection</h3>
      
      <div class="trim-controls">
        <div class="time-inputs" style="display: flex; gap: var(--space-md); align-items: center; flex-wrap: wrap; margin-bottom: var(--space-md);">
          <label class="setting-group" style="flex: 1; min-width: 120px;">
            <span class="setting-group__label">Start Time</span>
            <input type="text" class="number-input input-start" value="00:00" placeholder="MM:SS" style="text-align: center; padding: 10px; width: 100%;" />
          </label>
          <label class="setting-group" style="flex: 1; min-width: 120px;">
            <span class="setting-group__label">End Time</span>
            <input type="text" class="number-input input-end" value="00:30" placeholder="MM:SS" style="text-align: center; padding: 10px; width: 100%;" />
          </label>
          <div class="trimmer-controls__region-info" style="align-self: flex-end; padding: 10px 16px; font-size: 0.85rem; font-weight: 500; color: var(--text-secondary); background: hsla(240, 12%, 14%, 0.5); border-radius: var(--radius-md); border: 1px solid var(--bg-glass-border);">
            Duration: <strong class="trim-duration" style="color: var(--accent-primary);">00:30</strong>
          </div>
        </div>

        <div class="trim-actions" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: var(--space-md); margin-bottom: var(--space-md);">
          <button class="btn-secondary btn-preview">Preview Selection</button>
          <label class="toggle-switch">
            <input type="checkbox" class="keep-format-check" checked />
            <span class="toggle-switch__track"></span>
            <span class="toggle-switch__label">Keep original format</span>
          </label>
        </div>
      </div>

      <!-- process button -->
      <div class="action-section" style="margin-top: var(--space-lg); text-align: center;">
        <button class="btn-primary" style="width: 100%;">Trim Audio</button>
      </div>
    </div>
  `;

  /* ---- element references ---------------------------------------- */

  const inputStart = settingsSlot.querySelector('.input-start');
  const inputEnd = settingsSlot.querySelector('.input-end');
  const trimDurationEl = settingsSlot.querySelector('.trim-duration');
  const previewBtn = settingsSlot.querySelector('.btn-preview');
  const keepFormatCheck = settingsSlot.querySelector('.keep-format-check');
  const processBtn = settingsSlot.querySelector('.btn-primary');

  /* ---- register regions plugin ----------------------------------- */

  const regionsPlugin = wavesurferInstance.registerPlugin(RegionsPlugin.create());

  const regionEnd = Math.min(audioDuration, 30);
  const activeRegion = regionsPlugin.addRegion({
    start: 0,
    end: regionEnd,
    color: 'rgba(170, 59, 255, 0.2)',
    drag: true,
    resize: true,
  });

  inputStart.value = secsToMMSS(0);
  inputEnd.value = secsToMMSS(regionEnd);
  updateDurationLabel();

  function updateDurationLabel() {
    const s = mmssToSecs(inputStart.value) || 0;
    const e = mmssToSecs(inputEnd.value) || 0;
    const dur = Math.max(0, e - s);
    trimDurationEl.textContent = secsToMMSS(dur);
  }

  /* ---- sync region ↔ inputs -------------------------------------- */

  const onRegionUpdate = () => {
    inputStart.value = secsToMMSS(activeRegion.start);
    inputEnd.value = secsToMMSS(activeRegion.end);
    updateDurationLabel();
  };
  activeRegion.on('update-end', onRegionUpdate);

  function onTimeInput() {
    const s = mmssToSecs(inputStart.value);
    const e = mmssToSecs(inputEnd.value);
    if (isNaN(s) || isNaN(e) || s >= e) return;
    activeRegion.setOptions({ start: s, end: e });
    updateDurationLabel();
  }
  inputStart.addEventListener('change', onTimeInput);
  inputEnd.addEventListener('change', onTimeInput);
  cleanups.push(() => {
    inputStart.removeEventListener('change', onTimeInput);
    inputEnd.removeEventListener('change', onTimeInput);
  });

  /* ---- preview --------------------------------------------------- */

  function onPreview() {
    if (activeRegion) activeRegion.play();
  }
  previewBtn.addEventListener('click', onPreview);
  cleanups.push(() => previewBtn.removeEventListener('click', onPreview));

  /* ---- process --------------------------------------------------- */

  async function onProcess() {
    const startSec = mmssToSecs(inputStart.value);
    const endSec = mmssToSecs(inputEnd.value);
    if (isNaN(startSec) || isNaN(endSec) || startSec >= endSec) {
      alert('Please set a valid start and end time.');
      return;
    }

    processBtn.disabled = true;
    resultsSlot.style.display = 'none';
    progressSlot.style.display = '';

    const progress = createProgressBar(progressSlot);

    try {
      await ffmpegEngine.init((p) => progress.update(p * 0.1, 'Loading FFmpeg…'));

      const ext = file.name.substring(file.name.lastIndexOf('.')) || '.mp3';
      const inputName = 'input' + ext;
      const keepFormat = keepFormatCheck.checked;
      const outputExt = keepFormat ? ext : '.mp3';
      const outputName = 'output' + outputExt;

      const fileData = new Uint8Array(await file.arrayBuffer());
      await ffmpegEngine.writeFile(inputName, fileData);

      const startStr = startSec.toFixed(2);
      const endStr = endSec.toFixed(2);

      let args;
      if (keepFormat) {
        args = ['-ss', startStr, '-to', endStr, '-i', inputName, '-c', 'copy', outputName];
      } else {
        args = [
          '-ss', startStr, '-to', endStr,
          '-i', inputName,
          '-c:a', 'libmp3lame', '-q:a', '2',
          outputName,
        ];
      }

      await ffmpegEngine.run(args, (p) => progress.update(10 + p * 0.85, 'Trimming…'));

      const outputData = await ffmpegEngine.readFile(outputName);
      const mime = keepFormat ? (file.type || 'audio/mpeg') : 'audio/mpeg';
      const outputBlob = new Blob([outputData.buffer], { type: mime });

      progress.update(100, 'Done!');

      const trimmedDuration = endSec - startSec;

      resultsSlot.innerHTML = `
        <div class="results-card glass-card">
          <h3>Trim Results</h3>
          <div class="result-stats">
            <div class="stat">
              <span class="stat-label">Original duration</span>
              <span class="stat-value">${formatDuration(audioDuration)}</span>
            </div>
            <div class="stat">
              <span class="stat-label">Trimmed duration</span>
              <span class="stat-value">${formatDuration(trimmedDuration)}</span>
            </div>
            <div class="stat">
              <span class="stat-label">Original size</span>
              <span class="stat-value">${formatFileSize(file.size)}</span>
            </div>
            <div class="stat">
              <span class="stat-label">Trimmed size</span>
              <span class="stat-value">${formatFileSize(outputBlob.size)}</span>
            </div>
          </div>
          <div class="download-slot" style="margin-top: var(--space-md); text-align: center;"></div>
        </div>
      `;

      const downloadSlot = resultsSlot.querySelector('.download-slot');
      const baseName = file.name.replace(/\.[^.]+$/, '');
      createDownloadLink(downloadSlot, outputBlob, `${baseName}_trimmed${outputExt}`);

      resultsSlot.style.display = '';
      resultsSlot.classList.add('slide-up');

      await ffmpegEngine.deleteFile(inputName).catch(() => {});
      await ffmpegEngine.deleteFile(outputName).catch(() => {});
    } catch (err) {
      console.error('[Trimmer]', err);
      progressSlot.innerHTML = `<p class="error-message">❌ Trimming failed: ${err.message}</p>`;
    } finally {
      processBtn.disabled = false;
    }
  }

  processBtn.addEventListener('click', onProcess);
  cleanups.push(() => processBtn.removeEventListener('click', onProcess));

  return function cleanup() {
    if (activeRegion) activeRegion.remove();
    regionsPlugin.destroy();
    cleanups.forEach((fn) => fn());
    cleanups.length = 0;
  };
}
