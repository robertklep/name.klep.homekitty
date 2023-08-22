module.exports = (Mapper, Service, Characteristic) => ({
  class:    'tv',
  service:  Service.Television,
  onService : (service, { device }) => {
    service.getCharacteristic(Characteristic.ConfiguredName).setValue(device.name);
    service.getCharacteristic(Characteristic.Name).setValue(device.name);

    // There are no capabilities that map to these, so we'll just assume a fixed value.
    service.getCharacteristic(Characteristic.ActiveIdentifier).setValue(1);
    service.getCharacteristic(Characteristic.SleepDiscoveryMode).setValue(Characteristic.SleepDiscoveryMode.NOT_DISCOVERABLE);
  },
  required: {
    onoff: Mapper.Characteristics.Active,
  },
  optional: {
    dim: Mapper.Characteristics.Light.Dim,
  },
});
