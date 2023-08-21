module.exports = (Mapper, Service, Characteristic) => ({
  class:    'lock',
  service:  Service.LockMechanism,
  required: {
    onoff : {
      characteristics: [ Characteristic.LockCurrentState, Characteristic.LockTargetState ],
      // Bold locks do things the wrong way around; since we don't know of any
      // other locks that use `onoff`, we'll just use their method.
      get : value => Characteristic.LockCurrentState[ value ? 'UNSECURED' : 'SECURED' ],
      set : value => value === Characteristic.LockTargetState.UNSECURED,
    }
  }
});
