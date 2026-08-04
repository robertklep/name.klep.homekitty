module.exports = (Mapper, Service, Characteristic, Accessory) => ({
  class    : 'camera',
  // NOTE: `camera: true` is deliberately NOT set here yet. A camera has to be
  // published as its own HAP endpoint (see lib/camera/standalone.js), which
  // means the user pairs it separately in the Home app. Only the doorbell does
  // that so far; these four stay bridged as motion sensors until the pattern is
  // proven. Setting camera:true here would give each of them its own pairing.
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
