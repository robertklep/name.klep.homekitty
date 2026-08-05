'use strict';

const assert = require('node:assert');
const { streamArgs } = require('../../lib/camera/rtsp-stream-source');

// A start request as HomeKit actually sends one. It carries the negotiated
// encoding and nothing else: no destination port, no SRTP keys. Those were
// settled during prepare. Test harnesses that build a start request by copying
// the prepare request supply fields iOS never sends, and hide this entirely.
const startRequest = {
  sessionID : 'abc',
  type      : 'start',
  video     : { width : 1280, height : 720, fps : 30, max_bit_rate : 299, pt : 99 },
};

const session = {
  targetAddress : '192.168.1.50',
  video : {
    port      : 51234,
    ssrc      : 7,
    srtp_key  : Buffer.alloc(16, 1),
    srtp_salt : Buffer.alloc(14, 2),
  },
};

describe('streamArgs', () => {
  it('sends to the port negotiated during prepare, not one off the start request', () => {
    const args = streamArgs({ url : 'rtsp://cam/live', session, request : startRequest });
    const target = args[args.length - 1];
    assert.ok(target.includes(':51234'), `expected the prepared port in ${ target }`);
    assert.ok(! target.includes('undefined'), `target must be addressable: ${ target }`);
  });

  it('encrypts with the keys from prepare', () => {
    const args = streamArgs({ url : 'rtsp://cam/live', session, request : startRequest });
    const params = args[args.indexOf('-srtp_out_params') + 1];
    // 16-byte key + 14-byte salt, base64 encoded.
    assert.strictEqual(Buffer.from(params, 'base64').length, 30);
  });

  it('honours the negotiated resolution, framerate and bitrate', () => {
    const args = streamArgs({ url : 'rtsp://cam/live', session, request : startRequest });
    assert.ok(args.includes('scale=1280:720'));
    assert.strictEqual(args[args.indexOf('-r') + 1], '30');
    assert.strictEqual(args[args.indexOf('-b:v') + 1], '299k');
  });

  it('uses the ssrc generated for the session', () => {
    const args = streamArgs({ url : 'rtsp://cam/live', session, request : startRequest });
    assert.strictEqual(args[args.indexOf('-ssrc') + 1], '7');
  });
});
