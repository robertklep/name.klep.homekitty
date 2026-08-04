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
async function getStreamUrl(api, device) {
  const video = findVideo(device);
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
