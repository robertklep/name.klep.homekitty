'use strict';

const assert = require('node:assert');
const { localAddress } = require('../../lib/camera/rtsp-stream-source');

describe('localAddress', () => {
  it('returns a usable IPv4 address', () => {
    assert.match(localAddress('IPv4'), /^\d+\.\d+\.\d+\.\d+$/);
  });

  it('prefers the interface sharing a subnet with the controller', () => {
    // A Homey has several interfaces. Advertising one the iOS device cannot
    // reach makes live view retry forever while packets go elsewhere.
    const os = require('node:os');
    const real = os.networkInterfaces;
    os.networkInterfaces = () => ({
      docker0 : [ { family : 'IPv4', internal : false, address : '172.17.0.1', cidr : '172.17.0.1/16' } ],
      wlan0   : [ { family : 'IPv4', internal : false, address : '192.168.110.43', cidr : '192.168.110.43/24' } ],
    });
    try {
      assert.strictEqual(localAddress('IPv4', '192.168.110.50'), '192.168.110.43');
      assert.strictEqual(localAddress('IPv4', '172.17.0.9'), '172.17.0.1');
    } finally {
      os.networkInterfaces = real;
    }
  });

  it('falls back to the first candidate when nothing matches', () => {
    const os = require('node:os');
    const real = os.networkInterfaces;
    os.networkInterfaces = () => ({
      eth0 : [ { family : 'IPv4', internal : false, address : '10.0.0.5', cidr : '10.0.0.5/24' } ],
    });
    try {
      assert.strictEqual(localAddress('IPv4', '192.168.1.2'), '10.0.0.5');
    } finally {
      os.networkInterfaces = real;
    }
  });
});
