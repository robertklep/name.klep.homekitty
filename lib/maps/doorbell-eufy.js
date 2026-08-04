module.exports = (Mapper, Service, Characteristic, Accessory) => ({
  class:     'doorbell',
  // NOTE: no `camera: true`. The battery doorbell registers no video with
  // Homey's videos manager, and HomeKit has no snapshot-only camera -- an
  // accessory that cannot stream is reported as unreachable. It stays a
  // bridged doorbell, which works.  Verified: device.videos is empty.
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
