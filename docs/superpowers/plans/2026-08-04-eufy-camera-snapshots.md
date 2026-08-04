# Eufy Camera Snapshots in HomeKit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Eufy cameras and video doorbell exposed by the Homey Eufy app appear in Apple's Home app as HomeKit camera accessories showing a still image, with working motion, doorbell, battery and floodlight controls.

**Architecture:** HomeKitty gains an accessory-level `CameraController` (hap-nodejs), hooked into `MappedDevice.accessorize()` via a `camera: true` flag on a map — mirroring the existing `adaptiveLighting` flag. The snapshot delegate fetches the current JPEG on demand over HTTP from the Homey's own image endpoint, which the Eufy app keeps fresh via user-owned Homey Flows. Live video is stubbed behind a `StreamSource` interface so it can be added later without reworking the controller.

**Tech Stack:** Node.js (Homey Apps SDK v3), bundled hap-nodejs 1.1.0, bundled homey-api, mocha for tests.

**Spec:** `docs/superpowers/specs/2026-08-04-eufy-cameras-in-homekit-design.md`

## Global Constraints

- Branch: `eufy-camera` (already created off `upstream/main`).
- Node built-ins use the `node:` prefix (`require('node:path')`) — existing house style.
- Private class fields use `#` prefix. 2-space indent. Aligned declarations.
- hap-nodejs and homey-api are **vendored** under `modules/` — require them by relative path, never from npm.
- **`app.js` calls `chdir(persistDir)` during `onInit`.** Any file read at runtime MUST use a `__dirname`-relative path. Relative paths silently resolve into the persistence directory.
- HomeKitty holds only the `homey:manager:api` permission. It **cannot** run Flow cards (`Missing Scopes`) — never add code that tries.
- Keep the diff against `upstream/main` minimal and in upstream's style; this should stay PR-able.

## File Structure

| File | Responsibility |
|---|---|
| `lib/camera/snapshot-source.js` | Locate a device's snapshot image; fetch its bytes on demand with a short TTL |
| `lib/camera/stream-source.js` | Live-video interface; ships as `UnsupportedStreamSource` |
| `lib/camera/placeholder.js` | Load the fallback JPEG once, from a `__dirname`-relative path |
| `lib/camera/controller.js` | Build a hap-nodejs `CameraController` around the above |
| `lib/maps/camera-eufy.js` | Map for `class: camera` (new file) |
| `lib/maps/doorbell-eufy.js` | Existing map, extended with `camera: true` |
| `lib/maps/battery.js` | Existing map, extended to cover `camera` and `doorbell` classes |
| `lib/mapped-device.js` | Existing; gains the `map.camera` hook in `accessorize()` |
| `lib/device-mapper.js` | Existing; gains `setImageBaseUrl` / `getImageBaseUrl` |
| `app.js` | Existing; passes the API base url into the mapper |
| `assets/camera/placeholder.jpg` | Already generated (1167 bytes, 320×180) |

---

### Task 1: Snapshot source

**Files:**
- Create: `lib/camera/snapshot-source.js`
- Create: `test/camera/snapshot-source.test.js`
- Modify: `package.json` (add mocha devDependency + test script)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `findSnapshotImage(device) -> { id, title, imageObj: { id, url } } | null`
  - `class SnapshotSource` — `new SnapshotSource({ url, ttlMs?, fetchImpl?, now? })`, method `async get(): Promise<Buffer>`
  - `DEFAULT_TTL_MS` (number, 2000)

- [ ] **Step 1: Add the test tooling**

Edit `package.json` — add to `devDependencies` and add a `scripts` block:

```json
  "scripts": {
    "test": "mocha --recursive \"test/**/*.test.js\""
  },
  "devDependencies": {
    "@tsconfig/node12": "^1.0.11",
    "@types/homey": "npm:homey-apps-sdk-v3-types@^0.3.1",
    "@types/node": "^18.11.9",
    "mocha": "^10.7.3"
  },
```

Then run: `npm install`

- [ ] **Step 2: Write the failing test**

Create `test/camera/snapshot-source.test.js`:

