'use strict';

const assert = require('node:assert');
const DeviceMapper = require('../../lib/device-mapper');

// Shape mirrors what the Homey Web API returns; `ui.components` is what the
// mapper actually reads capabilities from, not `capabilities`.
function eufyCamera(overrides = {}) {
  return Object.assign({
    id           : 'test-camera',
    name         : 'Trädgården',
    class        : 'camera',
    capabilities : [ 'onoff', 'alarm_motion', 'NTFY_MOTION_DETECTION', 'measure_battery' ],
    ui           : { components : [
      { id : 'toggle',  capabilities : [ 'onoff' ] },
      { id : 'sensor',  capabilities : [ 'alarm_motion', 'NTFY_MOTION_DETECTION' ] },
      { id : 'battery', capabilities : [ 'measure_battery' ] },
    ] },
    images : [ { id : 'x-Snapshot', title : 'Trädgården - Snapshot', imageObj : { id : 'snp', url : '/api/image/snp' } } ],
  }, overrides);
}

// NOTE: `mapDevice` caches by device id and upstream exposes no reset hook
// (only `forgetDevice`), so every test below uses a distinct id.
describe('eufy camera map', () => {
  it('maps a Eufy camera', () => {
    const mapped = DeviceMapper.mapDevice(eufyCamera());
    assert.ok(mapped, 'camera should be mappable');
  });

  it('keeps the CAMERA category but stays bridged for now', () => {
    const { Service, Characteristic, Accessory } = require('../../modules/hap-nodejs');
    const map = require('../../lib/maps/camera-eufy')(DeviceMapper, Service, Characteristic, Accessory);
    // camera:true is intentionally absent for now: a camera needs its own HAP
    // endpoint and its own pairing, and only the doorbell does that yet.
    assert.strictEqual(map.camera, undefined, 'these cameras stay bridged for now');
    assert.strictEqual(map.category, Accessory.Categories.CAMERA);
    assert.ok('NTFY_MOTION_DETECTION' in map.required);
  });

  it('does not map a camera without motion capabilities', () => {
    const bare = eufyCamera({
      id : 'test-camera-3',
      ui : { components : [ { id : 'toggle', capabilities : [ 'onoff' ] } ] },
    });
    assert.strictEqual(DeviceMapper.mapDevice(bare), null);
  });

  it('does not route pet or vehicle detection to MotionDetected', () => {
    const { Service, Characteristic, Accessory } = require('../../modules/hap-nodejs');
    const map = require('../../lib/maps/camera-eufy')(DeviceMapper, Service, Characteristic, Accessory);
    assert.ok(!('NTFY_PET_DETECTED' in map.required), 'NTFY_PET_DETECTED must not be in required');
    assert.ok(!('NTFY_PET_DETECTED' in map.optional), 'NTFY_PET_DETECTED must not be in optional');
    assert.ok(!('NTFY_VEHICLE_DETECTED' in map.required), 'NTFY_VEHICLE_DETECTED must not be in required');
    assert.ok(!('NTFY_VEHICLE_DETECTED' in map.optional), 'NTFY_VEHICLE_DETECTED must not be in optional');
  });
});
