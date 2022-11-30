const { join : pathJoin }           = require('node:path');
const { mkdir, access, rm : rmdir } = require('node:fs/promises');
const { chdir }                     = require('node:process');
const debounce                      = require('debounce');
const Homey                         = require('homey');
const Constants                     = require('./constants');
const DeviceMapper                  = require('./lib/device-mapper');
const { HomeyAPIApp }               = require('./modules/homey-api');
const {
  Bridge, Service, Characteristic,
  Accessory, AccessoryEventTypes, uuid } = require('./modules/hap-nodejs');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function defer() {
  const deferred = {};
  const promise  = new Promise((resolve, reject) => {
    deferred.resolve = resolve;
    deferred.reject  = reject;
  });
  deferred.promise = promise;
  return deferred;
}

module.exports = class HomeKitty extends Homey.App {
  #api           = null;
  #bridge        = null;
  #persistDir    = null;
  #watching      = false;
  #devicesMapped = defer();
  #exposed       = null;

  async onInit() {
    this.log('');
    this.log('🐈🏠 ✧･ﾟ: *✧･ﾟ Welcome to HomeKitty ﾟ･✧*:･ﾟ✧ 🏠🐈');
    this.log('');

    // initialize API handlers
    await this.initializeApiHandlers();

    // create persistence directory
    await this.initializePersistence();

    // perform a reset
    if (Homey.env.HOMEKITTY_RESET === 'true') {
      await this.reset();
    }

    // initialize expose map
    this.initializeExposeMap();

    // initialize Homey Web API
    await this.initializeWebApi();

    // wait for devices to settle
    await this.settleDevices();

    // configure the bridge
    await this.configureBridge();

    // map all supported devices
    await this.mapDevices();

    // watch for device updates
    await this.watchDevices();

    // start the bridge
    await this.startBridge();
  }

  async initializeApiHandlers() {
    for (const [ name, fn ] of Object.entries(this.api)) {
      this.api[name] = fn.bind(this);
    }
  }

  async initializePersistence() {
    const persistDir = this.#persistDir = pathJoin(Constants.PERSISTENCE_DIRECTORY_PREFIX, Constants.BRIDGE_FIRMWARE_REVISION);

    try {
      await access(persistDir);
      this.log(`persistence directory '${ persistDir }' exists`);
    } catch(e) {
      this.log(`creating persistence directory '${ persistDir }:`);
      try {
        await mkdir(persistDir, { recursive : true });
        this.log(`- success 🥳`);
      } catch(e) {
        this.error(`- failed 😭`);
        this.error(e);
        // cannot continue
        throw Error('Internal Error (mkdir)');
      }
    }
    this.log(`changing to persistence directory:`);
    try {
      chdir(persistDir);
      this.log(`- success 🥳`);
    } catch(e) {
      this.error(`- failed 😭`);
      this.error(e);
      // cannot continue
      throw Error('Internal Error (chdir)');
    }
  }

  async initializeExposeMap() {
    this.#exposed = new StorageBackedMap(
      () =>   this.homey.settings.get(Constants.SETTINGS_EXPOSE_MAP) || {},
      data => this.homey.settings.set(Constants.SETTINGS_EXPOSE_MAP, data)
    );
  }

  async initializeWebApi() {
    this.#api = new HomeyAPIApp({ homey: this.homey });

    // have to do this really early to work around a bug in the Web API
    await this.#api.devices.connect();
  }

  async settleDevices() {
    // If Homey has booted in the last 10 minutes, we'll wait a while for all
    // devices to get created properly before we start.
    const uptime = (await this.#api.system.getInfo()).uptime;
    if (uptime > 600) {
      this.log('no need to wait for devices to settle');
      return;
    }

    this.log('Homey was rebooted recently, waiting for devices to settle...');

    // Check every minute if the number of devices has changed. Once it hasn't,
    // we'll assume all devices have been created and we can continue.
    let previousCount = 0;
    while (true) {
      const newCount = Object.keys(await this.getDevices()).length;
      if (newCount && newCount === previousCount) {
        this.log(`devices have settled (counted ${ newCount } in total)`);
        break;
      }
      previousCount = newCount;
      this.log(`devices have not yet settled, waiting for 60 seconds...`);
      await delay(60000);
    }
  }

  async configureBridge() {
    const identifier = this.homey.settings.get(Constants.SETTINGS_BRIDGE_IDENTIFIER) || Constants.DEFAULT_BRIDGE_IDENTIFIER;

    this.log('setting up HomeKit bridge:');
    this.log(`- using "${ identifier }" as bridge identifier`);

    this.#bridge = new Bridge(identifier, uuid.generate(identifier));
    this.#bridge.getService(Service.AccessoryInformation)
                .setCharacteristic(Characteristic.Manufacturer,     'Athom')
                .setCharacteristic(Characteristic.Model,            'Homey')
                .setCharacteristic(Characteristic.FirmwareRevision, Constants.BRIDGE_FIRMWARE_REVISION);

    // Listen for bridge identification events
    this.#bridge.on(AccessoryEventTypes.IDENTIFY, (paired, callback) => {
      this.log('`identify` called on bridge');
      callback();
    });

    // Store current identifier.
    this.homey.settings.set(Constants.SETTINGS_BRIDGE_IDENTIFIER, identifier);

    // watch for changes of the identifier (from the app settings page)
    this.homey.settings.on('set', key => {
      if (key !== Constants.SETTINGS_BRIDGE_IDENTIFIER) return;
      const identifier = this.homey.settings.get(Constants.SETTINGS_BRIDGE_IDENTIFIER);
      this.log(`bridge identifier has changed to '${ identifier }', will stop bridge and app!`);
      this.exit();
    });
  }

  async startBridge() {
    const { username, port, pincode, setupID } = this.getBridgeCredentials();

    this.log(`- using bridge credentials: username=${ username} port=${ port } setupID=${ setupID } pincode=${ pincode }`);

    try {
      this.log(`- starting bridge:`);
      await this.#bridge.publish({
        username,
        port,
        setupID,
        pincode,
        category: Accessory.Categories.BRIDGE
      });
      this.log('  - started successfully! 🥳');
      // store current credentials
      this.homey.settings.set(Constants.SETTINGS_BRIDGE_USERNAME,   username);
      this.homey.settings.set(Constants.SETTINGS_BRIDGE_PORT,       port);
      this.homey.settings.set(Constants.SETTINGS_BRIDGE_SETUP_ID,   setupID);
      this.homey.settings.set(Constants.SETTINGS_BRIDGE_PINCODE,    pincode);
    } catch(e) {
      this.error('  - unable to start! 😭');
      this.error(e);
      // cannot continue
      throw Error('Internal Error (publish)');
    }
  }

  getBridgeCredentials() {
    return {
      username : this.homey.settings.get(Constants.SETTINGS_BRIDGE_USERNAME) || this.generateBridgeUsername(),
      port     : this.homey.settings.get(Constants.SETTINGS_BRIDGE_PORT)     || this.generateBridgePort(),
      setupID  : this.homey.settings.get(Constants.SETTINGS_BRIDGE_SETUP_ID) || Constants.DEFAULT_SETUP_ID,
      pincode  : this.homey.settings.get(Constants.SETTINGS_BRIDGE_PINCODE)  || Constants.DEFAULT_PIN_CODE,
    };
  }

  generateBridgeUsername() {
    return 'XX:XX:XX:XX:XX:XX'.replace(/X/g, () => '0123456789ABCDEF'.charAt(Math.floor(Math.random() * 16)));
  }

  generateBridgePort() {
    // combination of IANA and Linux ranges: 49152 to 60999
    return 49152 + (0 | Math.random() * 11847);
  }

  async mapDevices() {
    // use the app logger for the device mapper
    DeviceMapper.setLogger(this.log.bind(this));

    // get all devices and try to map them
    for (const [ id, device ] of Object.entries(await this.getDevices())) {
      await this.addDeviceToHomeKit(device);
    }

    // save exposure map
    this.#exposed.save();

    // done mapping devices
    this.#devicesMapped.resolve();
  }

  // XXX: make sure a device isn't already mapped
  async addDeviceToHomeKit(device) {
    // don't add our own devices like this
    if (device?.driverUri === 'homey:app:name.klep.homekitty') return false;

    // XXX: make sure we have an actual useable device
    const prefix = `[${ device?.name || "NO NAME" }:${ device?.id || "NO_ID" }]`;
    if (! device || ! device.ready || ! device.capabilitiesObj) {
      this.error(`${ prefix } device not ready or doesn't have capabilitiesObj`);
      return false;
    }

    // HK bridges can only bridge at most 150 devices (including themselves)
    if (this.#bridge.bridgedAccessories.length >= 149) {
      this.error(`${ prefix } reached the HomeKit limit of how many devices can be bridged`);
      return false;
    }

    // if we don't know the exposure state of the device (i.e.
    // it's new to us), default to exposing it to HK
    if (! this.#exposed.has(device.id)) {
      this.#exposed.set(device.id, true);
    }

    this.log(`[${ device.name }:${ device.id }] trying mapper`);
    const mappedDevice = Mapper.mapDevice(device);
    if (mappedDevice) {
      this.log(`${ prefix } was able to map 🥳`);

      // expose it to HK unless the user doesn't want to
      if (this.#exposed.get(device.id) !== false) {
        this.#bridge.addBridgedAccessory(mappedDevice.accessorize());
      }
      return true;
    }
    this.#exposed.set(device.id, false);
    this.log(`${ prefix } unable to map 🥺`);
    return false;
  }

  async deleteDevice(device) {
    // delete device from HomeKit
    await this.deleteDeviceFromHomeKit(device);
    // delete device from the exposure list
    this.#exposed.delete(device.id);
    this.#exposed.save();
  }

  getAccessoryById(id) {
    const UUID = uuid.generate(id);
    return this.#bridge.bridgedAccessories.find(r => r.UUID === UUID);
  }

  async deleteDeviceFromHomeKit(device) {
    let accessory = this.getAccessoryById(device.id);
    if (! accessory) return false;
    this.log(`removing device with id ${ device.id } from HomeKit:`);
    try {
      this.#bridge.removeBridgedAccessory(accessory);
      await accessory.destroy();
      Mapper.forgetDevice(device);
      this.log(`- success 🥳`);
      return true;
    } catch(e) {
      this.log(`- failed 🥺`);
      this.error(e);
      return false;
    }
  }

  async getDevices() {
    return await this.#api.devices.getDevices();
  }

  async getDeviceById(id) {
    return this.#api.devices.getDevice({ id });
  }

  async reset(delayedExit = false) {
    this.log('resetting credentials');
    // reset credentials and persistence (start over)
    this.homey.settings.unset(Constants.SETTINGS_BRIDGE_IDENTIFIER);
    this.homey.settings.unset(Constants.SETTINGS_BRIDGE_USERNAME);
    this.homey.settings.unset(Constants.SETTINGS_BRIDGE_PORT);
    this.homey.settings.unset(Constants.SETTINGS_BRIDGE_SETUP_ID);
    this.homey.settings.unset(Constants.SETTINGS_BRIDGE_PINCODE);
    this.homey.settings.unset(Constants.SETTINGS_EXPOSE_MAP);
    try {
      this.log('removing persistence directory:');
      await rmdir(this.#persistDir, { recursive : true });
      this.log('- success 🥳');
    } catch(e) {
      this.error('- failed 😭 ');
      this.error(e);
    }
    // API calls may want to set this, otherwise the app exits
    // before the API call gets a response and the frontend balks.
    if (delayedExit) {
      return setTimeout(() => this.exit(), 1000);
    }
    this.exit();
  }

  async exit() {
    await this.#bridge.unpublish();
    process.exit(1);
  }

  async watchDevices() {
    if (this.#watching) return;
    this.#watching = true;

    this.#api.devices.on('device.create', device => {
      if (device?.driverUri === 'homey:app:name.klep.homekitty') return;
      this.log(`[EV] device created — name=${ device.name} id=${ device.id } driver=${ device.driverUri }`);
    });

    this.#api.devices.on('device.delete', async (device) => { // really just `{ id }`
      if (device?.driverUri === 'homey:app:name.klep.homekitty') return;
      this.log(`[EV] device deleted — id=${ device.id }`);
      await this.deleteDevice(device);
    });

    // debounce update events because they may get emitted
    // multiple times during device creation
    this.#api.devices.on('device.update', debounce(async (device) => {
      if (device?.driverUri === 'homey:app:name.klep.homekitty') return;
      this.log(`[EV] device updated — name=${ device.name} id=${ device.id } driver=${ device.driverUri }`);

      // check if device is already exposed through HomeKit
      let accessory = this.getAccessoryById(device.id);
      if (accessory) {
        this.log('- already exposed via HomeKit, will delete to update');
        // delete existing accessory and try adding it again
        await this.deleteDeviceFromHomeKit(device);
      } else {
        this.log('- not yet exposed via HomeKit, will add it as new');
      }
      if (await this.addDeviceToHomeKit(device)) {
        await this.#exposed.save();
      }
    }, 500));
  }

  api = {
    async getDevices() {
      // wait for devices to be mapped
      await this.#devicesMapped;

      // return the list of devices
      return Object.values(await this.getDevices()).map(device => {
        // pass the device state (supported/exposed) to the API
        device.homekitty = {
          supported: Mapper.canMapDevice(device),
          exposed:   this.#exposed.get(device.id) !== false,
        }
        return device;
      });
    },

    async exposeDevice(id) {
      const device = await this.getDeviceById(id);

      if (! await this.addDeviceToHomeKit(device)) {
        throw Error('unable to add device');
      }

      // update exposure state
      this.#exposed.set(id, true);
      this.#exposed.save();

      // done
      return 'ok';
    },

    async unexposeDevice(id) {
      if (! await this.deleteDeviceFromHomeKit({ id })) {
        throw Error('unable to delete device');
      }

      // update exposure state
      this.#exposed.set(id, false);
      this.#exposed.save();

      // done
      return 'ok';
    },

    async reset() {
      await this.reset(true);
      return 'ok';
    }
  }
}

class StorageBackedMap extends Map {
  #dirty  = false;
  #onSave = null;

  constructor(data, onSave) {
    super(Object.entries(data));
    this.#onSave = onSave;
  }

  set(key, value) {
    this.#dirty = this.#dirty || this.get(key) !== value;
    return super.set(key, value);
  }

  delete(key) {
    this.#dirty = this.#dirty || this.has(key);
    return super.delete(key);
  }

  save() {
    if (! this.#dirty) return;
    this.#onSave(Object.fromEntries(this));
    this.#dirty = false;
  }

  isDirty() {
    return this.#dirty;
  }
}
