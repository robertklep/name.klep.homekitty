module.exports = (Mapper, Service, Characteristic) => ({
  class : ['sensor', 'other'],
  service: Service.ContactSensor,
  required: {
    alarm_contact : {
      characteristics : Characteristic.ContactSensorState,
      ...Mapper.Accessors.ContactSensorState
    }
  }
});
