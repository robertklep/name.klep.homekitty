module.exports = (Mapper, Service, Characteristic) => {
  const { UNKNOWN, EXCELLENT, GOOD, FAIR, INFERIOR, POOR } = Characteristic.AirQuality;

  return {
    class : 'sensor',
    service: Service.AirQualitySensor,
    required: {
      measure_co2 : {
        characteristics: Characteristic.AirQuality,
        get:             value => {
          // use OSHA guidelines to determine air quality based on CO2 levels:
          // https://ohsonline.com/Articles/2016/04/01/Carbon-Dioxide-Detection-and-Indoor-Air-Quality-Control.aspx?Page=2
          if (value == null) {
            return UNKNOWN;
          } else if (value < 350) {
            return EXCELLENT;
          } else if (value < 1000) {
            return GOOD;
          } else if (value < 2000) {
            return FAIR;
          } else if (value < 5000) {
            return INFERIOR;
          } else {
            return POOR;
          }
        }
      }
    },
    optional : {
      measure_pm25 : {
        characteristics: Characteristic.PM2_5Density,
        get:             value => value ?? 0,
      }
    }
  }
};
