module.exports = (Mapper, Service, Characteristic) => ({
  class : [ 'sensor', 'other' ],
  service: Service.SmokeSensor,
  required: {
    alarm_smoke : {
      characteristics : Characteristic.SmokeDetected,
      ...Mapper.Accessors.SmokeDetected
    }
  },
  optional : {
    alarm_tamper : {
      characteristics : Characteristic.StatusTampered,
      ...Mapper.Accessors.Boolean
    },
  }
});
