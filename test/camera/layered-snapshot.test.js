'use strict';

const assert = require('node:assert');
const { LayeredSnapshotSource } = require('../../lib/camera/layered-snapshot');

const jpeg = tag => Buffer.from([ 0xff, 0xd8, tag ]);
const ok   = (name, tag) => ({ name, get : async () => jpeg(tag) });
const fail = (name, message = 'down') => ({ name, get : async () => { throw Error(message); } });

describe('LayeredSnapshotSource', () => {
  it('prefers the most live source', async () => {
    const source = new LayeredSnapshotSource({ sources : [ ok('rtsp', 1), ok('image', 2) ] });
    assert.strictEqual((await source.get())[2], 1);
  });

  it('falls through to the next source when the first fails', async () => {
    // This is the normal case on Eufy: RTSP is usually not being served.
    const source = new LayeredSnapshotSource({ sources : [ fail('rtsp'), ok('image', 2) ] });
    assert.strictEqual((await source.get())[2], 2);
  });

  it('skips a source that returns something which is not a JPEG', async () => {
    const notJpeg = { name : 'bad', get : async () => Buffer.from([ 0x00, 0x01, 0x02 ]) };
    const source  = new LayeredSnapshotSource({ sources : [ notJpeg, ok('image', 3) ] });
    assert.strictEqual((await source.get())[2], 3);
  });

  it('serves the last good frame once every source fails', async () => {
    let live = true;
    const flaky = { name : 'rtsp', get : async () => { if (! live) throw Error('404'); return jpeg(7); } };
    const source = new LayeredSnapshotSource({ sources : [ flaky ], ttlMs : 0 });

    assert.strictEqual((await source.get())[2], 7);
    live = false;
    assert.strictEqual((await source.get())[2], 7, 'should still serve the remembered frame');
  });

  it('gives up on a hanging source and falls through', async () => {
    // Resolving ffmpeg can download ~25MB on first use. Without a deadline that
    // blocks the whole chain past HomeKit's patience, and iOS reports the
    // camera as unresponsive rather than slow.
    const hangs = { name : 'rtsp', get : () => new Promise(() => {}) };
    const source = new LayeredSnapshotSource({
      sources : [ hangs, ok('image', 9) ], deadlineMs : 40, ttlMs : 0,
    });
    assert.strictEqual((await source.get())[2], 9);
  });

  it('does not hang forever when every source hangs', async () => {
    const hangs = { name : 'rtsp', get : () => new Promise(() => {}) };
    const source = new LayeredSnapshotSource({ sources : [ hangs ], deadlineMs : 40, ttlMs : 0 });
    await assert.rejects(() => source.get(), /timed out/);
  });

  it('throws only when nothing has ever worked', async () => {
    const source = new LayeredSnapshotSource({ sources : [ fail('rtsp', '404'), fail('image', '500') ] });
    await assert.rejects(() => source.get(), /404.*500/s);
  });

  it('serves from cache inside the TTL', async () => {
    let calls = 0;
    const counting = { name : 'rtsp', get : async () => (calls++, jpeg(1)) };
    const source = new LayeredSnapshotSource({ sources : [ counting ], ttlMs : 5000, now : () => 1000 });
    await source.get();
    await source.get();
    assert.strictEqual(calls, 1);
  });

  it('collapses concurrent requests', async () => {
    // The Home app polls several cameras at once.
    let calls = 0;
    const slow = { name : 'rtsp', get : async () => { calls++; await new Promise(r => setTimeout(r, 10)); return jpeg(1); } };
    const source = new LayeredSnapshotSource({ sources : [ slow ], ttlMs : 0 });
    await Promise.all([ source.get(), source.get(), source.get() ]);
    assert.strictEqual(calls, 1);
  });
});
