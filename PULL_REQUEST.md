# Expose Homey cameras to HomeKit

## What this adds

Cameras from Homey — Eufy cameras and doorbells to begin with — appear in the
Apple Home app with a live picture, live video on tap, and motion
notifications.

## Why it is built this way

**Cameras cannot be bridged.** HomeKit does not allow a camera behind a bridge
accessory; the Home app will not show it. Each camera therefore has to be its
own HAP endpoint, published separately and paired individually. That is the
single fact that shapes the whole design, and it is why this cannot simply be
another entry in the map table.

So each camera gets:

- its own `Accessory`, published on its own port with its own pairing
- a username derived deterministically from the Homey device id (SHA-256), so
  a restart does not invalidate an existing pairing
- a port in a fixed range, likewise derived, for the same reason

The bridge itself is untouched. Non-camera devices behave exactly as before.

## The picture is assembled from layers

Eufy serves a camera's RTSP intermittently — a stream that answers one minute
404s four minutes later — while HomeKit asks for a snapshot every few seconds
and expects an answer every time. A single source is not good enough, so a
picture is taken from whatever is actually available, most-live first:

1. a frame pulled straight from RTSP
2. the JPEG the owning app publishes to Homey
3. the last frame that was successfully obtained

Only when all three fail does a placeholder appear, which then honestly means
"this camera has never produced a picture" rather than "something is broken".

A source that just failed is put on a cooldown. Without that, a camera whose
RTSP is down spawns an ffmpeg process every few seconds — enough load on a
Homey to make snapshots miss HomeKit's window, which looks to the user like
pictures randomly coming and going.

## Four things that are not obvious

Each of these produced a confident-looking failure with a misleading symptom.
They are documented in the code, but they are worth calling out for review.

**An accessory must declare audio even if it has none.** A camera that
advertises no audio codecs is rejected outright by iOS — the accessory shows
"No Response" and never recovers. Declaring AAC-ELD (and therefore carrying a
Microphone service) is what makes snapshots work at all. This is why
"snapshot-only camera" appears impossible at first: it isn't, but silence has
to be declared rather than omitted.

**`new Accessory(name, uuid, category)` silently ignores the third argument.**
The category has to be assigned as a property afterwards. Passing it to the
constructor leaves every camera registered as the wrong accessory type, so the
Home app shows it as a generic accessory. This is arguably a hap-nodejs
footgun worth guarding against generally, and it is fixed here by assigning
`accessory.category` explicitly.

**A start request does not carry the destination.** `prepare` settles where to
send SRTP and which keys to use; `start` carries only the negotiated encoding —
resolution, framerate, bitrate, payload type. Reading the port or the SRTP keys
off the start request yields `undefined`, and the stream goes nowhere. Worth
knowing because a test harness that builds its start request by copying its
prepare request will supply fields iOS never sends, and hide this completely.

**The ffmpeg build matters.** The glibc `ffmpeg-static` binaries download and
install correctly on a Homey and then abort the instant they run:

```
terminate called after throwing an instance of 'std::runtime_error'
  what():  random_device::random_device(const std::string&)
```

The binary never reaches argument parsing, so every stream attempt fails with
no usable error — and because snapshots fall back through the layers above,
nothing appears wrong until you tap live view. This now fetches the Alpine/musl
build from `homebridge/ffmpeg-for-homebridge`, which is statically linked and
runs fine. (The Homey Eufy app ships the identical binary, which is a good
independent signal.)

## Configuration

Cameras are off unless configured, so nothing changes for existing users who do
not opt in. `HomeKit.CameraAccessories` selects which devices are published as
standalone camera accessories; each then has to be paired in the Home app with
the code shown in settings.

## Testing

64 tests covering the snapshot layering and its cooldown, stream argument
construction, address selection, pairing credential derivation, and the device
maps. The stream arguments in particular are tested against a start request
shaped the way HomeKit actually sends one, which is what the third bug above
depends on.

Verified on a Homey Pro 2023 against the Apple Home app with four Eufy cameras
and a battery doorbell: still pictures, live video, and motion.

## Note on the doorbell

A Eufy battery doorbell has no RTSP of its own. It works here because of a
companion change to the Homey Eufy app that republishes its P2P livestream as a
local RTSP URL. Nothing in this PR depends on that — a camera with no stream
still gets the snapshot layers — but that is why the doorbell has live video in
the screenshots.
