module.exports = (Mapper, Service, Characteristic) => ({
  class : 'sensor',
  service: Service.CarbonMonoxideSensor,
  required: {
    measure_co : {
      characteristics: [ Characteristic.CarbonMonoxideDetected, Characteristic.CarbonMonoxideLevel ],
      get:             (value, { characteristic }) => {
        switch (characteristic) {
          case 'CarbonMonoxideDetected':
            const { CO_LEVELS_NORMAL, CO_LEVELS_ABNORMAL } = Characteristic.CarbonMonoxideDetected;
            // XXX: HK is unclear about what's normal and what's abnormal
            let mappedValue = Mapper.Utils.mapValue(value, 0, 100, CO_LEVELS_NORMAL, CO_LEVELS_ABNORMAL);
            if (mappedValue > 1) mappedValue = 1;
            return mappedValue;
          case 'CarbonMonoxideLevel':
            return value;
          default:
            return value;
        }
      }
    }
  }
});

