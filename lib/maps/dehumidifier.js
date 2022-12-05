module.exports = (Mapper, Service, Characteristic) => ({
  class: 'thermostat',
  service: Service.HumidifierDehumidifier,
  required: {
    onoff: {
      characteristics: Characteristic.Active,
      set: (value) => Boolean(value)
    },
    operation_mode: {
      characteristics: [Characteristic.Active, Characteristic.TargetHumidifierDehumidifierState],
      get: (value, { characteristic, device }) => {
        switch (characteristic) {
          case 'Active':
            return value === 'dry' && device.capabilitiesObj?.onoff?.value === true
          case 'TargetHumidifierDehumidifierState':
            return Characteristic.TargetHumidifierDehumidifierState.DEHUMIDIFIER
        }
      },
      set: (value, { characteristic }) => {
        switch (characteristic) {
          case 'Active':
            if (value) {
              return 'dry'
            }
        }
      }
    }
  }
})
