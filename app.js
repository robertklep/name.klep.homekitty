const { join : pathJoin }           = require('node:path');
const { mkdir, access, rm : rmdir } = require('node:fs/promises');
const { chdir }                     = require('node:process');
const Homey                         = require('homey');
const Constants                     = require('./constants');
const DeviceMapper                  = require('./lib/device-mapper');
const { HomeyAPIApp }               = require('./modules/homey-api');
const {
  Bridge, Service, Characteristic,
  Accessory, AccessoryEventTypes, uuid } = require('./modules/hap-nodejs');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

module.exports = class HomeKitty extends Homey.App {
  #api        = null;
  #bridge     = null;
  #persistDir = null;
  #watching   = false;

  async onInit() {
    this.log('');
    this.log('🐈🏠 ✧･ﾟ: *✧･ﾟ Welcome to HomeKitty ﾟ･✧*:･ﾟ✧ 🏠🐈');
    this.log('');

    // create persistence directory
    await this.initializePersistence();

    // perform a reset
    if (false) {
      await this.reset();
      return;
    }

    // initialize Homey API
    await this.initializeApi();

    // wait for devices to settle
    await this.settleDevices();

    // configure the bridge
    await this.configureBridge();

    // map all supported devices
    await this.mapDevices();

    // start the bridge
    await this.startBridge();
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

  async initializeApi() {
    this.#api = new HomeyAPIApp({ homey: this.homey });
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
      if (newCount && newCount === previousDeviceCount) {
        this.log(`devices have settled (counted ${ newCount } in total)`);
        break;
      }
      previousCount = newCount;
      this.log(`devices have not yet settled, waiting for 60 seconds...`);
      await delay(60000 * 1000);
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
    // TODO: track paired devices
    for (const [ id, device ] of Object.entries(await this.getDevices())) {
      await this.mapDevice(device);
    }

    // TODO: listen for realtime device events
  }

  async mapDevice(device) {
    if (! device || ! device.ready || ! device.capabilitiesObj) return;

    // HK bridges can only bridge at most 150 devices (including themselves)
    if (this.#bridge.bridgedAccessories.length >= 149) {
      this.error('reached the HomeKit limit of how many devices can be bridged');
    }

    this.log(`[${ device.name }:${ device.id }] trying mapper`);
    const mappedDevice = Mapper.mapDevice(device);
    if (mappedDevice) {
      this.log(`[${ device.name }:${ device.id }] was able to map 🥳`);

      /* TODO
      device.on('$delete', id => {
        this.deleteDevice(device);
      });
      */

      this.#bridge.addBridgedAccessory(mappedDevice.accessorize());
      return;
    }
    this.log(`[${ device.name }:${ device.id }] unable to map 🥺`);
  }

  async getDevices() {
    return this.#api.devices.getDevices();
  }

  async reset() {
    this.log('resetting credentials');
    // reset credentials and persistence (start over)
    // TODO: identifier should be set to a new value, otherwise it keeps getting deleted
    this.homey.settings.unset(Constants.SETTINGS_BRIDGE_IDENTIFIER);
    this.homey.settings.unset(Constants.SETTINGS_BRIDGE_USERNAME);
    this.homey.settings.unset(Constants.SETTINGS_BRIDGE_PORT);
    this.homey.settings.unset(Constants.SETTINGS_BRIDGE_SETUP_ID);
    this.homey.settings.unset(Constants.SETTINGS_BRIDGE_PINCODE);
    try {
      this.log('removing persistence directory:');
      await rmdir(this.#persistDir, { recursive : true });
      this.log('- success 🥳');
    } catch(e) {
      this.error('- failed 😭 ');
      this.error(e);
    }
    // TODO: restart app
  }

  async realtimeUpdates() {
    if (this.#watching) return;

    await this.#api.devices.connect();

    this.#api.devices.on('device.create', device => {
      console.log('device created', device.id, device.name);
    });

    this.#api.devices.on('device.delete', device => {
      console.log('device deleted', device.id, device.name);
    });

    this.#watching = true;
  }
}
