module.exports = (Mapper, Service, Characteristic) => ({
  class : 'sensor',
  service: Service.ContactSensor,
  required: {
    alarm_contact : {
      characteristics : Characteristic.ContactSensorState,
      get: (value, { device }) => {
        // Xiaomi & Aqara app
        if (device.settings?.reverse_contact_alarm === true) value = ! value;
        return Characteristic.ContactSensorState[ value ? 'CONTACT_NOT_DETECTED' : 'CONTACT_DETECTED' ];
      },
      set: (value, { device }) => {
        if (device.settings?.reverse_contact_alarm === true) value = ! value;
        return value === Characteristic.ContactSensorState.CONTACT_DETECTED;
      },
    }
  }
});
