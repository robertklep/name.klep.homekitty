module.exports = (Mapper, Service, Characteristic) => ({
  class:    [ 'coffeemachine', 'kettle', 'amplifier', 'tv', 'other', 'remote', 'sensor' ],
  service:  Service.Switch,
  required: {
    onoff : Mapper.Characteristics.OnOff,
  }
});
