const VirtualDevice               = require('../virtual-device');
const { Service, Characteristic } = require('../../modules/hap-nodejs');

const { SINGLE_PRESS, DOUBLE_PRESS, LONG_PRESS } = Characteristic.ProgrammableSwitchEvent;

module.exports = class ProgrammableSwitchDevice extends VirtualDevice {
  #onButtonPressTrigger = null;

  async onInit() {
    this.log('ProgrammableSwitchDevice has been initialized');
    await this.setUnavailable();
    await this.accessorize();
    await this.setAvailable();
  }

  async accessorize() {
    // create a new accessory
    const accessory      = this.Accessory();
    const service        = accessory.addService(Service.StatelessProgrammableSwitch);
    const characteristic = service.getCharacteristic(Characteristic.ProgrammableSwitchEvent);

    // call when the button is pressed on the Homey side
    this.registerCapabilityListener('button', async value => {
      characteristic.updateValue(SINGLE_PRESS);
    });

    // add to bridge
    await this.addToBridge();
  }
}
