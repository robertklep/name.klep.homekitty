module.exports = (Mapper, Service, Characteristic) => ({
  class : ['sensor', 'other'],
  service: Service.OccupancySensor,
  required: {
    alarm_occupancy : {
      characteristics : Characteristic.OccupancyDetected,
      ...Mapper.Accessors.Boolean
    }
  },
  optional : {
    alarm_tamper : {
      characteristics : Characteristic.StatusTampered,
      ...Mapper.Accessors.Boolean
    },
  }
});
