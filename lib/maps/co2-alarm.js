module.exports = (Mapper, Service, Characteristic) => ({
  class : [ 'sensor', 'other' ],
  service: Service.CarbonDioxideSensor,
  required: {
    alarm_co2 : {
      characteristics : Characteristic.CarbonDioxideDetected,
      get : value => Characteristic.CarbonDioxideDetected[ value ? 'CO2_LEVELS_ABNORMAL' : 'CO2_LEVELS_NORMAL' ]
    }
  }
});
