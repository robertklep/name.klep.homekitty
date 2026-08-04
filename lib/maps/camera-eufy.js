module.exports = (Mapper, Service, Characteristic, Accessory) => ({
  class    : 'camera',
  // Handled by an accessory-level CameraController, see MappedDevice#attachCamera.
  camera   : true,
  // A camera still needs a primary service; motion is the one that carries
  // real state, and it is what drives HomeKit notifications.
  service  : Service.MotionSensor,
  category : Accessory.Categories.CAMERA,
  required : {
    // Eufy publishes motion on its own notification capability. `alarm_motion`
    // exists too but lags behind it, so this is the one to key on. This is the
    // sole writer to MotionDetected; NTFY_PET_DETECTED and NTFY_VEHICLE_DETECTED
    // are classifications of this same event and would clobber each other if
    // routed to the same characteristic.
    NTFY_MOTION_DETECTION : {
      characteristics : Characteristic.MotionDetected,
      ...Mapper.Accessors.Boolean
    }
  },
  optional : {
    measure_temperature : {
      characteristics : Characteristic.CurrentTemperature,
      get             : value => value
    }
  }
});
