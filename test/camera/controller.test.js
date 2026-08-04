'use strict';

const assert = require('node:assert');
const { SnapshotOnlyDelegate, createCameraController } = require('../../lib/camera/controller');

const PLACEHOLDER = Buffer.from([ 0xff, 0xd8, 0xaa ]);

describe('SnapshotOnlyDelegate', () => {
  it('hands HomeKit the snapshot bytes', done => {
    const delegate = new SnapshotOnlyDelegate({
      snapshotSource : { get : async () => Buffer.from([ 0xff, 0xd8, 0x01 ]) },
      placeholder    : PLACEHOLDER,
    });
    delegate.handleSnapshotRequest({}, (err, buf) => {
      assert.strictEqual(err, undefined);
      assert.deepStrictEqual([ ...buf ], [ 0xff, 0xd8, 0x01 ]);
      done();
    });
  });

  it('falls back to the placeholder when fetching fails', done => {
    // Must not surface the error: HomeKit marks the accessory unresponsive.
    const delegate = new SnapshotOnlyDelegate({
      snapshotSource : { get : async () => { throw Error('boom'); } },
      placeholder    : PLACEHOLDER,
    });
    delegate.handleSnapshotRequest({}, (err, buf) => {
      assert.strictEqual(err, undefined);
      assert.deepStrictEqual([ ...buf ], [ ...PLACEHOLDER ]);
      done();
    });
  });

  it('reports streaming as unsupported', done => {
    const delegate = new SnapshotOnlyDelegate({
      snapshotSource : { get : async () => PLACEHOLDER },
      placeholder    : PLACEHOLDER,
    });
    delegate.prepareStream({}, err => {
      assert.ok(err instanceof Error);
      done();
    });
  });
});

describe('createCameraController', () => {
  it('builds a controller and back-links it to the delegate', () => {
    const controller = createCameraController({
      snapshotSource : { get : async () => PLACEHOLDER },
      placeholder    : PLACEHOLDER,
    });
    assert.ok(controller);
    // hap-nodejs requires the delegate to expose its controller.
    assert.strictEqual(controller.delegate.controller, controller);
  });
});
