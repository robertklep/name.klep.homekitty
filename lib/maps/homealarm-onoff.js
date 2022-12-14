module.exports = (Mapper, Service, Characteristic) => ({
  class:    'homealarm',
  service:  Service.SecuritySystem,
  required: {
    onoff : {
      characteristics: [ Characteristic.SecuritySystemCurrentState, Characteristic.SecuritySystemTargetState ],
      get:             value => Characteristic.SecuritySystemCurrentState[value ? 'AWAY_ARM' : 'DISARMED'],
      set:             value => value === Characteristic.SecuritySystemCurrentState.DISARMED ? false : true,
    }
  }
});
