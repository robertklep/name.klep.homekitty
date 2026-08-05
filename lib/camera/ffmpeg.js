'use strict';

const { createWriteStream, existsSync, mkdirSync, chmodSync, unlinkSync } = require('node:fs');
const { join }        = require('node:path');
const { spawnSync }   = require('node:child_process');
const { createGunzip } = require('node:zlib');
const https           = require('node:https');
const os              = require('node:os');

// HomeKit wants H.264 over SRTP; the cameras speak RTSP. ffmpeg bridges the
// two. Rather than ship a ~60MB binary in the app package, fetch one once and
// cache it in /userdata.
//
// The build matters more than it looks. ffmpeg-static's glibc builds download
// and install fine here, then abort the moment they start:
//
//   terminate called after throwing an instance of 'std::runtime_error'
//     what():  random_device::random_device(const std::string&)
//
// The binary never gets as far as parsing arguments, so every stream attempt
// failed with no usable error while snapshots quietly fell back to the Eufy
// app's published JPEG -- which is why this went unnoticed for so long.
//
// These Alpine/musl builds are statically linked and do not have that problem;
// the Homey Eufy app ships the identical binary, so it is known to run on this
// hardware.

const RELEASE  = 'v2.2.2';
const BASE_URL = `https://github.com/homebridge/ffmpeg-for-homebridge/releases/download/${ RELEASE }`;

// On a Homey, /userdata is the writable location that survives app restarts.
// Anywhere else -- a developer machine running the probe harness -- it does not
// exist. Falling back to the temp dir is what makes this path testable without
// hardware, which is how the muxer bug above was actually found.
function cacheDir() {
  return existsSync('/userdata') ? '/userdata/ffmpeg' : join(os.tmpdir(), 'homekitty-ffmpeg');
}

const MAX_REDIRECTS = 5;

function targetName() {
  const platform = os.platform();
  const arch     = os.arch();
  // Homey Pro 2023 is arm64; the 2019 model is arm.
  return `ffmpeg-${ platform }-${ arch }`;
}

// The published asset for this machine. Homey Pro runs Alpine, and the musl
// builds are the ones that work here.
function assetName() {
  const arch = os.arch();
  if (os.platform() === 'darwin') {
    return arch === 'arm64' ? 'ffmpeg-darwin-arm64.tar.gz' : 'ffmpeg-darwin-x86_64.tar.gz';
  }
  if (arch === 'arm64') return 'ffmpeg-alpine-aarch64.tar.gz';
  if (arch === 'arm')   return 'ffmpeg-alpine-arm32v7.tar.gz';
  if (arch === 'x64')   return 'ffmpeg-alpine-x86_64.tar.gz';
  throw Error(`no ffmpeg build published for ${ os.platform() }/${ arch }`);
}

// A tar reader, rather than a tar dependency: these archives hold one file we
// want (./usr/local/bin/ffmpeg) and the format is 512-byte headers followed by
// content padded to the same boundary. Entries are streamed past rather than
// buffered, so unpacking 60MB does not cost 60MB of memory.
function extractFfmpeg(source, destination) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(destination);
    let pending  = Buffer.alloc(0);
    let remaining = 0;   // content bytes still expected for the entry
    let padding   = 0;   // alignment bytes to discard after it
    let writing   = false;
    let found     = false;

    source.on('data', chunk => {
      pending = pending.length ? Buffer.concat([ pending, chunk ]) : chunk;

      for (;;) {
        if (remaining > 0) {
          const take = Math.min(remaining, pending.length);
          if (! take) return;
          if (writing) file.write(pending.subarray(0, take));
          pending    = pending.subarray(take);
          remaining -= take;
          continue;
        }
        if (padding > 0) {
          const take = Math.min(padding, pending.length);
          if (! take) return;
          pending  = pending.subarray(take);
          padding -= take;
          continue;
        }
        if (writing) {           // the entry we wanted has been read in full
          writing = false;
          source.destroy();
          return file.end(() => resolve(destination));
        }
        if (pending.length < 512) return;

        const header = pending.subarray(0, 512);
        pending      = pending.subarray(512);
        const name   = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
        if (! name) continue;    // trailing zero blocks mark the end

        const size = parseInt(header.subarray(124, 136).toString('utf8').replace(/[\0 ]/g, ''), 8) || 0;
        remaining  = size;
        padding    = size % 512 ? 512 - (size % 512) : 0;

        if (! found && name.split('/').pop() === 'ffmpeg' && header[156] !== 53 /* not a directory */) {
          found = writing = true;
        }
      }
    });

    source.on('error', reject);
    source.on('end', () => {
      if (found) return file.end(() => resolve(destination));
      reject(Error('no ffmpeg binary inside the downloaded archive'));
    });
  });
}

function isRunnable(path, log = () => {}) {
  try {
    if (! existsSync(path)) return false;
    // A 51MB static binary can take a while to load from the Homey's storage
    // the first time, so this needs to be generous rather than clever.
    const result = spawnSync(path, [ '-version' ], { timeout : 30000 });
    if (result.status === 0) return true;
    log(`ffmpeg check: status=${ result.status } signal=${ result.signal } err=${ result.error && result.error.code } stderr=${ String(result.stderr || '').slice(0, 120) }`);
    // The distinction matters: EACCES means the filesystem refuses to execute
    // anything here (a noexec mount), ENOEXEC means the binary is wrong for
    // this machine, and a non-zero status means it ran but complained.
    log(`ffmpeg at ${ path } not runnable: ${ result.error ? result.error.code : `status ${ result.status }` }`);
    return false;
  } catch (e) {
    log(`ffmpeg at ${ path } threw: ${ e.code || e.message }`);
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

      extractFfmpeg(response.pipe(createGunzip()), destination)
        .then(resolve)
        .catch(error => {
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
      const dir  = cacheDir();
      const path = join(dir, targetName());

      if (isRunnable(path, log)) {
        log('using cached ffmpeg');
        return path;
      }

      log(`downloading ffmpeg (${ assetName() }) — this happens once`);
      mkdirSync(dir, { recursive : true });
      await download(`${ BASE_URL }/${ assetName() }`, path);
      chmodSync(path, 0o755);

      const { statSync } = require('node:fs');
      const size = statSync(path).size;
      if (! isRunnable(path, log)) throw Error(`downloaded ffmpeg will not execute (${ size } bytes at ${ path })`);
      log('ffmpeg ready');
      return path;
    })().catch(error => {
      resolving = null; // let a later attempt retry
      throw error;
    });
  }
  return resolving;
}

module.exports = { resolveFfmpeg, targetName, assetName, cacheDir, extractFfmpeg };
