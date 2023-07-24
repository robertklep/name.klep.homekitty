module.exports = (Mapper, Service, Characteristic) => ({
  class : 'sensor',
  service: Service.LeakSensor,
  required: {
    alarm_water : {
      characteristics : Characteristic.LeakDetected,
      ...Mapper.Accessors.LeakDetected
    }
  },
  optional: { 
    alarm_tamper : {
      characteristics : Characteristic.StatusTampered,
      ...Mapper.Accessors.Boolean
    },
  }
});
