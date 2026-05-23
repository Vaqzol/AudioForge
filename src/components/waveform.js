/**
 * waveform.js — WaveSurfer.js waveform display wrapper for AudioForge.
 *
 * Exports `createWaveform(options)` which creates a container housing:
 *   • A WaveSurfer.js instance for audio visualisation
 *   • Optional playback controls (play/pause, time, speed selector)
 *   • Methods: loadFile, loadUrl, getRegion, destroy, getDuration
 *   • Custom events: 'ready', 'region-update'
 */

import WaveSurfer from 'wavesurfer.js';

// ---------------------------------------------------------------------------
// SVG icons for play / pause buttons
// ---------------------------------------------------------------------------

const PLAY_ICON_SVG = `
<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
  <polygon points="6,4 20,12 6,20"></polygon>
</svg>`;

const PAUSE_ICON_SVG = `
<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
  <rect x="5"  y="4" width="4" height="16" rx="1"></rect>
  <rect x="15" y="4" width="4" height="16" rx="1"></rect>
</svg>`;

const VOLUME_HIGH_SVG = `
<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
  <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
  <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
</svg>`;

const VOLUME_LOW_SVG = `
<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
  <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
</svg>`;

const VOLUME_MUTE_SVG = `
<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
  <line x1="23" y1="9" x2="17" y2="15"></line>
  <line x1="17" y1="9" x2="23" y2="15"></line>
</svg>`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format seconds into `m:ss` display string.
 *
 * @param {number} seconds
 * @returns {string}
 */
function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Create a waveform display element wrapping WaveSurfer.js.
 *
 * @param {HTMLElement|object} [parentContainer] — Parent container to append to, or options object if no container.
 * @param {object}      [options]
 * @param {number}      [options.height=128]     — Waveform height in pixels.
 * @param {boolean}     [options.showControls=true]  — Show play/pause, time, speed controls.
 * @param {boolean}     [options.enableRegions=false] — Enable region selection (requires plugin).
 * @returns {HTMLElement} The waveform container with control methods attached.
 */
