'use strict';

const assert = require('node:assert');
const { findVideo, hasVideo, getStreamUrl, redact } = require('../../lib/camera/video-source');

const CAMERA = {
  videos : [ {
    type : 'camera', id : 'main', title : 'Live',
    videoObj : { id : '3b134060-e2ec-4a7a-bc0c-6340ed461fee', type : 'rtsp' },
  } ],
};

// A battery doorbell registers no stream at all.
const DOORBELL = { videos : [] };

describe('findVideo', () => {
  it('finds the live camera stream', () => {
    assert.strictEqual(findVideo(CAMERA).videoObj.id, '3b134060-e2ec-4a7a-bc0c-6340ed461fee');
  });

  it('returns null for a device with no streams', () => {
    assert.strictEqual(findVideo(DOORBELL), null);
    assert.strictEqual(findVideo({}), null);
  });

  it('returns null when the entry carries no videoObj id', () => {
    assert.strictEqual(findVideo({ videos : [ { type : 'camera' } ] }), null);
  });
});

describe('hasVideo', () => {
  it('distinguishes streamable devices from the rest', () => {
    // This gates whether a device may be exposed as a HomeKit camera at all.
    assert.strictEqual(hasVideo(CAMERA), true);
    assert.strictEqual(hasVideo(DOORBELL), false);
  });
});

describe('getStreamUrl', () => {
  it('resolves the url through the videos manager', async () => {
    const api = { videos : { getVideoUrl : async ({ id }) => ({ url : `rtsp://u:p@10.0.0.1/${ id }` }) } };
    const url = await getStreamUrl(api, CAMERA);
    assert.ok(url.startsWith('rtsp://'));
    assert.ok(url.endsWith('3b134060-e2ec-4a7a-bc0c-6340ed461fee'));
  });

  it('accepts a bare string result too', async () => {
    const api = { videos : { getVideoUrl : async () => 'rtsp://u:p@10.0.0.1/live4' } };
    assert.strictEqual(await getStreamUrl(api, CAMERA), 'rtsp://u:p@10.0.0.1/live4');
  });

  it('returns null without calling the api when there is no stream', async () => {
    let called = false;
    const api = { videos : { getVideoUrl : async () => (called = true, 'x') } };
    assert.strictEqual(await getStreamUrl(api, DOORBELL), null);
    assert.strictEqual(called, false);
  });
});

describe('redact', () => {
  it('hides credentials so urls can be logged', () => {
    assert.strictEqual(
      redact('rtsp://Nb3QtkWDqJN1wKfb:Ke5vA5ks3KNQcQgf@192.168.110.174/live1'),
      'rtsp://***:***@192.168.110.174/live1',
    );
  });

  it('leaves a credential-free url alone', () => {
    assert.strictEqual(redact('rtsp://192.168.110.174/live1'), 'rtsp://192.168.110.174/live1');
  });
});
