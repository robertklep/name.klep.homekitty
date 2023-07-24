module.exports = (Mapper, Service, Characteristic) => ({
  class : [ 'sensor', 'other' ],
  service: Service.CarbonMonoxideSensor,
  required: {
    alarm_co : {
      characteristics : Characteristic.CarbonMonoxideDetected,
      get : value => Characteristic.CarbonMonoxideDetected[ value ? 'CO_LEVELS_ABNORMAL' : 'CO_LEVELS_NORMAL' ]
    }
  },
  optional : {
    alarm_tamper : {
      characteristics : Characteristic.StatusTampered,
      ...Mapper.Accessors.Boolean
    },
  }
});
