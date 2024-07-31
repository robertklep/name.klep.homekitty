module.exports = (Mapper, Service, Characteristic) => ({
  class:    'fan',
  service:  Service.Fanv2,
  required: {
    onoff : Mapper.Characteristics.Active
  },
  optional : {
    // we assume that a fan device cannot have both of the following capabilities
    dim: Mapper.Characteristics.RotationSpeed, // kept for legacy reasons
    fan_speed: Mapper.Characteristics.RotationSpeed
  }
});
