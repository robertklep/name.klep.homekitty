'use strict';

// Homey has a videos manager alongside its images manager. Apps register live
// streams with it; the Eufy app registers one RTSP stream per camera, pointing
// at the camera's own endpoint on the LAN. A device links to its stream the
// same way it links to an image:
//
//   device.videos[] = { type: 'camera', id: 'main', title: 'Live',
//                       videoObj: { id, ownerUri, type: 'rtsp' } }
//
// The URL is fetched separately and deliberately not cached: it carries
// credentials, and the owning app may rotate it.

// Not every Eufy device has a stream. Battery doorbells in particular register
// none, which matters because HomeKit has no snapshot-only camera -- a device
// without a stream cannot be exposed as a camera at all.
function findVideo(device) {
  const videos = (device && device.videos) || [];
  if (! videos.length) return null;
  const live = videos.find(video => video.type === 'camera') || videos[0];
  return (live && live.videoObj && live.videoObj.id) ? live : null;
}

function hasVideo(device) {
  return !! findVideo(device);
}

// Returns the RTSP url for a device, or null if it has no stream.
//
// The device object here was captured when HomeKitty mapped its devices at
// startup. The owning app registers its videos when *it* starts, so whichever
// app boots second wins: restart the Eufy app and every camera HomeKitty holds
// still describes a device with no videos at all, and streaming fails without
// ever asking for a url. So a device that appears to have no stream is looked
// up again before believing it.
async function getStreamUrl(api, device) {
  let video = findVideo(device);

  if (! video && device && device.id && api.devices && api.devices.getDevice) {
    const fresh = await api.devices.getDevice({ id : device.id }).catch(() => null);
    video = findVideo(fresh);
    // Keep the newly discovered stream on the object the caller holds, so the
    // next request does not pay for the lookup again.
    if (video && device.videos !== fresh.videos) device.videos = fresh.videos;
  }
  if (! video) return null;

  const result = await api.videos.getVideoUrl({ id : video.videoObj.id });
  const url    = typeof result === 'string' ? result : (result && result.url);
  return url || null;
}

// Strips credentials so a url can be logged safely.
function redact(url) {
  return String(url || '').replace(/\/\/[^@/]+@/, '//***:***@');
}

module.exports = { findVideo, hasVideo, getStreamUrl, redact };
