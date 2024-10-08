module.exports = (Mapper, Service, Characteristic) => ({
  class:    [ 'curtain', 'blinds', 'sunshade', 'windowcoverings', 'other' ],
  service:  Service.WindowCovering,
  required: {
    windowcoverings_set : Mapper.Characteristics.WindowCoverings.Set
  },
  optional: {
    windowcoverings_state : Mapper.Characteristics.WindowCoverings.State
  }
});
