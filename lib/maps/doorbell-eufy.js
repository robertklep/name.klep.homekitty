module.exports = (Mapper, Service, Characteristic, Accessory) => ({
  class:     'doorbell',
  // Handled by an accessory-level CameraController, see MappedDevice#attachCamera.
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
