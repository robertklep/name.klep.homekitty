const { Accessory, Service, Characteristic, AccessoryEventTypes, uuid } = require('../modules/hap-nodejs');

class MappedDevice {
  #device;
  #logger;
  #maps      = [];
  #accessory = null;
  #listeners = [];

  constructor(device, map, logger = console.log) {
    this.#device      = device;
    this.#device.name = this.#device.name || `${ Mapper.Utils.upperFirst(device.class) } Device`;
    this.#logger      = logger;
    this.#maps.push(map);
  }

  cleanup() {
    this.#listeners.forEach(listener => listener.destroy());
  }

  addMap(map) {
    this.#maps.push(map);
  }

  createAccessory() {
    // XXX: if UUID generation changes, update `App#getAccessoryById()` as well!
    const accessory = new Accessory(this.#device.name, uuid.generate(this.#device.id));

    accessory.on(AccessoryEventTypes.IDENTIFY, (paired, callback) => {
      this.log('identify');
      // NOOP
      callback();
    });

    accessory
      .getService(Service.AccessoryInformation)
      .setCharacteristic(Characteristic.Manufacturer, String(this.#device.driverUri).replace(/^homey:app:/, ''))
      .setCharacteristic(Characteristic.Model,        `${ this.#device.name } (${ this.#device.zoneName || 'onbekende zone' })`)
      .setCharacteristic(Characteristic.SerialNumber, this.#device.id);

    return accessory;
  }

  updateCapability(capability, value) {
    this.#device.capabilitiesObj ??= { [ capability ] : {} };
    this.#device.capabilitiesObj[capability].value = value;
  }

  groupCapabilities() {
    return this.#device.capabilities.reduce((acc, cap) => {
      const [ capability, group = '' ] = cap.split('.');

      if (! acc[group]) acc[group] = [];
      acc[group].push(capability);
      return acc;
    }, {})
  }

  flattenGroups(groups) {
    // sort group names on length, sortest first
    const groupNames = Object.keys(groups).sort((a, b) => a.length - b.length);

    // process each group and leave only the capabilities that don't already belong in a 'shorter' group
    return groupNames.reduce((acc, group) => {
      acc.groups[group] = groups[group].filter(cap => ! (cap in acc.seen)).map(cap => {
        acc.seen[cap] = true;
        return cap;
      });
      return acc;
    }, { groups : {}, seen : {} }).groups;
  }

  accessorize() {
    const [ cachedAccessory, device ] = [ this.#accessory, this.#device ];

    // shortcut
    if (cachedAccessory) return cachedAccessory;

    // start creating HomeKit accessory
    const accessory = this.#accessory = this.createAccessory();

    // group capabilities based on their suffix (so `onoff.1` and `dim.1` are
    // assumed to belong together)
    let groups = this.groupCapabilities();

    // for each map, and each group, create a service
    for (const map of this.#maps) {
      this.log(`map '${ map.name }':`);
      for (const [ group, capabilities ] of Object.entries(map.group ? groups : this.flattenGroups(groups))) {
        let service;

        this.log(2, `- group '${ group || 'DEFAULT' }' [${ capabilities }]`);

        // for each (supported) capability, create characteristics
        for (const prefix of capabilities) {
          // full name of capability
          const capability = `${ prefix }${ group ? '.' + group : '' }`;

          // get characteristic maps for this capability
          const characteristicMaps = map.required?.[prefix] || map.optional?.[prefix] || map.triggers?.[prefix];
          if (! characteristicMaps) {
            // unable to map this particular capability
            continue;
          }

          // we have to deal with triggers differently below
          const isTrigger = !!map.triggers?.[prefix];

          // if we can at least map one capability to a characteristic, create
          // the actual service (if it doesn't already exist)
          if (! service) {
            service = accessory.getService(map.service);
            if (! service || map.group === true) {
              this.log(4, `- new service ${ map.service.name }`);
              service = accessory.addService(map.service, device.name, group || 'default');
            } else {
              this.log(4, `- existing service ${ map.service.name }`);
            }
          }

          for (const characteristicMap of [ characteristicMaps ].flat()) {
            // determine getters/setters:
            // - first generate an array of getters/setters
            // - check if the device has this capability:
            //   - if so : use the first get/set function in the array
            //   - if not: use the second get/set function (the "fallback")
            //
            // this allows required characteristics to be implemented for devices
            // that don't have the matching capability
            const getters = [ characteristicMap.get ].flat();
            const setters = [ characteristicMap.set ].flat();
            const getter  = getters[ device.capabilities.includes(capability) ? 0 : 1 ];
            const setter  = setters[ device.capabilities.includes(capability) ? 0 : 1 ];

            // next step: create each characteristic (there can be multiple) with
            // all the relevant event handlers
            const characteristics = [ characteristicMap.characteristics ].flat().map(klass => {
              const characteristic = service.getCharacteristic(klass);

              this.log(6, `- [${ capability }] ${ isTrigger ? 'triggers' : '→' } [${ klass.name }]`);

              // if map has an onUpdate handler, watch for changes
              if (map.onUpdate) {
                characteristic.on('change', async ({ oldValue, newValue }) => {
                  //this.log(`onUpdate — capability=${ capability } characteristic=${ characteristic.constructor.name } old=${ oldValue } new=${ newValue }`);
                  map.onUpdate({ characteristic : characteristic.constructor.name, oldValue, newValue, service, device, capability });
                });
              }

              // we don't register get/set handlers on the characteristic for trigger capabilities
              if (! isTrigger) {
                if (getter) {
                  characteristic.onGet(async () => {
                    const rawValue = device.capabilitiesObj?.[capability]?.value;
                    if (rawValue === undefined) throw Error(`missing capability value for '${ capability }`);
                    return characteristic.validateUserInput( await getter(rawValue, { device, service, characteristic : characteristic.constructor.name }) );
                  });
                }
                if (setter) {
                  characteristic.onSet(async rawValue => {
                    const value = await setter(rawValue, { device, service, characteristic : characteristic.constructor.name });
                    await this.#device.setCapabilityValue(capability, value);
                    // update internal device state
                    this.updateCapability(capability, value);
                  });
                }
              }

              return characteristic;
            });

            // lastly: create a capability instance and update the
            // characteristic(s) when the capability changes value
            this.#listeners.push(
              device.makeCapabilityInstance(capability, async rawValue => {
                this.log(`capability update - capability=${ capability } raw=${ rawValue }`);

                // update each characteristic separately (getter may return
                // a specific value for a specific characteristic)
                for (const characteristic of characteristics) {
                  const name  = characteristic.constructor.name;
                  const value = await getter(rawValue, { device, service, capability, characteristic : name });
                  if (value === Mapper.Constants.NO_VALUE) continue;
                  this.log(`- update characteristic - name = ${ name } value =`, value);
                  characteristic.updateValue(characteristic.validateUserInput(value));
                }

                // update internal device state
                this.updateCapability(capability, rawValue);
              })
            );
          }
        }
      }
    }
    //console.log( accessory.services.map(s => ({ name: s.constructor.name, char: s.characteristics.map(c => c.constructor.name) })) );
    return accessory;
  }

  log(...messages) {
    let indent = '';
    if (typeof messages[0] === 'number') {
      indent = ''.padStart(messages.shift());
    }
    this.#logger(`[${ this.toString() }]${ indent }`, ...messages);
  }

  toString() {
    return `${ this.#device.name }`;
  }
}

const Mapper = module.exports = new (class MapperImpl {
  // private
  #MAPS    = [];
  #DEVICES = {};
  #logger  = console.log;
  Constants = {
    NO_VALUE : Symbol('NO_VALUE')
  };

  // "statics"
  Utils = {
    normalizeCapability     : cap => cap.split('.')[0],
    normalizeCapabilities   : caps => Object.keys(caps.reduce((acc, cap) => (acc[Mapper.Utils.normalizeCapability(cap)] = true, acc), {})),
    hasCapability           : (device, cap) => device.capabilities?.some(capability => Mapper.Utils.normalizeCapability(capability) === cap),
    allCapabilitiesMatching : (device, cap) => device.capabilities?.filter(capability => capability === cap || capability.startsWith(`${ cap }.`)) || [],
    hasCapabilityWithValue  : (device, cap, value) => Mapper.Utils.allCapabilitiesMatching(device, cap).some(capability => device.capabilitiesObj?.[capability]?.value === value),
    upperFirst              : s => String(s).replace(/^./, m => m[0].toUpperCase()),
    mapValue                : (value, x1, y1, x2, y2) => (value - x1) * (y2 - x2) / (y1 - x1) + x2,
  };
  Fixed = {
    True:   () => true,
    False:  () => false,
    Null:   () => null,
  };

  setLogger(logger) {
    this.#logger = logger;
  }

  createMap(obj) {
    // XXX: validate `obj`
    this.#MAPS.push(obj);
  }

  mapDevice(device) {
    const FAIL = device => ( this.#DEVICES[device.id] = null, null );

    // check cache first
    if (device.id in this.#DEVICES) return this.#DEVICES[device.id];

    // find maps that match the device class or virtual class
    const possibleMaps = this.#MAPS.filter(map => {
      const classes = [ map.class ].flat();
      return classes.includes(device.class) || classes.includes(device.virtualClass);
    });
    if (! possibleMaps.length) return FAIL(device);

    // normalize list of device capabilities
    const capabilities = Mapper.Utils.normalizeCapabilities(device.capabilities);

    // filter possible maps against required capabilities
    const usableMaps = possibleMaps.filter(map => {
      const required = Object.keys(map.required);
      return required.every(cap => capabilities.includes(cap));
    });
    if (! usableMaps.length) return FAIL(device);

    // now find maps that match the virtual device class, which we prefer
    const preferredMaps = usableMaps.filter(map => {
      const classes = [ map.class ].flat();
      return classes.includes(device.virtualClass);
    });

    // TODO: sort maps on number of matching capabilities

    // start with the first map
    const actualMaps = preferredMaps.length ? preferredMaps : usableMaps;
    const mappedDevice = this.#DEVICES[device.id] = new MappedDevice(device, actualMaps.shift(), this.#logger);

    // then apply the next maps
    for (const map of actualMaps) {
      mappedDevice.addMap(map);
    }

    // Done
    return mappedDevice;
  }

  forgetDevice(device) {
    const mappedDevice = this.#DEVICES[device.id];
    if (! mappedDevice) return;
    mappedDevice.cleanup();
    delete this.#DEVICES[device.id];
  }

  canMapDevice(device) {
    return !! this.mapDevice(device);
  }
})();

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
  }
};

