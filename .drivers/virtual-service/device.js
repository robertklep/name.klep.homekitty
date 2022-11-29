const { Device } = require('homey');

module.exports = class VirtualServiceDevice extends Device {

  async onInit() {
    this.log('VirtualServiceDevice has been initialized');
  }

}
