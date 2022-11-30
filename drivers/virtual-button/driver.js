const { Driver }  = require('homey');
const { uuid } = require('../../modules/hap-nodejs');

module.exports = class VirtualButtonDriver extends Driver {
  async onInit() {
    this.log('VirtualButtonDriver has been initialized');
  }

  onPairListDevices() {
    return [{
      "name":  "Virtual Button",
      "class": "button",
      "data":  {
        "id":  uuid.generate(new Date().getTime().toString())
      }
    }];
  }
};
