module.exports = (Mapper, Service, Characteristic) => {
  const { STAY_ARM, AWAY_ARM, NIGHT_ARM, DISARMED, ALARM_TRIGGERED } = Characteristic.SecuritySystemCurrentState;
  const { DISARM }                                                   = Characteristic.SecuritySystemTargetState;

  const characteristic = {
    characteristics : [ Characteristic.SecuritySystemCurrentState, Characteristic.SecuritySystemTargetState ],
    get : (value, device, service, characteristic) => {
      // Check various alarm capabilities of the device to see if any of them are triggered while the system is armed.
      // XXX: make this configurable somehow?
      if (characteristic === Characteristic.SecuritySystemCurrentState && (value === 'armed' || value === 'partially_armed')) {
        for (const alarm of [ 'alarm_tamper', 'alarm_generic', 'alarm_contact', 'alarm_motion', 'alarm_heimdall', 'alarm_vibration' ]) {
          if (Mapper.Utils.hasCapabilityWithValue(device, alarm, true)) {
            return ALARM_TRIGGERED;
          }
        }
      }

      // If not, map homealarm_state value
      switch(value) {
        case 'armed':           return AWAY_ARM;
        case 'partially_armed': return STAY_ARM; // or NIGHT_ARM?
        case 'disarmed':        // fall-through
        default:                return DISARMED;
      }
    },
    set : value => {
      switch(value) {
        case AWAY_ARM:  return 'armed';
        case STAY_ARM:  // fall-through
        case NIGHT_ARM: return 'partially_armed';
        case DISARM:    // fall-through
        default:        return 'disarmed';
      }
    }
  };

  const onTrigger = {
    characteristics: Characteristic.SecuritySystemCurrentState,
    get:             (value, device, service) => {
      // if the trigger was turned off, we don't have to do anything
      if (! value) return Mapper.Constants.NO_VALUE;

      // get current and target state
      const currentState = service.getCharacteristic(Characteristic.SecuritySystemCurrentState)?.value;
      const targetState  = service.getCharacteristic(Characteristic.SecuritySystemTargetState)?.value;

      // check if any of the states are set to armed; if so, trigger the alarm
      const armedStates = [ STAY_ARM, AWAY_ARM, NIGHT_ARM ];
      if (armedStates.includes(currentState) || armedStates.includes(targetState)) {
        return ALARM_TRIGGERED;
      }
      return Mapper.Constants.NO_VALUE;
    }
  };

  return {
    class:    'homealarm',
    service:  Service.SecuritySystem,
    required: {
      homealarm_state : characteristic
    },
    optional : {
      alarm_tamper : {
        // TODO: update SecuritySystemCurrentState!
        characteristics : Characteristic.StatusTampered,
        ...Mapper.Accessors.Boolean
      },
    },
    // the following capabilities serve as triggers (when they change they will
    // (potentially) update the current alarm state)
    triggers : {
      alarm_generic:   onTrigger,
      alarm_contact:   onTrigger,
      alarm_motion:    onTrigger,
      alarm_heimdall:  onTrigger,
      alarm_vibration: onTrigger,
    },
  };
};
