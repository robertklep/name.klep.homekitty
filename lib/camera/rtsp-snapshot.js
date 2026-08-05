'use strict';

const { spawn } = require('node:child_process');
const { resolveFfmpeg } = require('./ffmpeg');

// Once a camera has a live stream, a snapshot is just one frame off it. That
// is genuinely current, unlike an image some Flow captured earlier, and it
// needs no Flows, no seeding and no staleness handling.

const DEFAULT_TIMEOUT_MS = 8000;

async function grabFrame({ url, timeoutMs = DEFAULT_TIMEOUT_MS, log = () => {} }) {
  if (! url) throw Error('camera has no RTSP stream');
  const ffmpeg = await resolveFfmpeg(log);

  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpeg, [
      '-rtsp_transport', 'tcp',
      '-i', url,
      '-frames:v', '1',
      // `-f mjpeg`, not `image2`: the image2 muxer refuses to write a single
      // image without `-update 1` and silently produces nothing on stdout.
      // Verified against a live camera -- image2 yielded 0 bytes, mjpeg 188KB.
      '-f', 'mjpeg',
      '-',                      // straight to stdout, no temp file
    ], { env : process.env });

    const chunks = [];
    let stderr   = '';
    let settled  = false;

    const finish = (error, buffer) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { proc.kill('SIGKILL'); } catch (e) { /* already gone */ }
      error ? reject(error) : resolve(buffer);
    };

    const timer = setTimeout(
      () => finish(Error(`snapshot timed out after ${ timeoutMs }ms`)),
      timeoutMs,
    );
    timer.unref?.();

    proc.stdout.on('data', chunk => chunks.push(chunk));
    proc.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-1000); });
    proc.on('error', error => finish(error));

    proc.on('close', () => {
      const buffer = Buffer.concat(chunks);
      if (buffer.length > 2 && buffer[0] === 0xff && buffer[1] === 0xd8) return finish(undefined, buffer);
      finish(Error(`no frame captured: ${ stderr.split('\n').slice(-2).join(' ').trim() }`));
    });
  });
}

// Matches SnapshotSource's shape so the delegate does not care where the
// picture comes from.
class RtspSnapshotSource {
  #getUrl;
  #ttlMs;
  #log;
  #cached   = null;
  #cachedAt = 0;
  #inflight = null;

  constructor({ getUrl, ttlMs = 10000, log = () => {}, now = Date.now }) {
    this.#getUrl = getUrl;
    this.#ttlMs  = ttlMs;
    this.#log    = log;
    this.now     = now;
  }

  async get() {
    if (this.#cached && (this.now() - this.#cachedAt) < this.#ttlMs) return this.#cached;
    if (this.#inflight) return this.#inflight;

    this.#inflight = (async () => {
      const url    = await this.#getUrl();
      const buffer = await grabFrame({ url, log : this.#log });
      this.#cached   = buffer;
      this.#cachedAt = this.now();
      return buffer;
    })();

    try {
      return await this.#inflight;
    } finally {
      this.#inflight = null;
    }
  }
}

module.exports = { grabFrame, RtspSnapshotSource, DEFAULT_TIMEOUT_MS };
