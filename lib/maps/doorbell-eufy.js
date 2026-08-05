module.exports = (Mapper, Service, Characteristic, Accessory) => ({
  class:     'doorbell',
  // The battery doorbell registers no video with Homey's videos manager, but it
  // does publish a snapshot image, and that is enough: HomeKit renders a stills
  // camera perfectly well. (An earlier note here claimed HomeKit has no
  // snapshot-only camera -- that was wrong. iOS was rejecting the accessory
  // because it advertised audio support with no Microphone service.)
  camera:    true,
  service:   Service.Doorbell,
  category:  Accessory.Categories.VIDEO_DOORBELL,
  onService: service => { service.setPrimaryService(true) }, // XXX: is this strictly necessary?
  required: {
    NTFY_PRESS_DOORBELL : {
      characteristics : Characteristic.ProgrammableSwitchEvent,
      get : (value, { capability }) => {
        if (! capability || ! value) return null;
        return Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS;
      }
    }
  }
});
