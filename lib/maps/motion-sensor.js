module.exports = (Mapper, Service, Characteristic) => ({
  class : 'sensor',
  service: Service.MotionSensor,
  required: {
    alarm_motion : {
      characteristics : Characteristic.MotionDetected,
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
