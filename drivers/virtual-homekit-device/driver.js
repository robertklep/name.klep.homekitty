const { Driver }  = require('homey');
const { Service } = require('../../modules/hap-nodejs');

module.exports = class VirtualHomeKitDriver extends Driver {
  async onInit() {
    this.log('VirtualHomeKitDriver has been initialized');
  }

  onPair(session) {
    // return a list of HK services
    session.setHandler('Services.Get', async () => {
      return Object.keys(Service).filter(service => service[0].toUpperCase() === service[0]);
    });
  }
};
