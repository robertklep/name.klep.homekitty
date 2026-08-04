'use strict';

const { createWriteStream, existsSync, mkdirSync, chmodSync, unlinkSync } = require('node:fs');
const { join }        = require('node:path');
const { spawnSync }   = require('node:child_process');
const { createGunzip } = require('node:zlib');
const https           = require('node:https');
const os              = require('node:os');

// HomeKit wants H.264 over SRTP; the cameras speak RTSP. ffmpeg bridges the
// two. Rather than ship a ~40MB binary in the app package, fetch one once and
// cache it in /userdata — the same approach the Homey Eufy app takes for its
// own snapshot work, so it is known to run on this hardware.

const RELEASE  = 'b6.1.1';
const BASE_URL = `https://github.com/eugeneware/ffmpeg-static/releases/download/${ RELEASE }`;

// /userdata is the only writable location that survives app restarts.
const CACHE_DIR      = '/userdata/ffmpeg';
const MAX_REDIRECTS  = 5;

function targetName() {
  const platform = os.platform();
  const arch     = os.arch();
  // Homey Pro 2023 is arm64; the 2019 model is arm.
  return `ffmpeg-${ platform }-${ arch }`;
}

function isRunnable(path) {
  try {
    return existsSync(path) && spawnSync(path, [ '-version' ], { timeout : 8000 }).status === 0;
  } catch (e) {
    return false;
  }
}

function download(url, destination, redirectsLeft = MAX_REDIRECTS) {
  return new Promise((resolve, reject) => {
    https.get(url, response => {
      const { statusCode, headers } = response;

      if (statusCode >= 300 && statusCode < 400 && headers.location) {
        response.resume();
        if (! redirectsLeft) return reject(Error('too many redirects fetching ffmpeg'));
        return resolve(download(headers.location, destination, redirectsLeft - 1));
      }
      if (statusCode !== 200) {
        response.resume();
        return reject(Error(`ffmpeg download failed: HTTP ${ statusCode }`));
      }

      const file = createWriteStream(destination);
      response.pipe(createGunzip()).pipe(file)
        .on('finish', () => file.close(() => resolve(destination)))
        .on('error', error => {
          try { unlinkSync(destination); } catch (e) { /* best effort */ }
          reject(error);
        });
    }).on('error', reject);
  });
}

// Resolves once per process; the download is shared rather than repeated.
let resolving = null;

function resolveFfmpeg(log = () => {}) {
  if (! resolving) {
    resolving = (async () => {
      const path = join(CACHE_DIR, targetName());

      if (isRunnable(path)) {
        log('using cached ffmpeg');
        return path;
      }

      log(`downloading ffmpeg (${ targetName() }) — this happens once`);
      mkdirSync(CACHE_DIR, { recursive : true });
      await download(`${ BASE_URL }/${ targetName() }.gz`, path);
      chmodSync(path, 0o755);

      if (! isRunnable(path)) throw Error('downloaded ffmpeg will not execute');
      log('ffmpeg ready');
      return path;
    })().catch(error => {
      resolving = null; // let a later attempt retry
      throw error;
    });
  }
  return resolving;
}

module.exports = { resolveFfmpeg, targetName, CACHE_DIR };
