const Homey           = require('homey');
const { HomeyAPIApp } = require('./modules/homey-api');

module.exports = class HomeKittyApp extends Homey.App {
  #api = null;

  async onInit() {
    this.log('🐈🏠 ✧･ﾟ: *✧･ﾟ Welcome to HomeKitty ﾟ･✧*:･ﾟ✧ 🏠🐈');

    // initialize Homey API
    await this.initializeApi();

    // wait for devices to settle
    await this.settleDevices();
  }

  async initializeApi() {
    this.#api = new HomeyAPIApp({ homey: this.homey });
  }

  async settleDevices() {
  }

  async realtimeUpdates() {
    await this.#api.devices.connect();

    this.#api.devices.on('device.create', device => {
      console.log('device created', device.id, device.name);
    });

    this.#api.devices.on('device.delete', device => {
      console.log('device deleted', device.id, device.name);
    });
  }
}
