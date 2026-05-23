/**
 * AudioForge — Main Entry Point (Unified Single-Upload Workflow)
 *
 * Coordinates the single upload landing page, persistent audio preview,
 * tab switcher, settings panels, progress updates, and outputs.
 */

import './styles/index.css';
import './styles/components.css';
import './styles/tools.css';

// Core Utilities & Singleton FFmpeg
import { getAudioMetadata } from './core/audio-utils.js';

// Components
import { createHeader } from './components/header.js';
import { createFooter } from './components/footer.js';
import { createDropZone } from './components/drop-zone.js';
import { createWaveform } from './components/waveform.js';
import { createFileInfo } from './components/file-info.js';

// Tools Settings & Execution Modules
import { initCompressorSettings } from './tools/compressor.js';
import { initConverterSettings } from './tools/converter.js';
import { initTrimmerSettings } from './tools/trimmer.js';
import { initNormalizerSettings } from './tools/normalizer.js';

/* ---- Global State ---- */
let loadedFile = null;
let audioMetadata = null;
let wavesurferInstance = null;
let activeTab = null;
let activeToolCleanup = null;
let headerElement = null;

// Elements references inside the main workspace
let mainContent = null;
let dropZoneInstance = null;

/**
 * Render the Hero description and Drop Zone landing page
 */
function renderLandingPage() {
  mainContent.innerHTML = `
    <section class="hero slide-up" id="hero-section">
      <div class="hero__bg">
        <div class="hero__orb hero__orb--1"></div>
        <div class="hero__orb hero__orb--2"></div>
        <div class="hero__orb hero__orb--3"></div>
      </div>
      <div class="hero__content">
        <h1 class="hero__title">
          <span class="gradient-text">Audio Tools</span>
          <br />That Run in Your Browser
        </h1>
        <p class="hero__subtitle">
          Convert, compress, trim, and normalize audio files — 100% free, 100% private. 
          No uploads, no servers. Everything happens right here.
        </p>
        <div class="hero__badges">
          <span class="hero__badge">🔒 100% Private</span>
          <span class="hero__badge">⚡ No Upload Needed</span>
          <span class="hero__badge">🆓 Completely Free</span>
        </div>
      </div>
    </section>

    <section class="drop-zone-section slide-up" style="max-width: 800px; margin: 0 auto; animation-delay: 0.15s;"></section>

    <section class="features" id="features-section">
      <div class="feature slide-up" style="animation-delay: 0.3s;">
        <div class="feature__icon">🔒</div>
        <h3 class="feature__title">100% Private</h3>
        <p class="feature__desc">Your files never leave your device. All processing happens locally in your browser using WebAssembly.</p>
      </div>
      <div class="feature slide-up" style="animation-delay: 0.45s;">
        <div class="feature__icon">⚡</div>
        <h3 class="feature__title">Lightning Fast</h3>
        <p class="feature__desc">Powered by FFmpeg compiled to WebAssembly. No waiting for uploads or server processing.</p>
      </div>
      <div class="feature slide-up" style="animation-delay: 0.6s;">
        <div class="feature__icon">🆓</div>
        <h3 class="feature__title">Completely Free</h3>
        <p class="feature__desc">No sign-ups, no limits, no watermarks. Professional audio tools at zero cost.</p>
      </div>
    </section>
  `;

  // Initialize drop zone inside section
  const dropZoneSection = mainContent.querySelector('.drop-zone-section');
  dropZoneInstance = createDropZone(dropZoneSection, {
    accept: 'audio/*',
    onFile: handleFileUpload,
  });
}

/**
 * Render the loaded file workspace view
 */
function renderWorkspaceView() {
  mainContent.innerHTML = `
    <div class="tool-page unified-workflow slide-up">
      <!-- File Metadata Card & Visual Waveform -->
      <section class="file-preview glass-card">
        <div class="file-info-slot"></div>
        <div class="waveform-slot" style="margin-top: var(--space-md);"></div>
      </section>

      <!-- Function Switcher Tabs -->
      <section class="tab-switcher-section" style="margin-top: var(--space-md);">
        <div class="tab-switcher">
          <button class="tab-btn active" data-tab="compress">Compress</button>
          <button class="tab-btn" data-tab="convert">Convert</button>
          <button class="tab-btn" data-tab="trim">Trim</button>
          <button class="tab-btn" data-tab="normalize">Normalize</button>
        </div>
      </section>

      <!-- Active settings slot -->
      <section class="settings-section glass-card" style="margin-top: var(--space-md); padding: var(--space-md) var(--space-lg);">
        <div class="active-settings-slot"></div>
      </section>

      <!-- Progress Section Slot -->
      <section class="progress-section" style="display:none; margin-top: var(--space-md);"></section>

      <!-- Results comparison Slot -->
      <section class="results-section" style="display:none; margin-top: var(--space-md);"></section>
    </div>
  `;

  // Bind tab switcher clicks
  const tabs = mainContent.querySelectorAll('.tab-btn');
  tabs.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const targetTab = e.currentTarget.dataset.tab;
      switchTab(targetTab);
    });
  });
}

