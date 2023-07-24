module.exports = (Mapper, Service, Characteristic) => ({
  class : 'sensor',
  service: Service.CarbonDioxideSensor,
  required: {
    measure_co2 : {
      characteristics: [ Characteristic.CarbonDioxideDetected, Characteristic.CarbonDioxideLevel ],
      get:             (value, { characteristic }) => {
        switch (characteristic) {
          case 'CarbonDioxideDetected':
            const { CO2_LEVELS_NORMAL, CO2_LEVELS_ABNORMAL } = Characteristic.CarbonDioxideDetected;
            // XXX: HK is unclear about what's normal and what's abnormal
            let mappedValue = Mapper.Utils.mapValue(value, 0, 5000, CO2_LEVELS_NORMAL, CO2_LEVELS_ABNORMAL);
            if (mappedValue > 1) mappedValue = 1;
            return mappedValue;
          case 'CarbonDioxideLevel':
            return value;
          default:
            return value;
        }
      }
    }
  },
  optional : {
    alarm_tamper : {
      characteristics : Characteristic.StatusTampered,
      ...Mapper.Accessors.Boolean
    },
  }
});
