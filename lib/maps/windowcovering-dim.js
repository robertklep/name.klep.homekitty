module.exports = (Mapper, Service, Characteristic) => ({
  class:    [ 'curtain', 'blinds', 'sunshade', 'windowcoverings' ],
  service:  Service.WindowCovering,
  required: {
    dim : Mapper.Characteristics.WindowCoverings.Set
  },
  optional: {
    windowcoverings_state : Mapper.Characteristics.WindowCoverings.State
  }
});
