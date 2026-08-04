# Exposing Eufy cameras to HomeKit via HomeKitty

**Date:** 2026-08-04
**Status:** Approved; spike complete, refresh mechanism revised
**Branch:** `eufy-camera` (off `upstream/main`)

## Spike results (2026-08-04)

Run as a throwaway app (`com.spike.imageaccess`) with the same
`homey:manager:api` permission HomeKitty holds, against the live Homey Pro.

**Reading images works.** Confirmed end to end:

```
fetch  <baseUrl>/api/image/<id>  ->  79222 bytes, valid JPEG   (with and without bearer)
api.call({path, json:false})     ->  string(75518)             <- corrupts binary, do not use
```

- `api.baseUrl` is an **async getter, not a method** — `await api.baseUrl`.
  It resolved to `https://192-168-110-43.homey.homeylocal.com`.
- `api.call()` decodes the response to a string and mangles JPEG bytes.
  Use `fetch` against the base url instead. Auth is not required on the
  local address, but sending the bearer (`api.__token`) also works.

**Device to image mapping is direct.** `device.images` is an array of:

```json
{ "type": "camera", "id": "T8210P8123222311-Snapshot",
  "title": "Dörrklockan - Snapshot",
  "imageObj": { "id": "2de1e04f-…", "url": "/api/image/2de1e04f-…",
                "lastUpdated": 1785503615889 } }
```

Each camera exposes two: `Snapshot` and `Event`. No id guessing needed, and
`lastUpdated` gives us a free change signal.

**Triggering a snapshot does NOT work.** `api.flow.runFlowCardAction()` fails
in ~11ms with `Missing Scopes`. Adding `homey:manager:flow` to the manifest
fails validation — `Invalid permission`. Athom deliberately withholds
flow-execution scope from apps; the `homey:manager:api` documentation
claiming control over "devices, Flows, etc" is misleading on this point.

The snapshot action cards themselves are per-device and easy to address —
`homey:device:<deviceId>:action_CMD_SNAPSHOT`, present for all five cameras —
but an app may not run them.

**Consequence:** the refresh half of the original design is not implementable
inside HomeKitty. See the revised refresh section below.

## Goal

Make the Eufy cameras and video doorbell that the Homey Eufy app
(`com.eufylife.security`) already exposes appear in Apple's Home app as real
HomeKit camera accessories, bridged by HomeKitty.

Scope for this iteration is **snapshot images plus motion and doorbell
events**. Live video is explicitly out of scope, but the design keeps a seam
for it so live can be added later without reworking the camera controller.

## Background

### What the Eufy app actually provides

Reading `lib/helpers/eufy-stream.helper.js` in `com.eufylife.security`, the
snapshot path is:

1. Open a P2P livestream to the camera via `eufy-security-client`.
2. Destroy the audio stream (`audioStream.destroy()`).
3. Pipe video into a bundled ffmpeg, grab a single frame, write a JPEG.
4. Register that JPEG as a Homey camera image via `setCameraImage`.

So the Eufy app publishes **still images, not a continuous stream**. The
HLS/RTMP flow cards are deprecated and now throw
`"HLS/RTMP streaming is no longer supported"`. The app ships a `mediamtx`
binary and has a `writeMediaMtxYmlFile()` that would configure an RTSP
server, but that function is never called from anywhere. It is dead code.

Two constraints follow from this code, and both drive the design:

- **Snapshots are globally serialized.** `FfmpegManager` holds a single
  `this.proc` and calls `stopStream()` at the start of every snapshot.
  Concurrent snapshot requests kill each other's stream.
- **Snapshots are expensive.** Each one wakes a full P2P livestream, taking
  several seconds and draining battery on battery-powered cameras.

### What HomeKitty provides

- Bundled hap-nodejs is 1.1.0 and **does** export `CameraController`.
- `lib/mapped-device.js` already calls `accessory.configureController()` for
  Adaptive Lighting, gated on a `map.adaptiveLighting` flag. A camera is the
  same shape, which gives us a hook that fits the existing architecture.
- The bundled `homey-api` exposes `runFlowCardAction` and a `ManagerImages`,
  which is what we need to trigger and then read a snapshot.

### Target devices

Captured from the live Homey on 2026-08-04. These capability lists are the
fixtures for unit tests.