export function createWaveform(parentContainer, options = {}) {
  let actualContainer = parentContainer;
  let actualOptions = options;

  if (parentContainer && !(parentContainer instanceof HTMLElement)) {
    actualOptions = parentContainer;
    actualContainer = null;
  }

  const {
    height = 128,
    showControls = true,
    enableRegions = false,
    waveColor = '#6c5ce7',
    progressColor = '#a29bfe',
    plugins = [],
  } = actualOptions;

  // --- Outer container -------------------------------------------------------
  const wrapper = document.createElement('div');
  wrapper.className = 'waveform-wrapper';

  // --- Waveform display div --------------------------------------------------
  const display = document.createElement('div');
  display.className = 'waveform-display';
  wrapper.appendChild(display);

  // --- WaveSurfer instance ---------------------------------------------------
  /** @type {WaveSurfer|null} */
  let wavesurfer = null;

  /** @type {object|null} Active region reference (if regions are enabled). */
  let activeRegion = null;

  /**
   * Initialise (or re-initialise) the WaveSurfer instance.
   */
  function initWaveSurfer() {
    // Destroy any existing instance first.
    if (wavesurfer) {
      wavesurfer.destroy();
      wavesurfer = null;
    }

    const wsOptions = {
      container: display,
      height,
      waveColor,
      progressColor,
      cursorColor: '#00cec9',
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      responsive: true,
      plugins,
    };

    wavesurfer = WaveSurfer.create(wsOptions);
    wrapper.wavesurfer = wavesurfer;

    // Emit 'ready' custom event when WaveSurfer finishes decoding.
    wavesurfer.on('ready', () => {
      updateTimeDisplay();
      wrapper.dispatchEvent(new CustomEvent('ready'));
    });

    // Keep the time display in sync during playback.
    wavesurfer.on('audioprocess', updateTimeDisplay);
    wavesurfer.on('seeking', updateTimeDisplay);

    // Toggle play/pause icon based on WaveSurfer state.
    wavesurfer.on('play', () => updatePlayButton(true));
    wavesurfer.on('pause', () => updatePlayButton(false));
    wavesurfer.on('finish', () => updatePlayButton(false));

    // Region support (lazy-loaded plugin).
    if (enableRegions && !plugins.length) {
      initRegions();
    }
  }

  // --- Regions (optional) ----------------------------------------------------

  /**
   * Lazily load and register the Regions plugin.
   */
  async function initRegions() {
    try {
      const { default: RegionsPlugin } = await import('wavesurfer.js/dist/plugins/regions.js');
      const regions = wavesurfer.registerPlugin(RegionsPlugin.create());

      // Allow the user to drag-create a single region.
      regions.enableDragSelection({ color: 'rgba(108, 92, 231, 0.25)' });

      regions.on('region-created', (region) => {
        // Only keep one region at a time — remove previous.
        if (activeRegion && activeRegion !== region) {
          activeRegion.remove();
        }
        activeRegion = region;
        emitRegionUpdate();
      });

      regions.on('region-updated', () => emitRegionUpdate());
    } catch (err) {
      console.warn('[waveform] Could not load Regions plugin:', err);
    }
  }

  /**
   * Dispatch a 'region-update' custom event with current region bounds.
   */
  function emitRegionUpdate() {
    if (activeRegion) {
      wrapper.dispatchEvent(new CustomEvent('region-update', {
        detail: { start: activeRegion.start, end: activeRegion.end },
      }));
    }
  }

  // --- Controls (play/pause, time, speed) ------------------------------------

  /** @type {HTMLButtonElement|null} */
  let playBtn = null;

  /** @type {HTMLElement|null} */
  let timeEl = null;

  if (showControls) {
    const controls = document.createElement('div');
    controls.className = 'waveform-controls';

    // Play / Pause button
    playBtn = document.createElement('button');
    playBtn.className = 'play-btn';
    playBtn.setAttribute('aria-label', 'Play');
    playBtn.innerHTML = PLAY_ICON_SVG;
    playBtn.addEventListener('click', () => {
      if (wavesurfer) wavesurfer.playPause();
    });

    // Time display
    timeEl = document.createElement('span');
    timeEl.className = 'time-display';
    timeEl.textContent = '0:00 / 0:00';

    // Volume control container
    const volumeContainer = document.createElement('div');
    volumeContainer.className = 'volume-control';
    volumeContainer.style.marginLeft = 'auto'; // Push volume and speed to the right

    const volumeIcon = document.createElement('span');
    volumeIcon.className = 'volume-control__icon';
    volumeIcon.innerHTML = VOLUME_HIGH_SVG;

    const volumeSlider = document.createElement('input');
    volumeSlider.type = 'range';
    volumeSlider.className = 'volume-slider';
    volumeSlider.min = '0';
    volumeSlider.max = '1';
    volumeSlider.step = '0.05';
    volumeSlider.value = '1';
    volumeSlider.setAttribute('aria-label', 'Volume');
    volumeSlider.style.backgroundSize = '100% 100%';

    let lastVolume = 1;
    let isMuted = false;

    function updateVolumeIcon(val) {
      if (val === 0) {
        volumeIcon.innerHTML = VOLUME_MUTE_SVG;
      } else if (val <= 0.5) {
        volumeIcon.innerHTML = VOLUME_LOW_SVG;
      } else {
        volumeIcon.innerHTML = VOLUME_HIGH_SVG;
      }
    }

    function setVolume(val) {
      if (wavesurfer) {
        wavesurfer.setVolume(val);
      }
      volumeSlider.value = String(val);
      volumeSlider.style.backgroundSize = `${val * 100}% 100%`;
      updateVolumeIcon(val);
    }

    volumeSlider.addEventListener('input', (e) => {
      const val = Number(e.target.value);
      isMuted = val === 0;
      if (val > 0) lastVolume = val;
      setVolume(val);
    });

    volumeIcon.addEventListener('click', () => {
      if (isMuted) {
        isMuted = false;
        setVolume(lastVolume);
      } else {
        isMuted = true;
        setVolume(0);
      }
    });

    volumeContainer.appendChild(volumeIcon);
    volumeContainer.appendChild(volumeSlider);

    // Playback speed selector wrapper
    const speedSelectWrapper = document.createElement('div');
    speedSelectWrapper.className = 'select-input';

    const speedSelect = document.createElement('select');
    speedSelect.setAttribute('aria-label', 'Playback speed');
    [0.5, 0.75, 1, 1.25, 1.5, 2].forEach((rate) => {
      const opt = document.createElement('option');
      opt.value = String(rate);
      opt.textContent = `${rate}×`;
      if (rate === 1) opt.selected = true;
      speedSelect.appendChild(opt);
    });
    speedSelect.addEventListener('change', () => {
      if (wavesurfer) wavesurfer.setPlaybackRate(Number(speedSelect.value));
    });

    speedSelectWrapper.appendChild(speedSelect);
    controls.appendChild(playBtn);
    controls.appendChild(timeEl);
    controls.appendChild(volumeContainer);
    controls.appendChild(speedSelectWrapper);
    wrapper.appendChild(controls);

    // Set initial volume inside wavesurfer once loaded
    wrapper.addEventListener('ready', () => {
      if (wavesurfer) {
        wavesurfer.setVolume(Number(volumeSlider.value));
      }
    });
  }

  /**
   * Update the play/pause button icon.
   *
   * @param {boolean} isPlaying
   */
  function updatePlayButton(isPlaying) {
    if (!playBtn) return;
    playBtn.innerHTML = isPlaying ? PAUSE_ICON_SVG : PLAY_ICON_SVG;
    playBtn.setAttribute('aria-label', isPlaying ? 'Pause' : 'Play');
  }

  /**
   * Refresh the time display with current / total time.
   */
  function updateTimeDisplay() {
    if (!timeEl || !wavesurfer) return;
    const current = wavesurfer.getCurrentTime();
    const duration = wavesurfer.getDuration();
    timeEl.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
  }

  // --- Public API attached to the element ------------------------------------

  /**
   * Load an audio `File` object into the waveform.
   *
   * @param {File} file
   * @returns {Promise<void>} Resolves when the waveform is ready.
   */
  wrapper.loadFile = function loadFile(file) {
    if (!wavesurfer) initWaveSurfer();

    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);

      // Clean up the object URL once WaveSurfer has loaded the audio.
      wavesurfer.once('ready', () => {
        URL.revokeObjectURL(url);
        resolve();
      });

      wavesurfer.load(url);
    });
  };

  /**
   * Load audio from a URL.
   *
   * @param {string} url
   * @returns {Promise<void>} Resolves when the waveform is ready.
   */
  wrapper.loadUrl = function loadUrl(url) {
    if (!wavesurfer) initWaveSurfer();

    return new Promise((resolve) => {
      wavesurfer.once('ready', resolve);
      wavesurfer.load(url);
    });
  };

  /**
   * Get the current region bounds (if regions are enabled and a region exists).
   *
   * @returns {{ start: number, end: number } | null}
   */
  wrapper.getRegion = function getRegion() {
    if (!activeRegion) return null;
    return { start: activeRegion.start, end: activeRegion.end };
  };

  /**
   * Get the loaded audio's duration in seconds.
   *
   * @returns {number}
   */
  wrapper.getDuration = function getDuration() {
    return wavesurfer ? wavesurfer.getDuration() : 0;
  };

  /**
   * Destroy the WaveSurfer instance and clean up event listeners.
   */
  wrapper.destroy = function destroy() {
    if (wavesurfer) {
      wavesurfer.destroy();
      wavesurfer = null;
    }
    activeRegion = null;
  };

  wrapper.load = wrapper.loadFile;

  // Eagerly initialise WaveSurfer so the container is ready for loading.
  initWaveSurfer();

  if (actualContainer) {
    actualContainer.appendChild(wrapper);
  }

  return wrapper;
}
