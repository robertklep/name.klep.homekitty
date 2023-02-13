module.exports = (Mapper, Service, Characteristic) => ({
  class:    [ 'coffeemachine', 'kettle', 'amplifier', 'tv', 'other', 'remote', 'sensor', 'vacuumcleaner' ],
  service:  Service.Switch,
  required: {
    onoff : Mapper.Characteristics.OnOff,
  }
});
