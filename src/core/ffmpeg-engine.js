/**
 * ffmpeg-engine.js
 * FFmpeg singleton engine that manages the ffmpeg.wasm lifecycle.
 * Provides lazy initialization, audio/video processing, and progress tracking.
 */

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL, fetchFile } from '@ffmpeg/util';

/** @type {FFmpeg|null} Module-level singleton instance */
let ffmpeg = null;

/** @type {boolean} Tracks whether FFmpeg has been fully loaded */
let loaded = false;

/** @type {boolean} Guards against concurrent init() calls */
let loading = false;

const CDN_BASE = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm';

/**
 * Singleton FFmpeg engine for browser-based audio/video processing.
 *
 * @example
 * ```js
 * import { ffmpegEngine } from './ffmpeg-engine.js';
 *
 * await ffmpegEngine.init();
 * ffmpegEngine.onProgress(({ progress }) => console.log(`${(progress * 100).toFixed(0)}%`));
 *
 * const output = await ffmpegEngine.process(file, 'out.mp3', ['-i', 'input', '-b:a', '128k', 'out.mp3']);
 * ```
 */
export const ffmpegEngine = {
  /**
   * Lazily load FFmpeg from jsDelivr CDN (single-thread core).
   * Safe to call multiple times — subsequent calls resolve immediately
   * once loading has completed.
   *
   * @param {function} [onProgress] — Optional loading progress callback.
   * @returns {Promise<void>}
   * @throws {Error} If CDN resources fail to load.
   */
  async init(onProgress) {
    if (loaded) {
      if (onProgress) onProgress(1);
      return;
    }
    if (loading) {
      // Another init() is already in flight — wait for it to finish.
      await new Promise((resolve) => {
        const check = setInterval(() => {
          if (loaded || !loading) {
            clearInterval(check);
            resolve();
          }
        }, 100);
      });
      if (onProgress) onProgress(1);
      return;
    }

    loading = true;

    try {
      ffmpeg = new FFmpeg();

      ffmpeg.on('log', ({ message }) => {
        console.log('[FFmpeg]', message);
      });

      ffmpeg.on('progress', ({ progress, time }) => {
        console.log(`[FFmpeg] progress: ${(progress * 100).toFixed(1)}%  time: ${time}µs`);
      });

      console.log('[FFmpeg] Loading core from CDN…');
      if (onProgress) onProgress(0.1);

      const [coreURL, wasmURL] = await Promise.all([
        toBlobURL(`${CDN_BASE}/ffmpeg-core.js`, 'text/javascript'),
        toBlobURL(`${CDN_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
      ]);

      if (onProgress) onProgress(0.5);

      await ffmpeg.load({ coreURL, wasmURL });

      loaded = true;
      if (onProgress) onProgress(1);
      console.log('[FFmpeg] Ready.');
    } catch (err) {
      loading = false;
      ffmpeg = null;
      throw new Error(`FFmpeg failed to initialise: ${err.message}`);
    } finally {
      loading = false;
    }
  },

  /**
   * Write data to the virtual filesystem.
   */
  async writeFile(path, data) {
    if (!ffmpeg) throw new Error('FFmpeg is not loaded.');
    return await ffmpeg.writeFile(path, data);
  },

  /**
   * Read data from the virtual filesystem.
   */
  async readFile(path) {
    if (!ffmpeg) throw new Error('FFmpeg is not loaded.');
    return await ffmpeg.readFile(path);
  },

  /**
   * Delete a file from the virtual filesystem.
   */
  async deleteFile(path) {
    if (!ffmpeg) throw new Error('FFmpeg is not loaded.');
    return await ffmpeg.deleteFile(path);
  },

  /**
   * Run FFmpeg arguments with a progress callback.
   */
  async run(args, onProgress) {
    if (!loaded || !ffmpeg) {
      throw new Error('FFmpeg is not loaded. Call init() first.');
    }

    let progressListener = null;
    if (onProgress) {
      progressListener = ({ progress }) => {
        onProgress(progress);
      };
      ffmpeg.on('progress', progressListener);
    }

    try {
      const exitCode = await ffmpeg.exec(args);
      if (exitCode !== 0) {
        throw new Error(`FFmpeg exited with code ${exitCode}`);
      }
    } finally {
      if (progressListener) {
        ffmpeg.off('progress', progressListener);
      }
    }
  },

  /**
   * Process an input file through FFmpeg.
   *
   * @param {File} inputFile        — Source file (browser File object).
   * @param {string} outputFilename — Desired output filename in the virtual FS.
   * @param {string[]} args         — Full FFmpeg argument list (e.g. `['-i', 'input', '-b:a', '128k', 'out.mp3']`).
   * @returns {Promise<Uint8Array>} The raw bytes of the output file.
   * @throws {Error} If FFmpeg is not loaded or the command fails.
   */
  async process(inputFile, outputFilename, args) {
    if (!loaded || !ffmpeg) {
      throw new Error('FFmpeg is not loaded. Call init() first.');
    }

    const inputName = inputFile.name || 'input';

    try {
      // Write source file into the in-memory virtual FS.
      await ffmpeg.writeFile(inputName, await fetchFile(inputFile));

      // Execute the FFmpeg command.
      const exitCode = await ffmpeg.exec(args);

      if (exitCode !== 0) {
        throw new Error(`FFmpeg exited with code ${exitCode}`);
      }

      // Read the result back from the virtual FS.
      const output = await ffmpeg.readFile(outputFilename);
      return output;
    } finally {
      // Always clean up virtual FS entries, even on error.
      try { await ffmpeg.deleteFile(inputName); } catch { /* ignored */ }
      try { await ffmpeg.deleteFile(outputFilename); } catch { /* ignored */ }
    }
  },

  /**
   * Register a progress callback.
   *
   * @param {(info: { progress: number, time: number }) => void} callback
   *   `progress` is 0–1, `time` is in microseconds.
   */
  onProgress(callback) {
    if (!ffmpeg) {
      throw new Error('FFmpeg is not initialised. Call init() first.');
    }
    ffmpeg.on('progress', callback);
  },

  /**
   * Register a log callback.
   *
   * @param {(info: { type: string, message: string }) => void} callback
   */
  onLog(callback) {
    if (!ffmpeg) {
      throw new Error('FFmpeg is not initialised. Call init() first.');
    }
    ffmpeg.on('log', callback);
  },

  /**
   * Check whether the FFmpeg core has been loaded.
   *
   * @returns {boolean}
   */
  isLoaded() {
    return loaded;
  },

  /**
   * Terminate the FFmpeg instance and release resources.
   *
   * @returns {Promise<void>}
   */
  async terminate() {
    if (ffmpeg) {
      try {
        ffmpeg.terminate();
      } catch { /* best-effort */ }
      ffmpeg = null;
      loaded = false;
      loading = false;
      console.log('[FFmpeg] Terminated.');
    }
  },
};
