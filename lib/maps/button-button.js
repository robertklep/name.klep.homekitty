module.exports = (Mapper, Service, Characteristic) => ({
  class:    'button',
  service:  Service.Switch,
  required: {
    button : {
      characteristics: Characteristic.On,
      // simulate a button press
      set: async (value, { device, service, characteristic }) => {
        if (! value) return false;
        // turn the switch off after 300ms
        setTimeout(() => {
          service.getCharacteristic(characteristic).updateValue(false);
        }, 300);
        // turn the switch on
        return true;
      },
      // a button is stateless, so we will always have it turned off
      get: Mapper.Fixed.False,
    }
  },
});
