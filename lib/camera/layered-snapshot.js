'use strict';

// Eufy serves a camera's RTSP only intermittently -- a stream answering 401 one
// minute returns 404 four minutes later. HomeKit, meanwhile, asks for a
// snapshot every few seconds and expects an answer every time.
//
// So a picture is assembled from whatever is actually available, in order of
// how live it is:
//
//   1. a frame pulled straight from RTSP        (genuinely live)
//   2. the JPEG the Eufy app publishes to Homey (as fresh as your Flows)
//   3. the last frame we successfully obtained  (stale, but real)
//
// Only if all three fail does the placeholder appear, which now means "this
// camera has never produced a picture" rather than "something is broken".

class LayeredSnapshotSource {
  #sources;
  #ttlMs;
  #log;
  #now;
  #cached   = null;
  #cachedAt = 0;
  #inflight = null;

  #deadlineMs;

  // `sources` is an ordered list of { name, get() } -- most live first.
  constructor({ sources, ttlMs = 4000, deadlineMs = 4000, log = () => {}, now = Date.now }) {
    this.#sources    = sources.filter(Boolean);
    this.#ttlMs      = ttlMs;
    this.#deadlineMs = deadlineMs;
    this.#log        = log;
    this.#now        = now;
  }

  async get() {
    if (this.#cached && (this.#now() - this.#cachedAt) < this.#ttlMs) return this.#cached;
    if (this.#inflight) return this.#inflight;

    this.#inflight = this.#fetch();
    try {
      return await this.#inflight;
    } finally {
      this.#inflight = null;
    }
  }

  #withDeadline(source) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(Error(`timed out after ${ this.#deadlineMs }ms`));
      }, this.#deadlineMs);
      timer.unref?.();

      source.get().then(
        value => { if (! settled) { settled = true; clearTimeout(timer); resolve(value); } },
        error => { if (! settled) { settled = true; clearTimeout(timer); reject(error); } },
      );
    });
  }

  async #fetch() {
    const failures = [];

    for (const source of this.#sources) {
      try {
        // Every source needs its own deadline. Resolving the ffmpeg binary can
        // download ~25MB on first use, and without a bound here that blocks the
        // whole chain past HomeKit's patience -- which shows up as an
        // unresponsive camera rather than a slow one.
        const buffer = await this.#withDeadline(source);
        if (buffer && buffer.length > 2 && buffer[0] === 0xff && buffer[1] === 0xd8) {
          this.#cached   = buffer;
          this.#cachedAt = this.#now();
          return buffer;
        }
        failures.push(`${ source.name }: not a JPEG`);
      } catch (e) {
        failures.push(`${ source.name }: ${ e.message }`);
      }
    }

    // Everything live failed. A real picture from a minute ago beats a
    // placeholder, and HomeKit is asking every few seconds regardless.
    if (this.#cached) {
      this.#log(`serving last known frame (${ failures.join('; ') })`);
      return this.#cached;
    }

    throw Error(`no snapshot available — ${ failures.join('; ') }`);
  }
}

module.exports = { LayeredSnapshotSource };
