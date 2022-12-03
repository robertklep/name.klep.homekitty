const { Driver }  = require('homey');
const { uuid } = require('../../modules/hap-nodejs');

module.exports = class ProgrammableSwitchDriver extends Driver {
  async onInit() {
    this.log('ProgrammableSwitchDriver has been initialized');
  }

  onPairListDevices() {
    return [{
      "name":  "Programmable Switch",
      "class": "button",
      "data":  {
        "id":  uuid.generate(new Date().getTime().toString())
      }
    }];
  }
};
