'use strict';

const assert = require('node:assert');
const { UnsupportedStreamSource } = require('../../lib/camera/stream-source');
const { getPlaceholder }          = require('../../lib/camera/placeholder');

describe('UnsupportedStreamSource', () => {
  it('calls back with an error from prepare', done => {
    new UnsupportedStreamSource().prepare({}, err => {
      assert.ok(err instanceof Error);
      done();
    });
  });

  it('calls back with an error from handle', done => {
    new UnsupportedStreamSource().handle({}, err => {
      assert.ok(err instanceof Error);
      done();
    });
  });

  it('stop is a no-op that does not throw', () => {
    assert.doesNotThrow(() => new UnsupportedStreamSource().stop('session'));
  });
});

describe('getPlaceholder', () => {
  it('returns valid JPEG bytes', () => {
    const buf = getPlaceholder();
    assert.ok(Buffer.isBuffer(buf));
    assert.strictEqual(buf[0], 0xff);
    assert.strictEqual(buf[1], 0xd8);
  });

  it('returns the same buffer on repeat calls', () => {
    assert.strictEqual(getPlaceholder(), getPlaceholder());
  });
});
