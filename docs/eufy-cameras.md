# Eufy cameras in HomeKit

HomeKitty shows your Eufy cameras and video doorbell in the Home app as
camera accessories displaying a still image, plus working motion sensors,
doorbell chime, battery level and floodlight switch.

## Live video is not available

The Homey Eufy app does not publish a video stream — it produces single JPEG
snapshots. Tapping a camera for live video will fail. This is a limitation of
the Eufy app, not of HomeKitty.

## A brand new camera shows "PLACEHOLDER IMAGE"

Until a camera has had its first snapshot taken, the Homey Eufy app publishes
its own stand-in image: a black picture with the eufy logo and the words
"PLACEHOLDER IMAGE". HomeKitty will faithfully show you that, because it is
genuinely what Homey holds for the camera.

This is not a fault. It means no snapshot has been taken yet.

**After setting up your Flows, run each one once by hand** (Homey app → Flows →
open the Flow → Test). That seeds a real picture for every camera. Otherwise a
camera whose trigger has not fired — a doorbell nobody has pressed, say — keeps
showing the eufy placeholder indefinitely.

Run them one at a time. The Eufy app can only take one snapshot at a time, so
firing several at once makes them cancel each other.

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
