module.exports = (Mapper, Service, Characteristic) => ({
  class:    [ 'thermostat', 'heatpump', 'airconditioning' ],
  service:  Service.Thermostat,
  subMaps: [
    {
      name: 'fan',
      overrides: {
        required: {
          // avoid conflicts with thermostat on/off
          onoff: {
            characteristics: Characteristic.Active,
            get: () => Characteristic.Active.ACTIVE
          },
          fan_speed: Mapper.Characteristics.RotationSpeed
        },
        optional: {},
        // disable HomeKit fan quick action since thermostat's fan cannot be switched off independently
        onUpdate: ({ service, characteristic, newValue }) => {
          if (characteristic === 'Active' && newValue === Characteristic.Active.INACTIVE) {
            service.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.ACTIVE)
          }
        }
      }
    }
  ],
  onService: (service, { device }) => {
    // set target temperature props to match Homey's values
    const target_temperature = device.capabilitiesObj?.target_temperature;
    if (target_temperature) {
      const props = {};
      if (target_temperature.min) {
        props.minValue = target_temperature.min;
      }
      if (target_temperature.max) {
        props.maxValue = target_temperature.max;
      }
      service.getCharacteristic(Characteristic.TargetTemperature).setProps(props);
    }
  },
  onUpdate: ({ characteristic, oldValue, newValue, service, device, capability }) => {
    // set correct temperature display unit
    const opts = device.capabilitiesObj?.[capability];
    if (opts && 'units' in opts) {
      const unit = opts.units === '°F' ? 'FAHRENHEIT' : 'CELSIUS';
      service.getCharacteristic(Characteristic.TemperatureDisplayUnits).updateValue(Characteristic.TemperatureDisplayUnits[unit]);
    }

    // don't need to fake thermostat mode if the device has the real thing
    if (Mapper.Utils.hasCapability(device, 'thermostat_mode')) return;

    // If the capability 'thermostat_mode' is not used, remove all modes and
    // support only AUTO Mode (unless the device also supports `onoff`, in
    // which case we will support `AUTO` and `OFF`).
    const validValues = [ Characteristic.TargetHeatingCoolingState.AUTO ];

    if (Mapper.Utils.hasCapability(device, 'onoff')) {
      validValues.push(Characteristic.TargetHeatingCoolingState.OFF);
    }

    service.getCharacteristic(Characteristic.TargetHeatingCoolingState).updateValue(Characteristic.TargetHeatingCoolingState.AUTO);
    service.getCharacteristic(Characteristic.TargetHeatingCoolingState).setProps({
      validValues,
      maxValue: Characteristic.TargetHeatingCoolingState.AUTO,
      minValue: Characteristic.TargetHeatingCoolingState.AUTO
    });
  },
  required: {
    target_temperature:  Mapper.Characteristics.Temperature.Target,
    measure_temperature: Mapper.Characteristics.Temperature.Current,
  },
  optional : {
    onoff : {
      characteristics: Characteristic.TargetHeatingCoolingState,
      get : value => {
        return Characteristic.TargetHeatingCoolingState[ value ? 'HEAT' : 'OFF' ];
      },
      set : value => {
        return value !== Characteristic.CurrentHeatingCoolingState.OFF;
      }
    },
    thermostat_mode: [
      Mapper.Characteristics.HeatingCoolingState.Current,
      Mapper.Characteristics.HeatingCoolingState.Target,
    ],
    // Optional
    measure_humidity: Mapper.Characteristics.RelativeHumidity.Current,
  }
});
