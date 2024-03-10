const { Accessory, Service, Characteristic, AccessoryEventTypes, uuid } = require('../modules/hap-nodejs');

module.exports = Mapper => {
  Mapper.Characteristics = {
    OnOff:         { characteristics: Characteristic.On,               ...Mapper.Accessors.OnOff },
    Active:        { characteristics: Characteristic.Active,           ...Mapper.Accessors.Active },
    Brightness:    { characteristics: Characteristic.Brightness,       ...Mapper.Accessors.Brightness },
    Mute:          { characteristics: Characteristic.Mute,             ...Mapper.Accessors.Mute },
    Volume:        { characteristics: Characteristic.Volume,           ...Mapper.Accessors.Volume },
    RotationSpeed: { characteristics: Characteristic.RotationSpeed,    ...Mapper.Accessors.RotationSpeed },
    ProgrammableSwitchEvent : {
      characteristics : Characteristic.ProgrammableSwitchEvent,
      ...Mapper.Accessors.ProgrammableSwitchEvent.SinglePress
    },
    Temperature:   {
      Current:      { characteristics : Characteristic.CurrentTemperature, ...Mapper.Accessors.Temperature },
      Target:       { characteristics : Characteristic.TargetTemperature,  ...Mapper.Accessors.Temperature },
      DisplayUnits: {
        characteristics : Characteristic.TemperatureDisplayUnits,
        // yay metric!
        get : () => Characteristic.TemperatureDisplayUnits.CELSIUS
      }
    },
    RelativeHumidity:   {
      Current: { characteristics : Characteristic.CurrentRelativeHumidity, ...Mapper.Accessors.RelativeHumidity },
      Target:  { characteristics : Characteristic.TargetRelativeHumidity,  ...Mapper.Accessors.RelativeHumidity },
    },
    HeatingCoolingState : {
      Current: { characteristics : Characteristic.CurrentHeatingCoolingState, ...Mapper.Accessors.HeatingCoolingState.Current },
      Target:  { characteristics : Characteristic.TargetHeatingCoolingState,  ...Mapper.Accessors.HeatingCoolingState.Target },
    },
    Light:         {
      Dim:         { characteristics: Characteristic.Brightness,       ...Mapper.Accessors.Brightness, debounce: 500 },
      Hue:         { characteristics: Characteristic.Hue,              ...Mapper.Accessors.Hue },
      Saturation:  { characteristics: Characteristic.Saturation,       ...Mapper.Accessors.Saturation },
      Temperature: { characteristics: Characteristic.ColorTemperature, ...Mapper.Accessors.ColorTemperature },
    },
    WindowCoverings : {
      Set : {
        characteristics : [ Characteristic.CurrentPosition, Characteristic.TargetPosition ],
        ...Mapper.Accessors.Position
      },
      State : {
        characteristics: Characteristic.PositionState,
        ...Mapper.Accessors.PositionState
      }
    }
  };
};
