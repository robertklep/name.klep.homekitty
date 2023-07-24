module.exports = (Mapper, Service, Characteristic) => ({
  class : 'sensor',
  service: Service.LightSensor,
  required: {
    measure_luminance : {
      characteristics : Characteristic.CurrentAmbientLightLevel,
      ...Mapper.Accessors.Identity
    }
  },
  optional : {
    alarm_tamper : {
      characteristics : Characteristic.StatusTampered,
      ...Mapper.Accessors.Boolean
    },
  }
});
