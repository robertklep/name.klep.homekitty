module.exports = (Mapper, Service, Characteristic) => ({
  class: 'thermostat',
  service: Service.Fan,
  required: {
    onoff: {
      characteristics: Characteristic.On,
      set: (value) => Boolean(value)
    },
    operation_mode: {
      characteristics: Characteristic.On,
      get: (value, { device }) => value === 'fan' && device.capabilitiesObj?.onoff?.value === true,
      set: (value) => {
        if (value) {
          return 'fan'
        }
      }
    }
  }
})
