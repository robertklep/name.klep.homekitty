const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const { Accessory, Service, Characteristic } = require('../modules/hap-nodejs');
const { MappedDevice } = require('../lib/mapped-device');

// A Homey device can *reject* a capability write (its capability listener
// throws) — for example a garage door that refuses to open while nobody is
// home. These tests exercise what MappedDevice does with such rejections:
// the set request must fail so the controller keeps showing the actual
// state, and the refused value must not end up in the internal capability
// cache.

const settle = ms => new Promise(resolve => setTimeout(resolve, ms));

function createMappedGarageDoor({ setCapabilityValue } = {}) {
  const device = {
    id: 'test-garage-door',
    class: 'garagedoor',
    name: 'Test Garage Door',
    driverId: 'homey:app:test.app',
    capabilities: [ 'garagedoor_closed' ],
    capabilitiesObj: { garagedoor_closed: { value: true } }, // the door is closed
    ui: { components: [ { capabilities: [ 'garagedoor_closed' ] } ] },
    setCapabilityValue,
    makeCapabilityInstance() {
      return { destroy() {} };
    },
  };

  const mapper = { Constants: { NO_VALUE: Symbol('NO_VALUE') } };

  // the relevant subset of lib/maps/garagedoor.js, with the DoorState
  // accessor from lib/mapper-accessors.js inlined
  const map = {
    name: 'garagedoor-test',
    service: Service.GarageDoorOpener,
    required: {
      garagedoor_closed: {
        characteristics: [ Characteristic.TargetDoorState, Characteristic.CurrentDoorState ],
        get: value => Characteristic.CurrentDoorState[ value ? 'CLOSED' : 'OPEN' ],
        set: value => value === Characteristic.TargetDoorState.CLOSED,
      },
    },
  };

  const mapped = new MappedDevice(mapper, device, map, () => {});
  const service = mapped.accessorize().getService(Service.GarageDoorOpener);

  const target  = service.getCharacteristic(Characteristic.TargetDoorState);
  const current = service.getCharacteristic(Characteristic.CurrentDoorState);

  // sync the characteristics with the device state, like the capability
  // instance listener would have after the first realtime event
  target.updateValue(Characteristic.TargetDoorState.CLOSED);
  current.updateValue(Characteristic.CurrentDoorState.CLOSED);

  return { device, target, current };
}

const refuse = async () => { throw new Error('Opening is blocked because nobody is home.'); };

describe('MappedDevice — rejected capability writes', () => {
  test('a rejected write fails the set request instead of being swallowed', async () => {
    const { target } = createMappedGarageDoor({ setCapabilityValue: refuse });

    await assert.rejects(
      target.handleSetRequest(Characteristic.TargetDoorState.OPEN),
      'HAP must be told the write failed, so the controller reverts to the actual state',
    );
  });

  test('a rejected write does not poison the capability cache', async () => {
    const { device, target } = createMappedGarageDoor({ setCapabilityValue: refuse });

    await target.handleSetRequest(Characteristic.TargetDoorState.OPEN).catch(() => {});
    await settle(25);

    assert.equal(
      device.capabilitiesObj.garagedoor_closed.value, true,
      'the cached capability value must still be the actual one after a rejected write',
    );
  });

  test('a read after a rejected write serves the actual state, not the refused target', async () => {
    const { target } = createMappedGarageDoor({ setCapabilityValue: refuse });

    await target.handleSetRequest(Characteristic.TargetDoorState.OPEN).catch(() => {});
    await settle(25);

    assert.equal(
      await target.handleGetRequest(), Characteristic.TargetDoorState.CLOSED,
      'HomeKit must read the door as closed — it never moved',
    );
  });

  test('the characteristics keep the actual state after a rejected write', async () => {
    const { target, current } = createMappedGarageDoor({ setCapabilityValue: refuse });

    await target.handleSetRequest(Characteristic.TargetDoorState.OPEN).catch(() => {});
    await settle(25);

    assert.equal(target.value, Characteristic.TargetDoorState.CLOSED, 'TargetDoorState must not keep the refused target');
    assert.equal(current.value, Characteristic.CurrentDoorState.CLOSED, 'CurrentDoorState must show the actual state');
  });

  test('a successful write updates the capability cache', async () => {
    let written = null;
    const { device, target } = createMappedGarageDoor({
      setCapabilityValue : async (capability, value) => { written = { capability, value }; },
    });

    await target.handleSetRequest(Characteristic.TargetDoorState.OPEN);
    await settle(25);

    assert.deepEqual(written, { capability : 'garagedoor_closed', value : false });
    assert.equal(device.capabilitiesObj.garagedoor_closed.value, false);
  });
});
