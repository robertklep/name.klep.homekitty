const { Driver }  = require('homey');
const { Service } = require('../../modules/hap-nodejs');

module.exports = class VirtualHomeKitDriver extends Driver {
  async onInit() {
    this.log('VirtualHomeKitDriver has been initialized');

    this.cards = {
      setCharacteristicCard : this.setupSetCharacteristicCard()
    }
  }

  setupSetCharacteristicCard() {
    return this.homey.flow
      .getActionCard('set-characteristic')
      .registerArgumentAutocompleteListener('name', async (query, args) => {
        // retrieve the device's service
        const serviceName = args.device?.getSetting('HomeKit.Service');
        if (! serviceName) throw Error('no service name?');

        // instantiate it so we can find its characteristics
        const service = new Service[serviceName]();
        const characteristics = [
          ...service.characteristics,
          ...service.optionalCharacteristics,
        ].map(characteristic => ({ name : characteristic.constructor?.name || characteristic.name }));

        // match characteristics against query
        return characteristics.filter(characteristic => characteristic.name?.toLowerCase().includes(query.toLowerCase()));
      }).registerRunListener(async (args, state) => {
        console.log('Run listener');
        console.log('A', args);
        console.log('S', state);
      });
  }

  onPair(session) {
    // return a list of HK services
    session.setHandler('Services.Get', async () => {
      return Object.keys(Service).filter(service => service[0].toUpperCase() === service[0]);
    });
  }
};
