module.exports = (Mapper, Service, Characteristic) => ({
  class:    [ 'curtain', 'blinds', 'sunshade', 'windowcoverings' ],
  service:  Service.WindowCovering,
  required: {
    windowcoverings_set : Mapper.Characteristics.WindowCoverings.Set
  }
});
