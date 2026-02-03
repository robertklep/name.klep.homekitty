module.exports = (Mapper, Service, Characteristic) => ({
  class:    'heater',
  service:  Service.HeaterCooler,
  onService: (service, { device }) => {
    // only supports heating
    service.getCharacteristic(Characteristic.TargetHeaterCoolerState).updateValue(Characteristic.TargetHeaterCoolerState.HEAT);
    service.getCharacteristic(Characteristic.TargetHeaterCoolerState).setProps({
      validValues: [Characteristic.TargetHeaterCoolerState.HEAT],
      maxValue: Characteristic.TargetHeaterCoolerState.HEAT,
      minValue: Characteristic.TargetHeaterCoolerState.HEAT
    });
  },
  onUpdate: ({ characteristic, oldValue, newValue, service, device, capability }) => {
    // set correct temperature display unit
    const opts = device.capabilitiesObj?.[capability];
    if (opts && 'units' in opts) {
      const unit = opts.units === '°F' ? 'FAHRENHEIT' : 'CELSIUS';
      service.getCharacteristic(Characteristic.TemperatureDisplayUnits).updateValue(Characteristic.TemperatureDisplayUnits[unit]);
    }
  },
  // TODO: use target_temperature to set HEATING/COOLING states, similar to thermostat
  required: {
    onoff: {
      characteristics: Characteristic.Active,
      get : (value, { service }) => {
        // update current state
        const characteristic = Characteristic.CurrentHeaterCoolerState;
        service.getCharacteristic(characteristic).updateValue( characteristic[value ? 'HEATING' : 'INACTIVE' ] );
        return Characteristic.Active[ value ? 'ACTIVE' : 'INACTIVE' ];
      },
      set : (value) => {
        // update target state
        return value === Characteristic.Active.ACTIVE;
      }
    },
    measure_temperature: Mapper.Characteristics.Temperature.Current,
    target_temperature: Mapper.Characteristics.Temperature.HeatingThreshold,
  },
  optional : {
    dim: Mapper.Characteristics.RotationSpeed,
  }
});
