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

Each camera exposes two: `Snapshot` and `Event`. No id guessing needed.

(An earlier draft assumed `lastUpdated` gave a free change signal. Later
measurement disproved that — see "Keeping the JPEG fresh" below. It never
moves.)

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
- The bundled `homey-api` exposes `ManagerImages`, which is how we read a
  snapshot. It also exposes `runFlowCardAction`, but calling it fails with
  `Missing Scopes` — see the spike results above.

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
| `lib/camera/snapshot-source.js` | Fetches the JPEG on demand, with a 2s TTL to absorb bursts |
| `lib/camera/placeholder.js` | Loads the fallback JPEG once, from a `__dirname`-relative path |
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
              └─▶ SnapshotSource.get()
                    └─▶ GET <baseUrl>/api/image/<id>   (~120ms, loopback)
                          └─▶ Buffer ──▶ HomeKit
```

Fetched on demand, not served from a long-lived cache — the 2s TTL exists only
to absorb the burst when the Home app opens every camera at once.

The fetch carries a 5s abort deadline, so a stalled Homey API cannot leave the
HomeKit callback unfired. On any failure the delegate returns the placeholder
JPEG rather than an error: propagating an error makes HomeKit mark the whole
accessory unresponsive, which is worse than a stale picture.

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

**Cameras** → `CameraController` + `MotionSensor` + `Battery` where present.

**Only `NTFY_MOTION_DETECTION` drives `MotionDetected`.** An earlier draft of
this spec folded `alarm_motion` and the face/pet/vehicle notifications into
the same characteristic. That is not implementable here: HomeKitty gives every
mapped capability its own listener writing to the shared characteristic
instance, with no aggregation, so several capabilities on one characteristic
become competing writers — an `NTFY_PET_DETECTED: false` event silently
cancels live motion. Eufy fires `NTFY_MOTION_DETECTION` for essentially every
motion event anyway; pet and vehicle are classifications of that same event
rather than additional ones, so nothing is lost. No other map in `lib/maps/`
multiplexes unrelated capabilities onto one characteristic either.

The floodlight `Switch` (`CMD_SET_FLOODLIGHT_MANUAL_SWITCH`) is **deferred** —
it needs a second service on the same accessory, which the current
one-service-per-map structure does not express.

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

## Verified on hardware (2026-08-04)

Run against the live Homey Pro. **Partial — the HomeKit-facing half is still
unverified.**

Confirmed working:

- The app boots on the Homey with the camera code in place, no errors.
- The video doorbell attached a HomeKit `CameraController`:
  `camera configured (Dörrklockan  - Snapshot)`. This exercises the entire
  chain — map flag → `attachCamera` → API base url → `findSnapshotImage` →
  `SnapshotSource` → `createCameraController`.
- The doorbell's own service built correctly:
  `[NTFY_PRESS_DOORBELL] → [ProgrammableSwitchEvent]`.
- All four cameras logged `was able to map`, so the camera map matches the
  real devices.
- The refresh design works end to end: running the Uterummet Flow changed the
  published JPEG's bytes within 12 seconds.

Not yet verified:

- How any of it looks in the Home app. `homey app run` executes the app in a
  Docker container on the developer's machine, so the HAP bridge never
  advertises on the LAN — HomeKit rendering cannot be checked that way at all.
  Use `homey app install` instead.
- The placeholder fallback, which only fires on a real HomeKit snapshot
  request.
- The four cameras attaching controllers. They are set `false` in HomeKitty's
  `HomeKit.Exposed` setting (66 of 100 devices are exposed; these four are
  not), so `accessorize()` never runs for them. User configuration, not a
  defect — they must be enabled in HomeKitty's settings.

Operational note, learned destructively: `homey app run` uninstalls the
installed app for the duration and relies on its own `Ctrl-C` cleanup to put
it back. Killing the process instead leaves HomeKitty **uninstalled**, taking
the whole HomeKit bridge offline until it is reinstalled from the App Store.

## Root cause of the "grey placeholder" report (2026-08-04)

After install, the doorbell tile showed a dark image that looked like our
fallback. It was not ours, and nothing was broken.

Evidence, gathered by instrumenting the running app on the Homey (app settings
were used as the readback channel, since app logs are not reachable from the
CLI):

```
baseUrl        http://127.0.0.1:80        <- on-device, not the homeylocal URL
mapperBaseUrl  http://127.0.0.1:80
foundImage     Dörrklockan  - Snapshot -> /api/image/2de1e04f-…
builtUrl       http://127.0.0.1:80/api/image/2de1e04f-…
realPath       OK 79222B JPEG (27ms)      <- the real production code path
```

The production path — same modules, same URL construction, same
`SnapshotSource` the delegate uses — fetched a valid JPEG in 27ms. Fetching
was never the problem.

Looking at the bytes settled it: **the Eufy app publishes its own placeholder**
— a black 1024×573 JPEG carrying the eufy logo and the text "PLACEHOLDER
IMAGE", exactly 79222 bytes — for any camera that has not yet had a snapshot
taken. HomeKitty was correctly showing what Homey held.

Running each camera's Flow once replaced 9 of the 10 Eufy images with real
photographs (the tenth is a per-HomeBase "Event" image, which we do not use).
Uterummet's came back as a 1920×1080 photo stamped with the minute its Flow
ran, and the doorbell's as an 86KB photo of the driveway.

**Two lessons worth keeping:**

- `api.baseUrl` differs by environment: `http://127.0.0.1:80` on-device,
  `https://<ip>.homey.homeylocal.com` from a remote/dev session. Reading it at
  runtime rather than assuming either form is what made this work in both.
