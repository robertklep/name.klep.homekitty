'use strict';

const assert = require('node:assert');
const DeviceMapper = require('../../lib/device-mapper');

function eufyDoorbell() {
  return {
    id           : 'test-doorbell',
    name         : 'Dörrklockan',
    class        : 'doorbell',
    capabilities : [ 'onoff', 'NTFY_PRESS_DOORBELL', 'NTFY_MOTION_DETECTION', 'measure_battery' ],
    ui           : { components : [
      { id : 'toggle',  capabilities : [ 'onoff' ] },
      { id : 'sensor',  capabilities : [ 'NTFY_MOTION_DETECTION', 'NTFY_PRESS_DOORBELL' ] },
      { id : 'battery', capabilities : [ 'measure_battery' ] },
    ] },
    images : [ { id : 'd-Snapshot', title : 'Dörrklockan - Snapshot', imageObj : { id : 'snp', url : '/api/image/snp' } } ],
  };
}

describe('eufy doorbell map', () => {
  it('still maps the doorbell', () => {
    assert.ok(DeviceMapper.mapDevice(eufyDoorbell()));
  });

  it('stays a doorbell and keeps the VIDEO_DOORBELL category', () => {
    // VIDEO_DOORBELL is what makes iOS show a doorbell notification with a
    // picture instead of a plain alert, so it must survive the change.
    const { Service, Characteristic, Accessory } = require('../../modules/hap-nodejs');
    const map = require('../../lib/maps/doorbell-eufy')(DeviceMapper, Service, Characteristic, Accessory);
    // The battery doorbell registers no video, and a camera that cannot
    // stream is reported unreachable by HomeKit -- so it stays a doorbell.
    assert.strictEqual(map.camera, undefined, 'doorbell must not claim to be a camera');
    assert.strictEqual(map.category, Accessory.Categories.VIDEO_DOORBELL);
  });
});
