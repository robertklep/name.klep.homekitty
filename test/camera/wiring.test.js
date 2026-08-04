'use strict';

const assert       = require('node:assert');
const DeviceMapper = require('../../lib/device-mapper');

describe('DeviceMapper video resolver', () => {
  it('round-trips the resolver', () => {
    const resolver = async () => 'rtsp://example/live';
    DeviceMapper.setVideoResolver(resolver);
    assert.strictEqual(DeviceMapper.getVideoResolver(), resolver);
  });

  it('defaults to null, which disables cameras rather than half-configuring them', () => {
    DeviceMapper.setVideoResolver(null);
    assert.strictEqual(DeviceMapper.getVideoResolver(), null);
  });
});
