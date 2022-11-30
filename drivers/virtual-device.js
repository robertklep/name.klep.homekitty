const { Device }                             = require('homey');
const { Accessory, Service, Characteristic } = require('../../modules/hap-nodejs');

module.exports = class VirtualDevice extends Device {
  #accessory = null;

  getAccessory() {
    if (this.#accessory) return this.#accessory;

    const name      = this.getName();
    const { id }    = this.getData();
    const accessory = this.#accessory = new Accessory(name, id);

    accessory .getService(Service.AccessoryInformation)
              .setCharacteristic(Characteristic.Manufacturer, 'HomeKitty')
              .setCharacteristic(Characteristic.Model,        name)
              .setCharacteristic(Characteristic.SerialNumber, id);

    return accessory;
  }

  async addToBridge() {
    if (! this.#accessory) return;
    (await this.homey.app.getBridge()).addBridgedAccessory(this.#accessory);
  }

};
