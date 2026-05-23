/**
 * progress-bar.js — Animated progress bar component for AudioForge.
 *
 * Exports `createProgressBar()` which builds a progress indicator with:
 *   • A gradient fill bar that animates smoothly
 *   • A shimmer overlay for indeterminate state
 *   • Percentage and status text displays
 *   • Rich API: setProgress, setStatus, setIndeterminate, reset, complete
 */

/**
 * Create an animated progress bar element.
 *
 * @returns {HTMLElement} The progress bar container with control methods attached.
 */
export function createProgressBar(parentContainer) {
  const container = document.createElement('div');
  container.className = 'progress-bar';

  // --- Inner structure -------------------------------------------------------
  container.innerHTML = `
    <div class="progress-bar__track">
      <div class="progress-bar__fill" style="width: 0%"></div>
      <div class="progress-bar__shimmer"></div>
    </div>
    <div class="progress-bar__text">0%</div>
    <div class="progress-bar__status"></div>
  `;

  // Cache references to frequently-updated child elements.
  const fill    = container.querySelector('.progress-bar__fill');
  const shimmer = container.querySelector('.progress-bar__shimmer');
  const text    = container.querySelector('.progress-bar__text');
  const status  = container.querySelector('.progress-bar__status');

  // Internal state
  let currentPercent = 0;

  // Append to parent container if provided, clearing it first.
  if (parentContainer) {
    parentContainer.innerHTML = '';
    parentContainer.appendChild(container);
  }

  // --- Public API ------------------------------------------------------------

  /**
   * Set the progress bar to a specific percentage (0–100).
   * The transition is handled by CSS for smooth animation.
   *
   * @param {number} percent — Value between 0 and 100.
   */
  container.setProgress = function setProgress(percent) {
    currentPercent = Math.max(0, Math.min(100, percent));
    fill.style.width = `${currentPercent}%`;
    text.textContent = `${Math.round(currentPercent)}%`;

    // Remove indeterminate shimmer when progress is being actively set.
    container.classList.remove('progress-bar--indeterminate');
  };

  /**
   * Update the status text below the bar.
   *
   * @param {string} message
   */
  container.setStatus = function setStatus(message) {
    status.textContent = message;
  };

  /**
   * Short hand update method called by tools.
   */
  container.update = function update(percent, message) {
    container.setProgress(percent);
    if (message !== undefined) {
      container.setStatus(message);
    }
  };

  /**
   * Toggle indeterminate (shimmer) mode.
   * In this mode the fill bar pulses to indicate work of unknown duration.
   *
   * @param {boolean} on
   */
  container.setIndeterminate = function setIndeterminate(on) {
    container.classList.toggle('progress-bar--indeterminate', !!on);
  };

  /**
   * Reset the progress bar back to 0 % with no status text.
   */
  container.reset = function reset() {
    currentPercent = 0;
    fill.style.width = '0%';
    text.textContent = '0%';
    status.textContent = '';
    container.classList.remove('progress-bar--indeterminate', 'progress-bar--complete');
  };

  /**
   * Mark progress as complete — jumps to 100 % and applies success styling.
   */
  container.complete = function complete() {
    currentPercent = 100;
    fill.style.width = '100%';
    text.textContent = '100%';
    container.classList.remove('progress-bar--indeterminate');
    container.classList.add('progress-bar--complete');
  };

  return container;
}