Mapper.Characteristics = {
  OnOff:         { characteristics: Characteristic.On,               ...Mapper.Accessors.OnOff },
  Active:        { characteristics: Characteristic.Active,           ...Mapper.Accessors.Active },
  Brightness:    { characteristics: Characteristic.Brightness,       ...Mapper.Accessors.Brightness },
  Mute:          { characteristics: Characteristic.Mute,             ...Mapper.Accessors.Mute },
  Volume:        { characteristics: Characteristic.Volume,           ...Mapper.Accessors.Volume },
  RotationSpeed: { characteristics: Characteristic.RotationSpeed,    ...Mapper.Accessors.RotationSpeed },
  ProgrammableSwitchEvent : {
    characteristics : Characteristic.ProgrammableSwitchEvent,
    ...Mapper.Accessors.ProgrammableSwitchEvent.SinglePress
  },
  Temperature:   {
    Current:      { characteristics : Characteristic.CurrentTemperature, ...Mapper.Accessors.Temperature },
    Target:       { characteristics : Characteristic.TargetTemperature,  ...Mapper.Accessors.Temperature },
    DisplayUnits: {
      characteristics : Characteristic.TemperatureDisplayUnits,
      // yay metric!
      get : () => Characteristic.TemperatureDisplayUnits.CELCIUS
    }
  },
  RelativeHumidity:   {
    Current: { characteristics : Characteristic.CurrentRelativeHumidity, ...Mapper.Accessors.RelativeHumidity },
    Target:  { characteristics : Characteristic.TargetRelativeHumidity,  ...Mapper.Accessors.RelativeHumidity },
  },
  HeatingCoolingState : {
    Current: { characteristics : Characteristic.CurrentHeatingCoolingState, ...Mapper.Accessors.HeatingCoolingState.Current },
    Target:  { characteristics : Characteristic.TargetHeatingCoolingState,  ...Mapper.Accessors.HeatingCoolingState.Target },
  },
  Light:         {
    Dim:         { characteristics: Characteristic.Brightness,       ...Mapper.Accessors.Brightness },
    Hue:         { characteristics: Characteristic.Hue,              ...Mapper.Accessors.Hue },
    Saturation:  { characteristics: Characteristic.Saturation,       ...Mapper.Accessors.Saturation },
    Temperature: { characteristics: Characteristic.ColorTemperature, ...Mapper.Accessors.ColorTemperature },
  },
  WindowCoverings : {
    Set : {
      characteristics : [ Characteristic.CurrentPosition, Characteristic.TargetPosition ],
      ...Mapper.Accessors.Position
    },
    State : {
      characteristics: Characteristic.PositionState,
      ...Mapper.Accessors.PositionState
    }
  }
};

Object.entries(require('require-all')(__dirname + '/maps')).forEach(([ name, mapperFunction ]) => {
  const mapper = mapperFunction(Mapper, Service, Characteristic);
  mapper.name  = name;
  Mapper.createMap(mapper);
});
