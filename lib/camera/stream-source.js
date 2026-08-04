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