/**
 * Handle Tab Switching logic
 *
 * @param {string} tabName
 */
function switchTab(tabName) {
  if (activeTab === tabName) return;

  // Cleanup current active tool settings panel
  if (activeToolCleanup) {
    activeToolCleanup();
    activeToolCleanup = null;
  }

  activeTab = tabName;

  // Toggle active styling on tab buttons
  const tabs = mainContent.querySelectorAll('.tab-btn');
  tabs.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });

  const settingsSlot = mainContent.querySelector('.active-settings-slot');
  const progressSlot = mainContent.querySelector('.progress-section');
  const resultsSlot = mainContent.querySelector('.results-section');

  // Reset tool slots
  settingsSlot.innerHTML = '';
  progressSlot.style.display = 'none';
  progressSlot.innerHTML = '';
  resultsSlot.style.display = 'none';
  resultsSlot.innerHTML = '';

  // Initialize the selected settings panel
  if (tabName === 'compress') {
    activeToolCleanup = initCompressorSettings(settingsSlot, loadedFile, audioMetadata, progressSlot, resultsSlot);
  } else if (tabName === 'convert') {
    activeToolCleanup = initConverterSettings(settingsSlot, loadedFile, audioMetadata, progressSlot, resultsSlot);
  } else if (tabName === 'trim') {
    activeToolCleanup = initTrimmerSettings(settingsSlot, loadedFile, audioMetadata, progressSlot, resultsSlot, wavesurferInstance);
  } else if (tabName === 'normalize') {
    activeToolCleanup = initNormalizerSettings(settingsSlot, loadedFile, audioMetadata, progressSlot, resultsSlot);
  }
}

/**
 * Process uploaded audio file
 *
 * @param {File} file
 */
async function handleFileUpload(file) {
  if (!file) return;
  loadedFile = file;

  if (dropZoneInstance) {
    dropZoneInstance.setLoading(true, 'Analyzing audio file...');
  }

  try {
    // 1. Get metadata
    audioMetadata = await getAudioMetadata(file);

    // 2. Switch to workspace view template
    renderWorkspaceView();

    // 3. Populate file info card
    const fileInfoSlot = mainContent.querySelector('.file-info-slot');
    createFileInfo(fileInfoSlot, audioMetadata);

    // 4. Create persistent Waveform player
    const waveformSlot = mainContent.querySelector('.waveform-slot');
    const waveform = createWaveform(waveformSlot, { height: 128 });
    wavesurferInstance = waveform.wavesurfer;

    await waveform.load(file);

    // 5. Enable header reset button
    if (headerElement && headerElement.setResetButtonVisible) {
      headerElement.setResetButtonVisible(true);
    }

    // 6. Load initial active tab
    switchTab('compress');
  } catch (err) {
    console.error(err);
    alert('Failed to analyze audio file. Make sure it is a valid format.');
    resetApp();
  }
}

/**
 * Reset application state to landing upload page
 */
function resetApp() {
  // Tear down current active tool panel
  if (activeToolCleanup) {
    activeToolCleanup();
    activeToolCleanup = null;
  }

  // Tear down WaveSurfer player
  if (wavesurferInstance) {
    wavesurferInstance.destroy();
    wavesurferInstance = null;
  }

  // Clear file states
  loadedFile = null;
  audioMetadata = null;
  activeTab = null;

  // Toggle header button
  if (headerElement && headerElement.setResetButtonVisible) {
    headerElement.setResetButtonVisible(false);
  }

  // Re-render landing page
  renderLandingPage();
}

/**
 * Initialize main application components
 */
function initApp() {
  const app = document.getElementById('app');

  // Render Site Header
  headerElement = createHeader({ onReset: resetApp });
  mainContent = document.createElement('main');
  mainContent.id = 'main-content';
  mainContent.className = 'main-content';
  const footerElement = createFooter();

  app.appendChild(headerElement);
  app.appendChild(mainContent);
  app.appendChild(footerElement);

  // Load Initial Upload Drop-zone view
  renderLandingPage();
}

document.addEventListener('DOMContentLoaded', initApp);
