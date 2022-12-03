const { Driver }  = require('homey');
const { uuid } = require('../../modules/hap-nodejs');

module.exports = class FlowButtonDriver extends Driver {
  async onInit() {
    this.log('FlowButtonDriver has been initialized');
  }

  onPairListDevices() {
    return [{
      "name":  "Flow Button",
      "class": "button",
      "data":  {
        "id":  uuid.generate(new Date().getTime().toString())
      }
    }];
  }
};
