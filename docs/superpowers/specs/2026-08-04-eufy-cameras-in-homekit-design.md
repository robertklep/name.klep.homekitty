# Exposing Eufy cameras to HomeKit via HomeKitty

**Date:** 2026-08-04
**Status:** Approved, pending spike result
**Branch:** `eufy-camera` (off `upstream/main`)

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
| `lib/camera/snapshot-queue.js` | Global mutex serializing snapshot requests |
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

### Refreshing the cache (asynchronous, event-driven)

```
CapabilityObserver: NTFY_MOTION_DETECTION | NTFY_PRESS_DOORBELL → true
   └─▶ SnapshotQueue.enqueue(deviceId)          // global mutex
         └─▶ runFlowCardAction('action_CMD_SNAPSHOT', { device })
               └─▶ await image lastUpdated change
                     └─▶ fetch bytes via ManagerImages
                           └─▶ SnapshotSource cache updated
```

Refreshing on motion rather than on request means the image is current
exactly when it matters, at zero idle battery cost. The queue is a
correctness requirement, not an optimisation — see the serialization
constraint above.

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

## Open risk

**Can HomeKitty, holding only the `homey:manager:api` permission, read image
bytes owned by another app?**

Confirmed so far: `GET /image` lists the Eufy images with
`ownerUri: homey:app:com.eufylife.security` and a `url` of
`/api/image/<id>`, so they are enumerable cross-app. Not yet confirmed: that
fetching those bytes from inside HomeKitty succeeds, and how to map an image
id to its owning device.

Everything else in this design depends on that answer, so the first
implementation step is a spike that runs HomeKitty on the Homey via
`homey app run` and fetches one JPEG from Dörrklockan.

Fallbacks if the spike fails:

1. Use the Eufy app's `action_CMD_SNAPSHOT_CUSTOM` ("use self-hosted
   service") to push snapshots to an endpoint HomeKitty serves.
2. Patch a fork of `com.eufylife.security` to expose snapshots in a way
   HomeKitty can consume — and, while there, wire up the dormant mediamtx,
   which would also unlock live video.
