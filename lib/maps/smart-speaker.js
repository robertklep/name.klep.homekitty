module.exports = (Mapper, Service, Characteristic) => ({
  class:    'speaker',
  service:  Service.SmartSpeaker,
  required: {
    speaker_playing: {
      characteristics : [ Characteristic.TargetMediaState, Characteristic.CurrentMediaState ],
      ...Mapper.Accessors.MediaState
    }
  },
  optional: {
    volume_mute: Mapper.Characteristics.Mute,
    onoff:      Mapper.Characteristics.Active,
    volume_set: Mapper.Characteristics.Volume,
  }
});