- A new install shows the eufy placeholder until each camera's Flow has fired
  once. Documented in `docs/eufy-cameras.md`; seed them by hand after setup.

## UNRESOLVED: HomeKit never requests a snapshot (2026-08-04)

The camera tiles render, but iOS shows its own generic placeholder and
**never issues a snapshot request** — verified by instrumenting
`handleSnapshotRequest` and persisting every call to an app setting. Over
10+ minutes, with the Home app opened and refreshed, zero requests arrived.

### Ruled out by evidence, not assumption

| Hypothesis | How it was tested | Result |
|---|---|---|
| Snapshot fetch fails on-device | Ran the real production path (same modules, same URL construction) inside the app | Works — valid JPEG in 27ms |
| `api.baseUrl` wrong on-device | Logged it from the running app | `http://127.0.0.1:80`, fetches fine |
| Wrong image selected | Logged the resolved image per device | Correct `- Snapshot` image each time |
| Camera controller not attached | Logged every `attachCamera` | All 5 attached with valid URLs |
| Controller not registered on accessory | Local test of `configureController` | `activeCameraController` is set |
| Malformed camera service | Dumped published characteristics | Well-formed; hap-nodejs supplies a default `SupportedAudioStreamConfiguration` |
| Bridge unpaired / no HAP session | User confirmed other bridged accessories (lights) respond | Bridge is paired and online |
| Eufy publishing a placeholder image | Fetched and viewed the bytes | Was true initially; fixed by seeding. Real photos now served |

### Leading hypothesis, still untested

HAP cannot expose multiple cameras through a single endpoint
([hap-nodejs IP Camera wiki](https://github.com/homebridge/HAP-NodeJS/wiki/IP-Camera):
*"it's not possible to expose multiple cameras via a single HAP Endpoint"*,
and bridged cameras "may result in unexpected behavior"). HomeKitty bridges
everything via `addBridgedAccessory`, and we attached five cameras to one
bridge.

A first attempt to test this — skipping the camera controller for four of the
five devices — was **invalid**: removing the controller server-side does not
remove those accessories from iOS's cached database, so iOS still believed
there were five cameras. The corrected experiment (keeping those four
accessories off the bridge entirely, so iOS drops them) could not be installed:
Athom's cloud API returned `Too many requests` after the session's many
installs.

### If the hypothesis holds

The fix is to publish cameras as standalone accessories rather than bridging
them — `Accessory.prototype.publish` and `unpublish` do exist in the vendored
hap-nodejs, though `publishExternal` does not. Each camera would need its own
HAP endpoint, port, username and pincode, with persistence for each, and the
user would pair every camera separately in the Home app. That is how Homebridge
handles cameras, and it would be a significant divergence from upstream
HomeKitty's single-bridge architecture.

### What is nonetheless proven

Everything up to the HomeKit boundary works: device matching, controller
attachment, image resolution, on-demand fetching, the placeholder fallback,
and the Flow-driven refresh (verified — a Flow run changed the published bytes
within 12 seconds, and the resulting images are real photographs).