| Device | Class | Power | Notable capabilities |
|---|---|---|---|
| Dörrklockan | doorbell | battery 62% | `NTFY_PRESS_DOORBELL`, `CMD_SNAPSHOT`, `CMD_BAT_DOORBELL_*` |
| Trädgården | camera | battery 70% | `CMD_SET_FLOODLIGHT_MANUAL_SWITCH`, `CMD_SNAPSHOT` |
| Cyckelstället | camera | battery 93% | `CMD_SET_FLOODLIGHT_MANUAL_SWITCH`, `CMD_SNAPSHOT` |
| Living Room | camera | mains | `CMD_INDOOR_PAN_TURN`, `CMD_SNAPSHOT` |
| Uterummet | camera | mains | `CMD_INDOOR_PAN_TURN`, `CMD_SNAPSHOT` |

All expose `NTFY_MOTION_DETECTION`, `NTFY_FACE_DETECTION`,
`NTFY_KNOWN_FACE_DETECTION`, `NTFY_PET_DETECTED`, `NTFY_VEHICLE_DETECTED`.

### Why not build on the existing fork work

The fork carried three commits (branched 2024-12-21) adding ~15,000 lines:
`mapper-base`, `device-registry`, `device-state-manager`,
`capability-observer`, and a parallel set of `*-improved.js` maps. Those
commits include four Eufy/camera map files, all of which declare
`Service.CameraRTPStreamManagement` as an ordinary mapped service. HomeKit
ignores that — a camera requires an accessory-level `CameraController`, not a
service in the capability map. The prior work cannot produce a camera
regardless of how it is fixed up.

Meanwhile upstream moved 51 commits (~285 lines, focused fixes) and is still
actively maintained. So this work branches fresh off `upstream/main`. The old
work is preserved on the `legacy-refactor` branch, not deleted.

## Architecture

Four new files, plus one small change to existing upstream code.

| File | Responsibility |
|---|---|
| `lib/camera/controller.js` | Build a hap-nodejs `CameraController` for a device; own the snapshot delegate |
| `lib/camera/snapshot-source.js` | Fetch and cache the latest JPEG for a device |
| `lib/camera/snapshot-source.js` | Fetches the JPEG on demand, with a 2s TTL to absorb bursts |
| `lib/camera/stream-source.js` | Live-video interface; ships as `UnsupportedStreamSource` |
| `lib/maps/camera-eufy.js` | Map declaring `camera: true` |
| `lib/maps/doorbell-eufy.js` | Extended with `camera: true` |

The change to `lib/mapped-device.js` is a `map.camera` branch placed beside
the existing `map.adaptiveLighting` branch:

```js
if (map.camera) {
  accessory.configureController(createCameraController(device, { ... }));
}
```

Keeping the diff to upstream this small is deliberate: it leaves the door
open to submitting this as a pull request to `robertklep/name.klep.homekitty`
rather than maintaining a permanent fork.

## Data flow

### Serving a snapshot (synchronous, fast path)

```
HomeKit ──▶ CameraController.handleSnapshotRequest
              └─▶ SnapshotSource.get(deviceId)
                    └─▶ cached Buffer ──▶ HomeKit
```

Always served from cache. Never blocks on the Eufy app, so it cannot hit
HomeKit's snapshot timeout.

### Keeping the JPEG fresh (revised twice, after measurement)

HomeKitty cannot run the Eufy snapshot action itself, so the refresh lives in
a Homey Flow the user owns:

```
Homey Flow (one per camera):
   WHEN  motion detected on <camera>   (doorbell: also "doorbell pressed")
   THEN  Eufy "Take snapshot" on <camera>
            └─▶ Eufy app overwrites the JPEG behind /api/image/<id>
```

**There is no change signal to watch.** Measured on the live Homey: after a
snapshot the image bytes changed (hash moved within 20s), but

- `imageObj.lastUpdated` did **not** move — it is frozen at Eufy app start
  time, identical across all 10 images;
- the endpoint sends no `Last-Modified` and no `ETag`, only
  `Cache-Control: no-cache`.

So the originally planned `image-watcher` cannot work. It turns out not to
matter, because fetching is cheap:

```
5 sequential fetches of a live snapshot: ~120ms each for 189KB
```

and HomeKitty runs on the Homey itself, so its fetches are loopback.

**Therefore: fetch on demand.** `handleSnapshotRequest` fetches the current
JPEG each time HomeKit asks. A 2-second TTL cache exists only to absorb the
burst when the Home app opens and requests every camera at once — not as a
freshness strategy. This deletes both the watcher and the snapshot queue from
the design.

The one-time setup cost is five Flows (created 2026-08-04, see below). This
should be documented prominently in the app's settings page, because a user
who skips it gets a camera tile frozen on whatever image was current when
they installed.

### Flows created on the live Homey (2026-08-04)

