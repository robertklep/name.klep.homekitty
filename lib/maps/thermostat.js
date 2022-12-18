module.exports = (Mapper, Service, Characteristic) => ({
  class:    'thermostat',
  service:  Service.Thermostat,
  onUpdate: ({ characteristic, oldValue, newValue, service, device, capability }) => {
    // don't need to fake thermostat mode if the device has the real thing
    if (Mapper.Utils.hasCapability(device, 'thermostat_mode')) return;

    let target, current, toUpdate;
    switch(characteristic) {
      case 'TargetTemperature':
        target   = newValue;
        current  = service.getCharacteristic(Characteristic.CurrentTemperature).value;
        toUpdate = Characteristic.TargetHeatingCoolingState;
        break;
      case 'CurrentTemperature':
        current  = newValue;
        target   = service.getCharacteristic(Characteristic.TargetTemperature).value;
        toUpdate = Characteristic.CurrentHeatingCoolingState;
        break;
      default:
        return;
    }
    const newState = Characteristic.CurrentHeatingCoolingState[ current >= (target + 0.5) ? 'OFF' : 'HEAT' ];
    service.getCharacteristic(Characteristic.CurrentHeatingCoolingState).updateValue(newState);
    service.getCharacteristic(Characteristic.TargetHeatingCoolingState) .updateValue(newState);
  },
  required: {
    target_temperature:  Mapper.Characteristics.Temperature.Target,
    measure_temperature: Mapper.Characteristics.Temperature.Current,
  },
  optional : {
    thermostat_mode: [
      Mapper.Characteristics.HeatingCoolingState.Current,
      Mapper.Characteristics.HeatingCoolingState.Target,
    ],
    // Optional
    measure_humidity: Mapper.Characteristics.RelativeHumidity.Current,
  }
});