```js
'use strict';

const assert = require('node:assert');
const { SnapshotSource, findSnapshotImage } = require('../../lib/camera/snapshot-source');

// Minimal stand-in for a fetch Response carrying JPEG bytes.
function okResponse(bytes) {
  const view = Uint8Array.from(bytes);
  return { ok : true, status : 200, arrayBuffer : async () => view.buffer };
}

function failResponse(status) {
  return { ok : false, status, arrayBuffer : async () => new ArrayBuffer(0) };
}

describe('findSnapshotImage', () => {
  it('prefers the Snapshot image over the shared Event image', () => {
    // The Eufy app registers one Event image per HomeBase that several
    // cameras share; picking it would show the same picture everywhere.
    const device = { images : [
      { id : 'T8030P23224525E4',        title : 'Uterummet - Event',    imageObj : { id : 'evt', url : '/api/image/evt' } },
      { id : 'T8210P8123222311-Snapshot', title : 'Uterummet - Snapshot', imageObj : { id : 'snp', url : '/api/image/snp' } },
    ] };
    assert.strictEqual(findSnapshotImage(device).imageObj.id, 'snp');
  });

  it('returns null when the device has no images', () => {
    assert.strictEqual(findSnapshotImage({ images : [] }), null);
    assert.strictEqual(findSnapshotImage({}), null);
  });
});

describe('SnapshotSource', () => {
  it('returns the fetched bytes as a Buffer', async () => {
    const source = new SnapshotSource({
      url       : 'http://homey/api/image/snp',
      fetchImpl : async () => okResponse([ 0xff, 0xd8, 0x01 ]),
    });
    const buf = await source.get();
    assert.ok(Buffer.isBuffer(buf));
    assert.deepStrictEqual([ ...buf ], [ 0xff, 0xd8, 0x01 ]);
  });

  it('serves from cache inside the TTL', async () => {
    let calls = 0;
    let clock = 1000;
    const source = new SnapshotSource({
      url       : 'http://homey/api/image/snp',
      ttlMs     : 2000,
      now       : () => clock,
      fetchImpl : async () => (calls++, okResponse([ 0xff, 0xd8, calls ])),
    });

    await source.get();
    clock = 2500;             // still inside the 2000ms TTL window
    await source.get();
    assert.strictEqual(calls, 1);
  });

  it('refetches once the TTL has expired', async () => {
    let calls = 0;
    let clock = 1000;
    const source = new SnapshotSource({
      url       : 'http://homey/api/image/snp',
      ttlMs     : 2000,
      now       : () => clock,
      fetchImpl : async () => (calls++, okResponse([ 0xff, 0xd8, calls ])),
    });

    await source.get();
    clock = 4000;             // past the TTL
    await source.get();
    assert.strictEqual(calls, 2);
  });

  it('collapses concurrent requests into one fetch', async () => {
    // Opening the Home app asks every camera for a snapshot at once.
    let calls = 0;
    const source = new SnapshotSource({
      url       : 'http://homey/api/image/snp',
      fetchImpl : async () => {
        calls++;
        await new Promise(r => setTimeout(r, 10));
        return okResponse([ 0xff, 0xd8 ]);
      },
    });

    await Promise.all([ source.get(), source.get(), source.get() ]);
    assert.strictEqual(calls, 1);
  });

  it('throws on a non-ok response', async () => {
    const source = new SnapshotSource({
      url       : 'http://homey/api/image/snp',
      fetchImpl : async () => failResponse(404),
    });
    await assert.rejects(() => source.get(), /HTTP 404/);
  });

  it('recovers after a failure instead of caching the error', async () => {
    let calls = 0;
    const source = new SnapshotSource({
      url       : 'http://homey/api/image/snp',
      fetchImpl : async () => (++calls === 1 ? failResponse(500) : okResponse([ 0xff, 0xd8 ])),
    });
    await assert.rejects(() => source.get());
    const buf = await source.get();
    assert.deepStrictEqual([ ...buf ], [ 0xff, 0xd8 ]);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../../lib/camera/snapshot-source'`

- [ ] **Step 4: Write the implementation**

Create `lib/camera/snapshot-source.js`:

```js
'use strict';

// Short by design: this is burst absorption for the Home app opening, not a
// freshness strategy. Freshness comes from the Eufy app overwriting the image.
const DEFAULT_TTL_MS = 2000;

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
  #fetch;
  #now;
  #cached   = null;
  #cachedAt = 0;
  #inflight = null;

  constructor({ url, ttlMs = DEFAULT_TTL_MS, fetchImpl = globalThis.fetch, now = Date.now }) {
    if (! url) throw Error('SnapshotSource requires a url');
    this.#url   = url;
    this.#ttlMs = ttlMs;
    this.#fetch = fetchImpl;
    this.#now   = now;
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
    const res = await this.#fetch(this.#url);
    if (! res.ok) throw Error(`snapshot fetch failed: HTTP ${ res.status }`);
    const buffer = Buffer.from(await res.arrayBuffer());
    this.#cached   = buffer;
    this.#cachedAt = this.#now();
    return buffer;
  }
}

module.exports = { SnapshotSource, findSnapshotImage, DEFAULT_TTL_MS };
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — 8 passing

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json lib/camera/snapshot-source.js test/camera/snapshot-source.test.js
git commit -m "Add on-demand snapshot source for camera images"
```

---

### Task 2: Stream source stub and placeholder

