module.exports = (Mapper, Service, Characteristic) => ({
  class : ['sensor', 'other'],
  service: Service.ContactSensor,
  required: {
    alarm_contact : {
      characteristics : Characteristic.ContactSensorState,
      ...Mapper.Accessors.ContactSensorState
    }
  },
  optional : {
    alarm_tamper : {
      characteristics : Characteristic.StatusTampered,
      ...Mapper.Accessors.Boolean
    },
  }
});
