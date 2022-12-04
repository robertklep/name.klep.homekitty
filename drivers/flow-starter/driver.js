const { Driver } = require('homey');
const { uuid }   = require('../../modules/hap-nodejs');

module.exports = class FlowStarterDriver extends Driver {
  async onInit() {
    this.log('FlowStarterDriver has been initialized');
  }

  onPairListDevices() {
    return [{
      "name":  "Flow Starter",
      "class": "button",
      "data":  {
        "id":  uuid.generate(new Date().getTime().toString())
      }
    }];
  }
};
