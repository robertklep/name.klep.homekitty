const { Accessory, Service, Characteristic, AccessoryEventTypes, uuid } = require('../modules/hap-nodejs');
const { MappedDevice } = require('./mapped-device');

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

    // load list of capabilities based on UI visibility and normalize them
    const capabilities = Mapper.Utils.normalizeCapabilities(device.ui?.components?.map(c => c.capabilities).flat() || []);

    const isPossible = (map) => {
      const required  = Object.keys(map.required);
      const forbidden = map.forbidden || [];
      return required.every(cap => capabilities.includes(cap)) && ! forbidden.some(cap => capabilities.includes(cap));
    }

    // filter possible maps against required and forbidden capabilities
    const usableMaps = possibleMaps.filter(isPossible);
    if (! usableMaps.length) return FAIL(device);

    // add possible submaps
    const subMaps = usableMaps
      .filter((map) => map.subMaps?.length)
      .flatMap((map) => map.subMaps)
      .map((subMap) => {
        const map = this.#MAPS.find(({ name }) => name === subMap.name);
        if (map) {
          return { ...map, ...(subMap.overrides ?? {}) };
        }
      }).filter((subMap) => subMap && isPossible(subMap));
    if (subMaps.length) {
      usableMaps.push(...subMaps);
    }

    // now find maps that match the virtual device class, which we prefer
    const preferredMaps = usableMaps.filter(map => {
      const classes = [ map.class ].flat();
      return classes.includes(device.virtualClass);
    });

    // TODO: sort maps on number of matching capabilities

    // start with the first map
    const actualMaps = preferredMaps.length ? preferredMaps : usableMaps;
    const mappedDevice = this.#DEVICES[device.id] = new MappedDevice(this, device, actualMaps.shift(), this.#logger);

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

  getDeviceById(id) {
    return this.#DEVICES[id];
  }

  canMapDevice(device) {
    return !! this.mapDevice(device);
  }
})();

require('./mapper-accessors')(Mapper);
require('./mapper-characteristics')(Mapper);

Object.entries(require('require-all')(__dirname + '/maps')).forEach(([ name, mapperFunction ]) => {
  const mapper = mapperFunction(Mapper, Service, Characteristic, Accessory);
  mapper.name  = name;
  Mapper.createMap(mapper);
});
