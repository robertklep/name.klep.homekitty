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
    const diag = require('./_diag2'); // TEMPORARY
    diag.record(`REQ ${ request && request.width }x${ request && request.height }`);
    try {
      const buf = await this.#snapshotSource.get();
      diag.record(`OK ${ buf && buf.length }B`);
      callback(undefined, buf);
    } catch (e) {
      // Never propagate: an error here makes HomeKit mark the accessory
      // unresponsive, which is worse than a stale or placeholder picture.
      require('./_diag2').record(`FAIL ${ e.name }: ${ e.message }`); // TEMPORARY
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