| Flow | Trigger | Action |
|---|---|---|
| HomeKitty: snapshot Uterummet on motion | `NTFY_MOTION_DETECTION` | `action_CMD_SNAPSHOT` |
| HomeKitty: snapshot Living Room on motion | `NTFY_MOTION_DETECTION` | `action_CMD_SNAPSHOT` |
| HomeKitty: snapshot Trädgården on motion | `NTFY_MOTION_DETECTION` | `action_CMD_SNAPSHOT` |
| HomeKitty: snapshot Cyckelstället on motion | `NTFY_MOTION_DETECTION` | `action_CMD_SNAPSHOT` |
| HomeKitty: snapshot Dörrklockan on doorbell press | `NTFY_PRESS_DOORBELL` | `action_CMD_SNAPSHOT` |

Card ids follow `homey:device:<deviceId>:<cardId>` and take no arguments.
Verified end to end: running the Uterummet flow produced new image bytes
within 20 seconds.

**Deliberately not created:** a motion flow for the doorbell. It is the
lowest battery of the five (62%) and sits on the driveway, so motion-driven
snapshots would wake its P2P stream frequently. The press-triggered flow
covers the moment that matters. Worth revisiting if battery holds up.

## Accessories produced

**Cameras** → `CameraController` + `MotionSensor` (folding
`NTFY_MOTION_DETECTION`, `alarm_motion`, and the face/pet/vehicle
notifications into one `MotionDetected` characteristic) + `Battery` where
present + `Switch` for `CMD_SET_FLOODLIGHT_MANUAL_SWITCH`.

**Dörrklockan** → accessory category `VIDEO_DOORBELL`, with the `Doorbell`
service primary (`NTFY_PRESS_DOORBELL` → `ProgrammableSwitchEvent`), plus
`CameraController`, `MotionSensor` and `Battery`. The `VIDEO_DOORBELL`
category is what makes iOS show a rich doorbell notification with a picture
rather than a plain alert.

## The seam for live video

`StreamSource` defines three methods:

```js
prepare(request)   // negotiate SRTP endpoints
start(request)     // begin streaming
stop(sessionId)    // tear down
```

This iteration ships `UnsupportedStreamSource`, which returns a HAP error
from `prepare()`. The Home app tile shows the cached snapshot; tapping
through to live view fails cleanly rather than hanging.

Adding live video later means writing an `RtspStreamSource` behind the same
interface, fed by either the Eufy app's currently-dormant mediamtx or a
camera's native RTSP. The controller does not change. The cost of keeping
this door open is one interface and one null implementation.

## Error handling

- **No cached image yet** — serve a bundled placeholder JPEG. Returning
  nothing causes HomeKit to mark the accessory unresponsive.
- **Eufy app absent, or too old to have `action_CMD_SNAPSHOT`** — log once at
  startup, then degrade to a motion sensor with a placeholder image. Never
  throw; an unrelated missing app must not take HomeKitty down.
- **Snapshot refresh fails or times out** — keep serving the stale image.
  A stale picture beats no picture.
- **Queue backpressure** — if a refresh for a device is already queued, drop
  the duplicate rather than growing the queue. Motion events burst.

## Testing

- **Unit** — mapper produces the expected services and characteristics for
  each of the five device shapes, using fixtures taken from the real
  capability lists captured above.
- **Unit** — `SnapshotQueue` serializes: two concurrent enqueues for
  different devices produce two sequential flow-card invocations, never
  overlapping.
- **Integration** — fake Homey API returning image buffers; assert the
  snapshot delegate returns bytes, and that a failed refresh still serves the
  previous image.
- **Manual** — run on the real Homey, pair with the Home app, confirm all
  five accessories appear with images, and that a doorbell press produces an
  iOS notification.

## Remaining risks

The original open risk (can we read another app's image bytes?) is **closed —
yes**, see the spike results above.

What remains:

1. **Stale images if the user skips Flow setup.** Mitigated by documenting it
   in app settings, and by surfacing image age so a frozen tile is
   diagnosable rather than mysterious.
2. **Snapshot age is invisible in HomeKit**, and we cannot even measure it —
   there is no reliable per-image timestamp (see above). A stale tile looks
   identical to a fresh one.
3. **Battery cost scales with motion frequency.** Every motion event on a
   battery camera now wakes a P2P livestream. Trädgården (70%) and
   Cyckelstället (93%) should be watched over the first week; if drain is
   bad, add a "not in the last N minutes" condition to those Flows.
4. **Several images share bytes.** Four of the ten Eufy images hash
   identically — the app registers one shared "Event" image per HomeBase.
   Map cameras via `device.images[]` and prefer the entry whose title
   contains `Snapshot`, never by picking from the global image list.
3. **hap-nodejs 1.1.0 is old.** Its `CameraController` is present and
   sufficient for snapshots, but if live video is added later a bump may be
   needed. Not a problem for this iteration.
