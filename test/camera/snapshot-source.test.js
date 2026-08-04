'use strict';

const assert = require('node:assert');
const { SnapshotSource, findSnapshotImage } = require('../../lib/camera/snapshot-source');

// Minimal stand-in for a fetch Response carrying JPEG bytes.
function okResponse(bytes) {
  const view = Uint8Array.from(bytes);
  return { ok : true, status : 200, arrayBuffer : async () => view.buffer };
}

function failResponse(status) {
  return { ok : false, status, arrayBuffer : async () => new ArrayBuffer(0) };
}

describe('findSnapshotImage', () => {
  it('prefers the Snapshot image over the shared Event image', () => {
    // The Eufy app registers one Event image per HomeBase that several
    // cameras share; picking it would show the same picture everywhere.
    const device = { images : [
      { id : 'T8030P23224525E4',        title : 'Uterummet - Event',    imageObj : { id : 'evt', url : '/api/image/evt' } },
      { id : 'T8210P8123222311-Snapshot', title : 'Uterummet - Snapshot', imageObj : { id : 'snp', url : '/api/image/snp' } },
    ] };
    assert.strictEqual(findSnapshotImage(device).imageObj.id, 'snp');
  });

  it('returns null when the device has no images', () => {
    assert.strictEqual(findSnapshotImage({ images : [] }), null);
    assert.strictEqual(findSnapshotImage({}), null);
  });
});

describe('SnapshotSource', () => {
  it('returns the fetched bytes as a Buffer', async () => {
    const source = new SnapshotSource({
      url       : 'http://homey/api/image/snp',
      fetchImpl : async () => okResponse([ 0xff, 0xd8, 0x01 ]),
    });
    const buf = await source.get();
    assert.ok(Buffer.isBuffer(buf));
    assert.deepStrictEqual([ ...buf ], [ 0xff, 0xd8, 0x01 ]);
  });

  it('serves from cache inside the TTL', async () => {
    let calls = 0;
    let clock = 1000;
    const source = new SnapshotSource({
      url       : 'http://homey/api/image/snp',
      ttlMs     : 2000,
      now       : () => clock,
      fetchImpl : async () => (calls++, okResponse([ 0xff, 0xd8, calls ])),
    });

    await source.get();
    clock = 2500;             // still inside the 2000ms TTL window
    await source.get();
    assert.strictEqual(calls, 1);
  });

  it('refetches once the TTL has expired', async () => {
    let calls = 0;
    let clock = 1000;
    const source = new SnapshotSource({
      url       : 'http://homey/api/image/snp',
      ttlMs     : 2000,
      now       : () => clock,
      fetchImpl : async () => (calls++, okResponse([ 0xff, 0xd8, calls ])),
    });

    await source.get();
    clock = 4000;             // past the TTL
    await source.get();
    assert.strictEqual(calls, 2);
  });

  it('collapses concurrent requests into one fetch', async () => {
    // Opening the Home app asks every camera for a snapshot at once.
    let calls = 0;
    const source = new SnapshotSource({
      url       : 'http://homey/api/image/snp',
      fetchImpl : async () => {
        calls++;
        await new Promise(r => setTimeout(r, 10));
        return okResponse([ 0xff, 0xd8 ]);
      },
    });

    await Promise.all([ source.get(), source.get(), source.get() ]);
    assert.strictEqual(calls, 1);
  });

  it('throws on a non-ok response', async () => {
    const source = new SnapshotSource({
      url       : 'http://homey/api/image/snp',
      fetchImpl : async () => failResponse(404),
    });
    await assert.rejects(() => source.get(), /HTTP 404/);
  });

  it('recovers after a failure instead of caching the error', async () => {
    let calls = 0;
    const source = new SnapshotSource({
      url       : 'http://homey/api/image/snp',
      fetchImpl : async () => (++calls === 1 ? failResponse(500) : okResponse([ 0xff, 0xd8 ])),
    });
    await assert.rejects(() => source.get());
    const buf = await source.get();
    assert.deepStrictEqual([ ...buf ], [ 0xff, 0xd8 ]);
  });
});
