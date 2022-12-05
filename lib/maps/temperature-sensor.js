module.exports = (Mapper, Service, Characteristic) => ({
  class : [ 'sensor', 'other' ],
  service: Service.TemperatureSensor,
  required: {
    measure_temperature: Mapper.Characteristics.Temperature.Current
  }
});
