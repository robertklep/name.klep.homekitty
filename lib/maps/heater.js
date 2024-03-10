module.exports = (Mapper, Service, Characteristic) => ({
  class:    'heater',
  service:  Service.HeaterCooler,
  onUpdate: ({ characteristic, oldValue, newValue, service, device, capability }) => {
    // set to Celsius
    service.getCharacteristic(Characteristic.TemperatureDisplayUnits).updateValue(Characteristic.TemperatureDisplayUnits.CELSIUS);
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
      set : (value, { service }) => {
        // update target state
        const isActive       = value === Characteristic.Active.ACTIVE;
        const characteristic = Characteristic.TargetHeaterCoolerState;
        service.getCharacteristic(characteristic).updateValue( characteristic[isActive ? 'HEAT' : 'AUTO' ] );
        return isActive;
      }
    },
    measure_temperature: Mapper.Characteristics.Temperature.Current,
  },
  optional : {
    dim: Mapper.Characteristics.RotationSpeed,
  }
});