**Files:**
- Create: `lib/camera/stream-source.js`
- Create: `lib/camera/placeholder.js`
- Create: `test/camera/stream-source.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `class UnsupportedStreamSource` — methods `prepare(request, callback)`, `handle(request, callback)`, `stop(sessionId)`
  - `getPlaceholder(): Buffer` — cached JPEG bytes

- [ ] **Step 1: Write the failing test**

Create `test/camera/stream-source.test.js`:

```js
'use strict';

const assert = require('node:assert');
const { UnsupportedStreamSource } = require('../../lib/camera/stream-source');
const { getPlaceholder }          = require('../../lib/camera/placeholder');

describe('UnsupportedStreamSource', () => {
  it('calls back with an error from prepare', done => {
    new UnsupportedStreamSource().prepare({}, err => {
      assert.ok(err instanceof Error);
      done();
    });
  });

  it('calls back with an error from handle', done => {
    new UnsupportedStreamSource().handle({}, err => {
      assert.ok(err instanceof Error);
      done();
    });
  });

  it('stop is a no-op that does not throw', () => {
    assert.doesNotThrow(() => new UnsupportedStreamSource().stop('session'));
  });
});

describe('getPlaceholder', () => {
  it('returns valid JPEG bytes', () => {
    const buf = getPlaceholder();
    assert.ok(Buffer.isBuffer(buf));
    assert.strictEqual(buf[0], 0xff);
    assert.strictEqual(buf[1], 0xd8);
  });

  it('returns the same buffer on repeat calls', () => {
    assert.strictEqual(getPlaceholder(), getPlaceholder());
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../../lib/camera/stream-source'`

- [ ] **Step 3: Write the stream source**

Create `lib/camera/stream-source.js`:

```js
'use strict';

// Live video is not available: the Homey Eufy app publishes still images only,
// and its RTSP server (bundled mediamtx) is never started.
//
// This is the seam for adding it later. Implement `prepare`, `handle` and
// `stop` against a real video source and pass the instance to
// `createCameraController({ streamSource })`. Nothing else has to change.
class UnsupportedStreamSource {
  prepare(request, callback) {
    callback(Error('live streaming is not supported'));
  }

  handle(request, callback) {
    callback(Error('live streaming is not supported'));
  }

  stop() {
    // nothing to tear down
  }
}

module.exports = { UnsupportedStreamSource };
```

- [ ] **Step 4: Write the placeholder loader**

Create `lib/camera/placeholder.js`:

```js
'use strict';

const { readFileSync } = require('node:fs');
const { join }         = require('node:path');

// NOTE: `app.js` chdir()s into the persistence directory during onInit, so this
// path must be resolved from __dirname. A relative path would resolve there.
const PLACEHOLDER_PATH = join(__dirname, '..', '..', 'assets', 'camera', 'placeholder.jpg');

let cached = null;

// Served when a real snapshot cannot be fetched. Returning nothing instead
// makes HomeKit mark the whole accessory unresponsive.
function getPlaceholder() {
  if (! cached) {
    cached = readFileSync(PLACEHOLDER_PATH);
  }
  return cached;
}

module.exports = { getPlaceholder, PLACEHOLDER_PATH };
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — 13 passing

- [ ] **Step 6: Commit**

```bash
git add lib/camera/stream-source.js lib/camera/placeholder.js test/camera/stream-source.test.js
git commit -m "Add stream-source seam and snapshot placeholder"
```

---

### Task 3: Camera controller

**Files:**
- Create: `lib/camera/controller.js`
- Create: `test/camera/controller.test.js`

**Interfaces:**
- Consumes: `SnapshotSource` (Task 1), `UnsupportedStreamSource` + `getPlaceholder` (Task 2).
- Produces:
  - `createCameraController({ snapshotSource, streamSource?, placeholder?, log? }) -> CameraController`
  - `class SnapshotOnlyDelegate` (exported for tests) with `handleSnapshotRequest`, `prepareStream`, `handleStreamRequest`

- [ ] **Step 1: Write the failing test**

Create `test/camera/controller.test.js`:

```js
'use strict';

const assert = require('node:assert');
const { SnapshotOnlyDelegate, createCameraController } = require('../../lib/camera/controller');

const PLACEHOLDER = Buffer.from([ 0xff, 0xd8, 0xaa ]);

describe('SnapshotOnlyDelegate', () => {
  it('hands HomeKit the snapshot bytes', done => {
    const delegate = new SnapshotOnlyDelegate({
      snapshotSource : { get : async () => Buffer.from([ 0xff, 0xd8, 0x01 ]) },
      placeholder    : PLACEHOLDER,
    });
    delegate.handleSnapshotRequest({}, (err, buf) => {
      assert.strictEqual(err, undefined);
      assert.deepStrictEqual([ ...buf ], [ 0xff, 0xd8, 0x01 ]);
      done();
    });
  });

  it('falls back to the placeholder when fetching fails', done => {
    // Must not surface the error: HomeKit marks the accessory unresponsive.
    const delegate = new SnapshotOnlyDelegate({
      snapshotSource : { get : async () => { throw Error('boom'); } },
      placeholder    : PLACEHOLDER,
    });
    delegate.handleSnapshotRequest({}, (err, buf) => {
      assert.strictEqual(err, undefined);
      assert.deepStrictEqual([ ...buf ], [ ...PLACEHOLDER ]);
      done();
    });
  });

  it('reports streaming as unsupported', done => {
    const delegate = new SnapshotOnlyDelegate({
      snapshotSource : { get : async () => PLACEHOLDER },
      placeholder    : PLACEHOLDER,
    });
    delegate.prepareStream({}, err => {
      assert.ok(err instanceof Error);
      done();
    });
  });
});

describe('createCameraController', () => {
  it('builds a controller', () => {
    const controller = createCameraController({
      snapshotSource : { get : async () => PLACEHOLDER },
      placeholder    : PLACEHOLDER,
    });
    assert.ok(controller);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../../lib/camera/controller'`

- [ ] **Step 3: Write the implementation**

Create `lib/camera/controller.js`:

```js
'use strict';

const {
  CameraController, SRTPCryptoSuites, H264Profile, H264Level
} = require('../../modules/hap-nodejs');
const { UnsupportedStreamSource } = require('./stream-source');
const { getPlaceholder }          = require('./placeholder');

// HomeKit refuses a camera that advertises no resolutions, even one that only
// ever serves stills. This is the conventional set.
const RESOLUTIONS = [
  [  320,  180, 30 ], [  320,  240, 15 ], [  480,  270, 30 ],
  [  480,  360, 30 ], [  640,  360, 30 ], [  640,  480, 30 ],
  [ 1280,  720, 30 ], [ 1280,  960, 30 ], [ 1920, 1080, 30 ],
];

class SnapshotOnlyDelegate {
  #snapshotSource;
  #streamSource;
  #placeholder;
  #log;

  constructor({ snapshotSource, streamSource = new UnsupportedStreamSource(), placeholder, log = () => {} }) {
    this.#snapshotSource = snapshotSource;
    this.#streamSource   = streamSource;
    this.#placeholder    = placeholder || getPlaceholder();
    this.#log            = log;
  }

  async handleSnapshotRequest(request, callback) {
    try {
      callback(undefined, await this.#snapshotSource.get());
    } catch (e) {
      // Never propagate: an error here makes HomeKit mark the accessory
      // unresponsive, which is worse than a stale or placeholder picture.
      this.#log(`snapshot unavailable, serving placeholder (${ e.message })`);
      callback(undefined, this.#placeholder);
    }
  }

  prepareStream(request, callback) {
    this.#streamSource.prepare(request, callback);
  }

  handleStreamRequest(request, callback) {
    this.#streamSource.handle(request, callback);
  }
}

function createCameraController({ snapshotSource, streamSource, placeholder, log }) {
  const delegate = new SnapshotOnlyDelegate({ snapshotSource, streamSource, placeholder, log });

  const controller = new CameraController({
    cameraStreamCount : 1,
    delegate,
    streamingOptions  : {
      supportedCryptoSuites : [ SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80 ],
      video                 : {
        resolutions : RESOLUTIONS,
        codec       : {
          profiles : [ H264Profile.BASELINE ],
          levels   : [ H264Level.LEVEL3_1 ],
        },
      },
    },
  });

  return controller;
}

module.exports = { createCameraController, SnapshotOnlyDelegate, RESOLUTIONS };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — 17 passing

- [ ] **Step 5: Commit**

```bash
git add lib/camera/controller.js test/camera/controller.test.js
git commit -m "Add snapshot-only HomeKit camera controller"
```

---

### Task 4: Wire the controller into accessory creation

**Files:**
- Modify: `lib/device-mapper.js` (add base-url accessors near `setLogger`)
- Modify: `lib/mapped-device.js` (add camera hook at the end of `accessorize()`)
- Modify: `app.js:299` area (pass the base url in)
- Create: `test/camera/wiring.test.js`

**Interfaces:**
- Consumes: `createCameraController` (Task 3), `findSnapshotImage`/`SnapshotSource` (Task 1).
- Produces:
  - `DeviceMapper.setImageBaseUrl(url)` / `DeviceMapper.getImageBaseUrl()`
  - Map flag `camera: true` is now honoured by `MappedDevice.accessorize()`.

- [ ] **Step 1: Write the failing test**

Create `test/camera/wiring.test.js`:

```js
'use strict';

const assert       = require('node:assert');
const DeviceMapper = require('../../lib/device-mapper');

describe('DeviceMapper image base url', () => {
  it('round-trips the base url', () => {
    DeviceMapper.setImageBaseUrl('https://192-168-110-43.homey.homeylocal.com');
    assert.strictEqual(DeviceMapper.getImageBaseUrl(), 'https://192-168-110-43.homey.homeylocal.com');
  });

  it('strips a trailing slash so paths concatenate cleanly', () => {
    DeviceMapper.setImageBaseUrl('https://homey.local/');
    assert.strictEqual(DeviceMapper.getImageBaseUrl(), 'https://homey.local');
  });

  it('defaults to null before it is set', () => {
    DeviceMapper.setImageBaseUrl(null);
    assert.strictEqual(DeviceMapper.getImageBaseUrl(), null);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `DeviceMapper.setImageBaseUrl is not a function`

- [ ] **Step 3: Add the accessors to `lib/device-mapper.js`**

Add a private field alongside the existing `#logger` declaration:

```js
  #imageBaseUrl = null;
```

Add these two methods directly below the existing `setLogger(logger)` method:

```js
  // Base url of the Homey Web API, used to fetch camera images. Set by the app
  // once the API is up; `null` until then, which disables camera accessories.
  setImageBaseUrl(url) {
    this.#imageBaseUrl = url ? String(url).replace(/\/$/, '') : null;
  }

  getImageBaseUrl() {
    return this.#imageBaseUrl;
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — 20 passing

- [ ] **Step 5: Add the camera hook to `lib/mapped-device.js`**

Add to the requires at the top of the file:

```js
const { createCameraController }             = require('./camera/controller');
const { SnapshotSource, findSnapshotImage }  = require('./camera/snapshot-source');
```

Then, inside `accessorize()`, immediately **before** the final `return accessory;`, add:

```js
    // --- Camera ---
    // Accessory-level controller, not a mapped service: HomeKit only shows a
    // camera when a CameraController is configured on the accessory itself.
    if (this.#maps.some(map => map.camera)) {
      this.attachCamera(accessory);
    }
```

And add this method to the class, directly after `createAccessory()`:

```js
  attachCamera(accessory) {
    const baseUrl = this.#mapper.getImageBaseUrl();
    if (! baseUrl) {
      this.log(2, '- camera skipped: no API base url yet');
      return;
    }

    const image = findSnapshotImage(this.#device);
    if (! image) {
      this.log(2, '- camera skipped: device exposes no images');
      return;
    }

    try {
      const snapshotSource = new SnapshotSource({ url : `${ baseUrl }${ image.imageObj.url }` });
      accessory.configureController(createCameraController({
        snapshotSource,
        log : message => this.log(2, `- camera: ${ message }`),
      }));
      this.log(2, `- camera configured (${ image.title })`);
    } catch (e) {
      // A broken camera must not take down the rest of the accessory.
      this.log(2, `- camera failed to configure: ${ e.message }`);
    }
  }
```

- [ ] **Step 6: Pass the base url in from `app.js`**

In `app.js`, find `mapDevices()` and the line:

```js
    DeviceMapper.setLogger(this.log.bind(this));
```

Add immediately after it:

```js
    // Camera accessories fetch their images straight off the Web API.
    try {
      DeviceMapper.setImageBaseUrl(await this.#api.baseUrl);
    } catch (e) {
      this.error('could not determine API base url, cameras will be skipped:', e.message);
    }
```

Note `api.baseUrl` is an **async getter**, not a method — `await api.baseUrl`, never `api.baseUrl()`.

- [ ] **Step 7: Verify nothing regressed**

Run: `npm test`
Expected: PASS — 20 passing

Run: `node --check app.js && node --check lib/mapped-device.js && node --check lib/device-mapper.js`
Expected: no output (all parse)

- [ ] **Step 8: Commit**

```bash
git add lib/device-mapper.js lib/mapped-device.js app.js test/camera/wiring.test.js
git commit -m "Wire camera controller into accessory creation"
```

---

### Task 5: Eufy camera map

**Files:**
- Create: `lib/maps/camera-eufy.js`
- Modify: `lib/maps/battery.js` (extend class list)
- Create: `test/camera/map-camera-eufy.test.js`

**Interfaces:**
- Consumes: the `camera: true` flag honoured in Task 4.
- Produces: a map matching `class: 'camera'` devices.

Reference — real capability list from the live Homey (Trädgården, a floodlight camera):
`onoff, CMD_DEV_LED_SWITCH, CMD_SET_FLOODLIGHT_MANUAL_SWITCH, measure_battery, measure_temperature, CMD_IRCUT_SWITCH, CMD_START_STREAM, CMD_TRIGGER_ALARM, CMD_SET_HUB_ALARM_CLOSE, CMD_SET_SNOOZE_MODE_HOMEBASE, NTFY_MOTION_DETECTION, NTFY_FACE_DETECTION, NTFY_PET_DETECTED, NTFY_VEHICLE_DETECTED, alarm_motion, CMD_SNAPSHOT, NTFY_KNOWN_FACE_DETECTION`

- [ ] **Step 1: Write the failing test**

Create `test/camera/map-camera-eufy.test.js`:

```js
'use strict';

const assert = require('node:assert');
const DeviceMapper = require('../../lib/device-mapper');

// Shape mirrors what the Homey Web API returns; `ui.components` is what the
// mapper actually reads capabilities from, not `capabilities`.
function eufyCamera(overrides = {}) {
  return Object.assign({
    id           : 'test-camera',
    name         : 'Trädgården',
    class        : 'camera',
    capabilities : [ 'onoff', 'alarm_motion', 'NTFY_MOTION_DETECTION', 'measure_battery' ],
    ui           : { components : [
      { id : 'toggle',  capabilities : [ 'onoff' ] },
      { id : 'sensor',  capabilities : [ 'alarm_motion', 'NTFY_MOTION_DETECTION' ] },
      { id : 'battery', capabilities : [ 'measure_battery' ] },
    ] },
    images : [ { id : 'x-Snapshot', title : 'Trädgården - Snapshot', imageObj : { id : 'snp', url : '/api/image/snp' } } ],
  }, overrides);
}

// NOTE: `mapDevice` caches by device id and upstream exposes no reset hook
// (only `forgetDevice`), so every test below uses a distinct id.
describe('eufy camera map', () => {
  it('maps a Eufy camera', () => {
    const mapped = DeviceMapper.mapDevice(eufyCamera());
    assert.ok(mapped, 'camera should be mappable');
  });

  it('opts into the camera controller and the CAMERA category', () => {
    const { Service, Characteristic, Accessory } = require('../../modules/hap-nodejs');
    const map = require('../../lib/maps/camera-eufy')(DeviceMapper, Service, Characteristic, Accessory);
    assert.strictEqual(map.camera, true, 'map must set camera:true or no CameraController is attached');
    assert.strictEqual(map.category, Accessory.Categories.CAMERA);
    assert.ok('NTFY_MOTION_DETECTION' in map.required);
  });

  it('does not map a camera without motion capabilities', () => {
    const bare = eufyCamera({
      id : 'test-camera-3',
      ui : { components : [ { id : 'toggle', capabilities : [ 'onoff' ] } ] },
    });
    assert.strictEqual(DeviceMapper.mapDevice(bare), null);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `camera should be mappable` (no map matches `class: camera`)

- [ ] **Step 3: Write the map**

Create `lib/maps/camera-eufy.js`:

```js
module.exports = (Mapper, Service, Characteristic, Accessory) => ({
  class    : 'camera',
  // Handled by an accessory-level CameraController, see MappedDevice#attachCamera.
  camera   : true,
  // A camera still needs a primary service; motion is the one that carries
  // real state, and it is what drives HomeKit notifications.
  service  : Service.MotionSensor,
  category : Accessory.Categories.CAMERA,
  required : {
    // Eufy publishes motion on its own notification capability. `alarm_motion`
    // exists too but lags behind it, so this is the one to key on.
    NTFY_MOTION_DETECTION : {
      characteristics : Characteristic.MotionDetected,
      ...Mapper.Accessors.Boolean
    }
  },
  optional : {
    // NOTE: pet/vehicle/face notifications are deliberately NOT mapped here.
    // Each mapped capability gets its own listener writing to the shared
    // MotionDetected characteristic, so routing several of them to it makes
    // competing writers and a `pet: false` event cancels live motion.
    measure_temperature : {
      characteristics : Characteristic.CurrentTemperature,
      get             : value => value
    }
  }
});
```

- [ ] **Step 4: Extend `lib/maps/battery.js` so cameras get a battery service**

Change its first line from:

```js
  class : [ 'sensor', 'other' ],
```

to:

```js
  class : [ 'sensor', 'other', 'camera', 'doorbell' ],
```

This reuses the existing battery map rather than duplicating its
`StatusLowBattery` logic, and gives the battery cameras and the doorbell a
proper HomeKit battery service.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — 23 passing

- [ ] **Step 6: Commit**

```bash
git add lib/maps/camera-eufy.js lib/maps/battery.js test/camera/map-camera-eufy.test.js
git commit -m "Add Eufy camera map and extend battery map to cameras"
```

---

### Task 6: Video doorbell

**Files:**
- Modify: `lib/maps/doorbell-eufy.js`
- Create: `test/camera/map-doorbell-eufy.test.js`

**Interfaces:**
- Consumes: the `camera: true` flag (Task 4), battery map extension (Task 5).
- Produces: the doorbell accessory gains a camera.

Real doorbell UI components from the live Homey:
`toggle: onoff` / `picker: CMD_DOORBELL_QUICK_RESPONSE` / `sensor: measure_temperature, NTFY_MOTION_DETECTION, NTFY_FACE_DETECTION, NTFY_PET_DETECTED, NTFY_VEHICLE_DETECTED, NTFY_PRESS_DOORBELL, NTFY_KNOWN_FACE_DETECTION` / `battery: measure_battery`

- [ ] **Step 1: Write the failing test**

Create `test/camera/map-doorbell-eufy.test.js`:

```js
'use strict';

const assert = require('node:assert');
const DeviceMapper = require('../../lib/device-mapper');

function eufyDoorbell() {
  return {
    id           : 'test-doorbell',
    name         : 'Dörrklockan',
    class        : 'doorbell',
    capabilities : [ 'onoff', 'NTFY_PRESS_DOORBELL', 'NTFY_MOTION_DETECTION', 'measure_battery' ],
    ui           : { components : [
      { id : 'toggle',  capabilities : [ 'onoff' ] },
      { id : 'sensor',  capabilities : [ 'NTFY_MOTION_DETECTION', 'NTFY_PRESS_DOORBELL' ] },
      { id : 'battery', capabilities : [ 'measure_battery' ] },
    ] },
    images : [ { id : 'd-Snapshot', title : 'Dörrklockan - Snapshot', imageObj : { id : 'snp', url : '/api/image/snp' } } ],
  };
}

describe('eufy doorbell map', () => {
  it('still maps the doorbell', () => {
    assert.ok(DeviceMapper.mapDevice(eufyDoorbell()));
  });

  it('opts into the camera controller and keeps the VIDEO_DOORBELL category', () => {
    // VIDEO_DOORBELL is what makes iOS show a doorbell notification with a
    // picture instead of a plain alert, so it must survive the change.
    const { Service, Characteristic, Accessory } = require('../../modules/hap-nodejs');
    const map = require('../../lib/maps/doorbell-eufy')(DeviceMapper, Service, Characteristic, Accessory);
    assert.strictEqual(map.camera, true, 'doorbell map must set camera:true');
    assert.strictEqual(map.category, Accessory.Categories.VIDEO_DOORBELL);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: the first test PASSES (the doorbell map already exists, and this pins
that it keeps working); the second FAILS on `map.camera` being `undefined`.

- [ ] **Step 3: Extend `lib/maps/doorbell-eufy.js`**

Replace the whole file with:

```js
module.exports = (Mapper, Service, Characteristic, Accessory) => ({
  class:     'doorbell',
  // Handled by an accessory-level CameraController, see MappedDevice#attachCamera.
  camera:    true,
  service:   Service.Doorbell,
  category:  Accessory.Categories.VIDEO_DOORBELL,
  onService: service => { service.setPrimaryService(true) }, // XXX: is this strictly necessary?
  required: {
    NTFY_PRESS_DOORBELL : {
      characteristics : Characteristic.ProgrammableSwitchEvent,
      get : (value, { capability }) => {
        if (! capability || ! value) return null;
        return Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS;
      }
    }
  }
});
```

The only change is the added `camera: true` line — everything else is
upstream's file verbatim, to keep the diff reviewable.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — 25 passing

- [ ] **Step 5: Commit**

```bash
git add lib/maps/doorbell-eufy.js test/camera/map-doorbell-eufy.test.js
git commit -m "Give the Eufy video doorbell a HomeKit camera"
```

---

### Task 7: Document the Flow requirement

**Files:**
- Create: `docs/eufy-cameras.md`
- Modify: `README.md`

**Not touching `settings/index.html`:** it is a petite-vue single-page app
whose pages are driven by `currentPage` state in `settings/app.js`, and it
uses its own `page` / `list` / `header` classes rather than Homey's standard
`homey-*` ones. Adding a page there means editing the view model too. That is
worth doing, but as its own change — not smuggled into this one. Logged as a
follow-up at the end of this plan.

Without refresh Flows the camera tiles freeze on whatever image was current
at install time, and there is no timestamp anywhere to reveal it. This must be
discoverable from inside the app, not only in the repo.

- [ ] **Step 1: Write the user documentation**

Create `docs/eufy-cameras.md`:

```markdown
# Eufy cameras in HomeKit

HomeKitty shows your Eufy cameras and video doorbell in the Home app as
camera accessories displaying a still image, plus working motion sensors,
doorbell chime, battery level and floodlight switch.

## Live video is not available

The Homey Eufy app does not publish a video stream — it produces single JPEG
snapshots. Tapping a camera for live video will fail. This is a limitation of
the Eufy app, not of HomeKitty.

## You must create refresh Flows

HomeKitty can read the camera image but **cannot ask for a new one**: Homey
does not allow apps to run other apps' Flow cards. Without a Flow, your camera
tile will freeze on a single old picture.

Create one Flow per camera:

| | |
|---|---|
| **WHEN** | Motion detected *(Eufy card, on that camera)* |
| **THEN** | Take snapshot *(Eufy card, same camera)* |

For the video doorbell, use **Doorbell pressed** as the trigger instead — that
is the moment you actually want a current picture, and it avoids waking the
battery-powered camera on every passing car.

### Battery cameras

Every snapshot wakes a peer-to-peer video connection to the camera, which
costs battery. If you see faster drain on a battery camera, add a condition to
its Flow so it only takes a snapshot if it has not done so in the last few
minutes.
```

- [ ] **Step 2: Link it from the README**

Add to `README.md`, immediately after the existing introduction paragraph:

```markdown
## Eufy cameras

Eufy cameras and video doorbells appear as HomeKit cameras showing a still
image. Live video is not available, and you must create a Homey Flow per
camera to keep the picture up to date — see
[docs/eufy-cameras.md](docs/eufy-cameras.md).
```

- [ ] **Step 3: Verify the app still validates**

Run: `homey app validate`
Expected: validates against level `debug` with no new errors

- [ ] **Step 4: Commit**

```bash
git add docs/eufy-cameras.md README.md
git commit -m "Document the Eufy camera Flow requirement"
```

---

### Task 8: Verify on the real Homey

This is the task that decides whether any of the above actually worked.
Nothing before this proves HomeKit accepts the accessories.

**Precondition:** HomeKitty from the App Store is installed under the same app
id (`name.klep.homekitty`). `homey app run` will temporarily shadow it, and
the bridge will drop off HomeKit for the duration. Confirm with the user
before running, and be ready to `Ctrl-C` to restore the installed version.

- [ ] **Step 1: Run the app against the real Homey**

```bash
cd ~/CascadeProjects/name.klep.homekitty
homey app run
```

Docker Desktop must be running.

- [ ] **Step 2: Confirm the cameras were configured**

Look for these lines in the output, one per camera:

```
- camera configured (Trädgården - Snapshot)
- camera configured (Cyckelstället - Snapshot)
- camera configured (Living Room - Snapshot)
- camera configured (Uterummet - Snapshot)
- camera configured (Dörrklockan  - Snapshot)
```

If instead you see `- camera skipped: no API base url yet`, the `await
api.baseUrl` wiring in Task 4 Step 6 is wrong. If you see `- camera skipped:
device exposes no images`, check `findSnapshotImage` against the real device
payload.

- [ ] **Step 3: Check the Home app**

On an iOS device, open Home. Each Eufy camera should show a tile with a
picture rather than a generic sensor row, and Dörrklockan should appear as a
doorbell.

- [ ] **Step 4: Verify the refresh loop end to end**

Walk in front of Uterummet (or run the Flow `HomeKitty: snapshot Uterummet on
motion` from the Homey app), wait ~20 seconds, then pull to refresh in the
Home app. The tile image should change.

- [ ] **Step 5: Verify graceful failure**

Temporarily disable the Eufy app in Homey (`Settings → Apps → Eufy Security →
Disable`), then request a snapshot in the Home app. Expect the placeholder
image, not an unresponsive accessory, and a
`snapshot unavailable, serving placeholder` line in the log. Re-enable the
Eufy app afterwards.

- [ ] **Step 6: Record the outcome**

Append a "Verified on hardware" section to
`docs/superpowers/specs/2026-08-04-eufy-cameras-in-homekit-design.md` stating
what worked, what did not, and the date. Then commit.

```bash
git add docs/superpowers/specs/2026-08-04-eufy-cameras-in-homekit-design.md
git commit -m "Record hardware verification results"
```

---

## Self-Review Notes

**Spec coverage:** snapshot fetch (Task 1), stream seam (Task 2), controller
(Task 3), `map.camera` hook + base-url plumbing (Task 4), camera map + battery
(Task 5), video doorbell (Task 6), Flow documentation (Task 7), hardware
verification (Task 8).

**Deliberately not built (follow-ups, not omissions):**
- Floodlight switch (`CMD_SET_FLOODLIGHT_MANUAL_SWITCH`) — needs a second
  service on the same accessory, which the current one-service-per-map
  structure does not express.
- Settings-page notice — the settings UI is a petite-vue SPA needing view
  model changes in `settings/app.js`; documented in `docs/` and README instead.
- Pan/tilt (`CMD_INDOOR_PAN_TURN`) — no HomeKit equivalent exists.
- HomeKit Secure Video — requires real streaming, which the Eufy app does not
  provide.

**Note on the spec's claimed accessory contents:** the spec says cameras get a
`Switch` for the floodlight. That is deferred above, so the spec overstates
what this plan delivers. Update the spec when the floodlight lands, or amend
it now to match.

**Verification honesty:** Tasks 1–7 are unit-tested only. Nothing before
Task 8 demonstrates that HomeKit accepts these accessories. Do not report the
feature as working until Task 8 passes on real hardware.
