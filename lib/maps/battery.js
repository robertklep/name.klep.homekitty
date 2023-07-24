module.exports = (Mapper, Service, Characteristic) => ({
  class : [ 'sensor', 'other' ],
  service: Service.Battery,
  required: {
    measure_battery : {
      characteristics: [ Characteristic.BatteryLevel, Characteristic.StatusLowBattery ],
      get:             (value, { device, characteristic }) => {
        switch (characteristic) {
          case 'BatteryLevel':
            return value;
          case 'StatusLowBattery':
            // if device supports battery alarms, use them
            if (Mapper.Utils.hasCapability(device, 'alarm_battery')) {
              return Mapper.Utils.hasCapabilityWithValue(device, 'alarm_battery', true) ? 1 : 0;
            }

            // otherwise, raise an alarm when the battery level is below 10%
            return value < 10 ? 1 : 0;
          default:
            return value;
        }
      }
    }
  }
});


