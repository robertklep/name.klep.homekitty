'use strict';

const assert = require('node:assert');
const { credentialsFor, PORT_MIN, PORT_MAX } = require('../../lib/camera/standalone');

describe('credentialsFor', () => {
  it('derives a well-formed HAP username', () => {
    const { username } = credentialsFor('609e9dd6-68c9-4be9-926d-67ef41ab42fc');
    assert.match(username, /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/);
  });

  it('is stable for the same device id', () => {
    // A camera that changes username loses its HomeKit pairing, so this must
    // survive restarts and reinstalls.
    const a = credentialsFor('device-a');
    const b = credentialsFor('device-a');
    assert.deepStrictEqual(a, b);
  });

  it('gives different devices different credentials', () => {
    const a = credentialsFor('device-a');
    const b = credentialsFor('device-b');
    assert.notStrictEqual(a.username, b.username);
  });

  it('sets the locally-administered bit and clears multicast', () => {
    // A multicast or globally-unique MAC would be invalid for a HAP accessory.
    for (const id of [ 'a', 'b', 'c', 'doorbell', '609e9dd6' ]) {
      const first = parseInt(credentialsFor(id).username.slice(0, 2), 16);
      assert.strictEqual(first & 0x01, 0, `multicast bit set for ${ id }`);
      assert.strictEqual(first & 0x02, 2, `local bit unset for ${ id }`);
    }
  });

  it('picks a port inside the expected range', () => {
    for (const id of [ 'a', 'b', 'c', 'd', 'e', 'f' ]) {
      const { port } = credentialsFor(id);
      assert.ok(port >= PORT_MIN && port <= PORT_MAX, `${ port } out of range for ${ id }`);
      assert.strictEqual(port, Math.floor(port), 'port must be an integer');
    }
  });
});
