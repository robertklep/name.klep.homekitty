module.exports = (Mapper, Service, Characteristic) => ({
  class : [ 'sensor', 'other' ],
  service: Service.HumiditySensor,
  required: {
    measure_humidity: Mapper.Characteristics.RelativeHumidity.Current
  },
  optional : {
    alarm_tamper : {
      characteristics : Characteristic.StatusTampered,
      ...Mapper.Accessors.Boolean
    },
  }
});
