module.exports = (Mapper, Service, Characteristic) => ({
  class: 'thermostat',
  service: Service.WindowCovering,
  required: {
    vertical: {
      characteristics: [
        Characteristic.TargetPosition,
        Characteristic.CurrentPosition,
        Characteristic.PositionState
      ],
      get: (value, { characteristic }) => {
        switch (characteristic) {

        }
      },
      set: (value, { characteristic }) => {
        switch (characteristic) {

        }
      }
    }
  },
  optional: {
    horizontal: {
      characteristics: [
        Characteristic.TargetHorizontalTiltAngle,
        Characteristic.CurrentHorizontalTiltAngle
      ],
      get: (value, { characteristic }) => {
        switch (characteristic) {

        }
      },
      set: (value, { characteristic }) => {
        switch (characteristic) {

        }
      }
    }
  }
})
