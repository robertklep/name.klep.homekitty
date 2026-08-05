'use strict';

// Short by design: this is burst absorption for the Home app opening, not a
// freshness strategy. Freshness comes from the Eufy app overwriting the image.
const DEFAULT_TTL_MS = 2000;

// Fetch timeout to prevent hanging on stalled Homey Web API, which would block
// HomeKit snapshot requests and mark the accessory unresponsive.
const DEFAULT_TIMEOUT_MS = 5000;

// The Eufy app registers two images per camera: a per-device "Snapshot" and a
// per-HomeBase "Event" image that several cameras share. Always prefer the
// Snapshot, or every camera on one HomeBase shows the same picture.
function findSnapshotImage(device) {
  const images = (device && device.images) || [];
  if (! images.length) return null;
  const snapshot = images.find(image => /snapshot/i.test(`${ image.title || '' } ${ image.id || '' }`));
  return snapshot || images[0];
}

class SnapshotSource {
  #url;
  #ttlMs;
  #timeoutMs;
  #fetch;
  #now;
  #cached   = null;
  #cachedAt = 0;
  #inflight = null;

  constructor({ url, ttlMs = DEFAULT_TTL_MS, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = globalThis.fetch, now = Date.now }) {
    if (! url) throw Error('SnapshotSource requires a url');
    this.#url       = url;
    this.#ttlMs     = ttlMs;
    this.#timeoutMs = timeoutMs;
    this.#fetch     = fetchImpl;
    this.#now       = now;
  }

  async get() {
    if (this.#cached && (this.#now() - this.#cachedAt) < this.#ttlMs) {
      return this.#cached;
    }
    if (this.#inflight) return this.#inflight;

    this.#inflight = this.#fetchImage();
    try {
      return await this.#inflight;
    } finally {
      this.#inflight = null;
    }
  }

  async #fetchImage() {
    const controller = new AbortController();
    let timer = null;
    try {
      timer = setTimeout(() => controller.abort(), this.#timeoutMs);
      const res = await this.#fetch(this.#url, { signal: controller.signal });
      if (! res.ok) throw Error(`snapshot fetch failed: HTTP ${ res.status }`);
      const buffer = Buffer.from(await res.arrayBuffer());
      this.#cached   = buffer;
      this.#cachedAt = this.#now();
      return buffer;
    } finally {
      clearTimeout(timer);
    }
  }
}

module.exports = { SnapshotSource, findSnapshotImage, DEFAULT_TTL_MS, DEFAULT_TIMEOUT_MS };
