module.exports = (Mapper, Service, Characteristic) => ({
  class : [ 'sensor', 'other' ],
  service: Service.Battery,
  required: {
    measure_battery : {
      characteristics: [ Characteristic.BatteryLevel, Characteristic.StatusLowBattery ],
      get:             (value, { characteristic }) => {
        switch (characteristic) {
          case 'BatteryLevel':
            return value;
          case 'StatusLowBattery':
            return value < 10 ? 1 : 0;
          default:
            return value;
        }
      }
    }
  }
});


