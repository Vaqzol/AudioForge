/**
 * Waveform Viewer Tool
 *
 * Visualise and analyse audio files. No processing — just playback,
 * zoom, colour customisation, file metadata and PNG export.
 *
 * @module tools/waveform-viewer
 */

import { createDropZone } from '../components/drop-zone.js';
import { createWaveform } from '../components/waveform.js';
import { createFileInfo } from '../components/file-info.js';
import {
  getAudioMetadata,
  formatFileSize,
  formatDuration,
  createDownloadLink,
} from '../core/audio-utils.js';

/* ------------------------------------------------------------------ */
/*  Main export                                                       */
/* ------------------------------------------------------------------ */

/**
 * Render the Waveform Viewer tool into `container`.
 *
 * @param {HTMLElement} container
 * @returns {Function} cleanup
 */
export function createWaveformTool(container) {
  const cleanups = [];
  let wavesurferInstance = null;
  let currentZoom = 1; // min-pps (pixels per second)

  /* ---- scaffold -------------------------------------------------- */

  container.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'tool-page';
  wrapper.innerHTML = `
    <header class="tool-header">
      <h1>Waveform Viewer</h1>
      <p class="tool-description">Visualize and analyze your audio files</p>
    </header>

    <section class="drop-zone-section"></section>

    <section class="viewer-section" style="display:none">
      <!-- Waveform -->
      <div class="waveform-large glass-card">
        <div class="waveform-slot"></div>

        <!-- Playback controls -->
        <div class="playback-controls">
          <button class="btn-icon btn-skip-back" title="Restart">⏮</button>
          <button class="btn-icon btn-play" title="Play / Pause">▶️</button>
          <button class="btn-icon btn-stop" title="Stop">⏹</button>
          <span class="time-display">0:00 / 0:00</span>
        </div>

        <!-- Zoom controls -->
        <div class="zoom-controls">
          <button class="btn-icon btn-zoom-out" title="Zoom out">➖</button>
          <span class="zoom-level">1×</span>
          <button class="btn-icon btn-zoom-in" title="Zoom in">➕</button>
        </div>

        <!-- Colour picker -->
        <div class="color-controls">
          <label>
            Waveform colour
            <input type="color" class="color-picker" value="#aa3bff" />
          </label>
        </div>
      </div>

      <!-- File metadata -->
      <div class="file-info-slot glass-card"></div>

      <!-- Export -->
      <div class="export-section">
        <button class="btn-secondary btn-export-png">Export Waveform as PNG</button>
      </div>
    </section>
  `;

  container.appendChild(wrapper);

  /* ---- element references ---------------------------------------- */

  const dropZoneSection = wrapper.querySelector('.drop-zone-section');
  const viewerSection = wrapper.querySelector('.viewer-section');
  const waveformSlot = wrapper.querySelector('.waveform-slot');
  const fileInfoSlot = wrapper.querySelector('.file-info-slot');

  const btnPlay = wrapper.querySelector('.btn-play');
  const btnStop = wrapper.querySelector('.btn-stop');
  const btnSkipBack = wrapper.querySelector('.btn-skip-back');
  const timeDisplay = wrapper.querySelector('.time-display');

  const btnZoomIn = wrapper.querySelector('.btn-zoom-in');
  const btnZoomOut = wrapper.querySelector('.btn-zoom-out');
  const zoomLabel = wrapper.querySelector('.zoom-level');

  const colorPicker = wrapper.querySelector('.color-picker');
  const btnExport = wrapper.querySelector('.btn-export-png');

  /* ---- drop zone ------------------------------------------------- */

  const dropZone = createDropZone(dropZoneSection, {
    accept: 'audio/*',
    onFile: handleFile,
  });
  if (dropZone && dropZone.destroy) cleanups.push(() => dropZone.destroy());

  /* ---- file handling --------------------------------------------- */

  async function handleFile(file) {
    dropZone.setLoading(true, 'Analyzing audio file...');

    try {
      const metadata = await getAudioMetadata(file);
      fileInfoSlot.innerHTML = '';
      createFileInfo(fileInfoSlot, metadata);

      // Create waveform
      waveformSlot.innerHTML = '';
      const waveform = createWaveform(waveformSlot, {
        height: 200,
        waveColor: colorPicker.value,
        progressColor: shiftColor(colorPicker.value, -40),
      });
      wavesurferInstance = waveform.wavesurfer;
      cleanups.push(() => {
        if (wavesurferInstance) {
          wavesurferInstance.destroy();
          wavesurferInstance = null;
        }
      });
      await waveform.load(file);

      currentZoom = 1;
      zoomLabel.textContent = '1×';

      // Time display updates
      const onAudioProcess = () => {
        if (!wavesurferInstance) return;
        const cur = wavesurferInstance.getCurrentTime();
        const dur = wavesurferInstance.getDuration();
        timeDisplay.textContent = `${fmtTime(cur)} / ${fmtTime(dur)}`;
      };
      wavesurferInstance.on('audioprocess', onAudioProcess);
      wavesurferInstance.on('seeking', onAudioProcess);

      // Initial time display
      const dur = wavesurferInstance.getDuration();
      timeDisplay.textContent = `0:00 / ${fmtTime(dur)}`;

      viewerSection.style.display = '';
    } catch (err) {
      console.error(err);
      alert('Error reading audio file: ' + err.message);
    } finally {
      dropZone.setLoading(false);
    }
  }

  /* ---- playback controls ----------------------------------------- */

  function onPlay() {
    if (!wavesurferInstance) return;
    wavesurferInstance.playPause();
    btnPlay.textContent = wavesurferInstance.isPlaying() ? '⏸' : '▶️';
  }

  function onStop() {
    if (!wavesurferInstance) return;
    wavesurferInstance.stop();
    btnPlay.textContent = '▶️';
  }

  function onSkipBack() {
    if (!wavesurferInstance) return;
    wavesurferInstance.seekTo(0);
  }

  btnPlay.addEventListener('click', onPlay);
  btnStop.addEventListener('click', onStop);
  btnSkipBack.addEventListener('click', onSkipBack);
  cleanups.push(() => {
    btnPlay.removeEventListener('click', onPlay);
    btnStop.removeEventListener('click', onStop);
    btnSkipBack.removeEventListener('click', onSkipBack);
  });

  /* ---- zoom controls --------------------------------------------- */

  const ZOOM_STEPS = [1, 2, 5, 10, 25, 50, 100];

  function onZoomIn() {
    if (!wavesurferInstance) return;
    const idx = ZOOM_STEPS.indexOf(currentZoom);
    if (idx < ZOOM_STEPS.length - 1) {
      currentZoom = ZOOM_STEPS[idx + 1];
    }
    wavesurferInstance.zoom(currentZoom);
    zoomLabel.textContent = `${currentZoom}×`;
  }

  function onZoomOut() {
    if (!wavesurferInstance) return;
    const idx = ZOOM_STEPS.indexOf(currentZoom);
    if (idx > 0) {
      currentZoom = ZOOM_STEPS[idx - 1];
    }
    wavesurferInstance.zoom(currentZoom);
    zoomLabel.textContent = `${currentZoom}×`;
  }

  btnZoomIn.addEventListener('click', onZoomIn);
  btnZoomOut.addEventListener('click', onZoomOut);
  cleanups.push(() => {
    btnZoomIn.removeEventListener('click', onZoomIn);
    btnZoomOut.removeEventListener('click', onZoomOut);
  });

  /* ---- colour picker --------------------------------------------- */

  function onColorChange() {
    if (!wavesurferInstance) return;
    wavesurferInstance.setOptions({
      waveColor: colorPicker.value,
      progressColor: shiftColor(colorPicker.value, -40),
    });
  }

  colorPicker.addEventListener('input', onColorChange);
  cleanups.push(() => colorPicker.removeEventListener('input', onColorChange));

  /* ---- PNG export ------------------------------------------------ */

  function onExportPNG() {
    if (!wavesurferInstance) return;
    const canvas = waveformSlot.querySelector('canvas');
    if (!canvas) {
      alert('No waveform canvas found.');
      return;
    }
    const dataURL = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataURL;
    a.download = 'waveform.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  btnExport.addEventListener('click', onExportPNG);
  cleanups.push(() => btnExport.removeEventListener('click', onExportPNG));

  /* ---- helpers --------------------------------------------------- */

  /** Quick MM:SS formatter. */
  function fmtTime(sec) {
    if (!sec || isNaN(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  /**
   * Shift a hex colour's lightness by `amount` (negative = darker).
   * Used to derive a contrasting progress colour from the wave colour.
   */
  function shiftColor(hex, amount) {
    let r = parseInt(hex.slice(1, 3), 16);
    let g = parseInt(hex.slice(3, 5), 16);
    let b = parseInt(hex.slice(5, 7), 16);
    r = Math.max(0, Math.min(255, r + amount));
    g = Math.max(0, Math.min(255, g + amount));
    b = Math.max(0, Math.min(255, b + amount));
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  /* ---- cleanup --------------------------------------------------- */

  return function cleanup() {
    cleanups.forEach((fn) => fn());
    cleanups.length = 0;
  };
}
