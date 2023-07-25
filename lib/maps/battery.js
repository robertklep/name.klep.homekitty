module.exports = (Mapper, Service, Characteristic) => ({
  class : [ 'sensor', 'other' ],
  service: Service.Battery,
  required: {
    measure_battery : {
      characteristics: Characteristic.BatteryLevel,
      ...Mapper.Accessors.Identity
    }
  },
  optional : {
    alarm_battery : {
      characteristics: Characteristic.StatusLowBattery,
      get:             value => value ? 1 : 0
    }
  }
});


