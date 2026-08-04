'use strict';

const assert       = require('node:assert');
const DeviceMapper = require('../../lib/device-mapper');

describe('DeviceMapper image base url', () => {
  it('round-trips the base url', () => {
    DeviceMapper.setImageBaseUrl('https://192-168-110-43.homey.homeylocal.com');
    assert.strictEqual(DeviceMapper.getImageBaseUrl(), 'https://192-168-110-43.homey.homeylocal.com');
  });

  it('strips a trailing slash so paths concatenate cleanly', () => {
    DeviceMapper.setImageBaseUrl('https://homey.local/');
    assert.strictEqual(DeviceMapper.getImageBaseUrl(), 'https://homey.local');
  });

  it('defaults to null before it is set', () => {
    DeviceMapper.setImageBaseUrl(null);
    assert.strictEqual(DeviceMapper.getImageBaseUrl(), null);
  });
});
