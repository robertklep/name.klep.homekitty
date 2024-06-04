module.exports = (Mapper, Service, Characteristic) => ({
  class:    'thermostat',
  service:  Service.Thermostat,
  onUpdate: ({ characteristic, oldValue, newValue, service, device, capability }) => {
    // set to Celsius
    service.getCharacteristic(Characteristic.TemperatureDisplayUnits).updateValue(Characteristic.TemperatureDisplayUnits.CELSIUS);

    // don't need to fake thermostat mode if the device has the real thing
    if (Mapper.Utils.hasCapability(device, 'thermostat_mode')) return;

    // If the capability 'thermostat_mode' is not used, remove all modes and support only AUTO Mode
    service.getCharacteristic(Characteristic.TargetHeatingCoolingState).setProps({
      validValues: [Characteristic.TargetHeatingCoolingState.AUTO],
      maxValue: Characteristic.TargetHeatingCoolingState.AUTO,
      minValue: Characteristic.TargetHeatingCoolingState.AUTO
    });
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
