module.exports = (Mapper, Service, Characteristic) => ({
  class: 'thermostat',
  service: Service.Fanv2,
  required: {
    fan_power: {
      characteristics: [
        Characteristic.Active,
        Characteristic.TargetFanState,
        Characteristic.RotationSpeed
      ],
      get: (value, { characteristic }) => {
        switch (characteristic) {
          case 'Active':
            return Characteristic.Active.ACTIVE
          case 'TargetFanState':
            return value ? Characteristic.TargetFanState.MANUAL : Characteristic.TargetFanState.AUTO
          case 'RotationSpeed':
            return value * 20
        }
      },
      set: (value, { characteristic }) => {
        switch (characteristic) {
          case 'Active':
            if (!value) {
              return 0
            }
            break
          case 'TargetFanState':
            return value ? 0 : 1
          case 'RotationSpeed':
            if (value === 100) {
              return 5
            } else if (value > 75) {
              return 4
            } else if (value > 50) {
              return 3
            } else if (value > 25) {
              return 2
            } else if (value > 0) {
              return 1
            }
            return 0
        }
      }
    }
  }
})
