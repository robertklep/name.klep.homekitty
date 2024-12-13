const { Accessory, Service, Characteristic, AccessoryEventTypes, uuid } = require('../modules/hap-nodejs');

module.exports = Mapper => {
  Mapper.Accessors = {
    Identity : {
      get : value => value,
      set : value => value,
    },
    Boolean : {
      get : value => !!value,
      set : value => !!value,
    },
    OnOff : {
      get : value => !!value,
      set : value => !!value,
    },
    Active : {
      get : value => Characteristic.Active[ value ? 'ACTIVE' : 'INACTIVE' ],
      set : value => value === Characteristic.Active.ACTIVE
    },
    Temperature : {
      get : value => value,
      set : value => value,
    },
    RelativeHumidity : {
      get : value => value,
      set : value => value,
    },
    Mute : {
      get : value => !!value,
      set : value => !!value,
    },
    Volume : {
      get : value => value * 100,
      set : value => value / 100,
    },
    RotationSpeed : {
      get : value => value * 100,
      set : value => value / 100,
    },
    DoorState : {
      get : value => Characteristic.CurrentDoorState[ value ? 'CLOSED' : 'OPEN'],
      set : value => value === Characteristic.TargetDoorState.CLOSED,
    },
    LockState : {
      get : value => Characteristic.LockCurrentState[ value ? 'SECURED' : 'UNSECURED' ],
      set : value => value === Characteristic.LockTargetState.SECURED,
    },
    MediaState : {
      get : value => Characteristic.CurrentMediaState[ value ? 'PLAY' : 'PAUSE' ],
      set : value => value === Characteristic.TargetMediaState.PLAY,
    },
    LeakDetected : {
      get : value => Characteristic.LeakDetected[ value ? 'LEAK_DETECTED' : 'LEAK_NOT_DETECTED' ],
      set : value => value === Characteristic.LeakDetected.LEAK_DETECTED,
    },
    ContactSensorState : {
      get : value => Characteristic.ContactSensorState[ value ? 'CONTACT_NOT_DETECTED' : 'CONTACT_DETECTED' ],
      set : value => value === Characteristic.ContactSensorState.CONTACT_DETECTED,
    },
    SmokeDetected : {
      get : value => Characteristic.SmokeDetected[ value ? 'SMOKE_DETECTED' : 'SMOKE_NOT_DETECTED' ],
      set : value => value === Characteristic.SmokeDetected.SMOKE_DETECTED,
    },
    Brightness : {
      get : value => value * 100,
      set : value => value / 100,
    },
    Hue : {
      get : value => value * 360,
      set : value => value / 360,
    },
    Saturation : {
      get : value => value * 100,
      set : value => value / 100,
    },
    ColorTemperature : {
      get : value => Mapper.Utils.mapValue(value, 0, 1, 140, 500),
      set : async (value, { device }) => {
        // make sure the device is set to the correct light mode
        const currentMode = device.capabilitiesObj?.light_mode?.value;
        if (currentMode && currentMode !== 'temperature') {
          await device.setCapabilityValue('light_mode', 'temperature').catch(() => {});
        }
        return Mapper.Utils.mapValue(value, 140, 500, 0, 1);
      }
    },
    Position : {
      get : value => value * 100,
      set : value => value / 100,
    },
    PositionState : {
      get : value => Characteristic.PositionState[ value === 'up' ? 'INCREASING' : value === 'down' ? 'DECREASING' : 'STOPPED' ],
      set : value => (
        {
          [ Characteristic.PositionState.INCREASING ] : 'up',
          [ Characteristic.PositionState.DECREASING ] : 'down',
        }[value] || 'idle'
      )
    },
    ProgrammableSwitchEvent : {
      SinglePress : {
        get : () => Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS,
        set : () => true,
      },
      DoublePress : {
        get : () => Characteristic.ProgrammableSwitchEvent.DOUBLE_PRESS,
        set : () => true,
      },
      LongPress : {
        get : () => Characteristic.ProgrammableSwitchEvent.LONG_PRESS,
        set : () => true,
      },
    },
    HeatingCoolingState : {
      Current : {
        // Not quite the correct mapping: Homey supports `auto` mode, HomeKit doesn't. We'll default to `HEAT` when `auto` is set.
        get : value => Characteristic.CurrentHeatingCoolingState[ value === 'off' ? 'OFF' : value === 'cool' ? 'COOL' : 'HEAT' ]
      },
      Target : {
        get : value => Characteristic.TargetHeatingCoolingState[ value.toUpperCase() ],
        set : value => [ 'off', 'heat', 'cool', 'auto' ][value],
      }
    },
    TiltAngle: {
      get : value => value * 180 - 90,
      set : value => (value + 90) / 180,
    }
  };
};
