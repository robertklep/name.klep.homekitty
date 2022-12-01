const { Device }                                   = require('homey');
const { Accessory, Service, Characteristic, uuid } = require('../../modules/hap-nodejs');

module.exports = class VirtualDevice extends Device {
  #accessory = null;

  Accessory(accessoryName = null, accessoryId = null) {
    if (this.#accessory) return this.#accessory;

    const name      = accessoryName ?? this.getName();
    const id        = accessoryId   ?? this.getData().id
    const accessory = this.#accessory = new Accessory(name, uuid.generate(id));

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

  accessorize() {
    throw Error('accessorize() should be overridden in subclasses');
  }

  async onDeleted() {
    this.log('device deleted, removing from bridge');
    await this.homey.app.deleteDeviceFromHomeKit({ id : this.getData().id });
  }

  onRenamed(name) {
    if (! this.#accessory) return;
    this.log(`renamed to ${ name }`);
    this.#accessory.getService(Service.AccessoryInformation)
      .setCharacteristic(Characteristic.Name,  name)
      .setCharacteristic(Characteristic.Model, name);
  }
};
