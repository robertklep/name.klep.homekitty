module.exports = (Mapper, Service, Characteristic) => ({
  class:    'button',
  service:  Service.Switch,
  required: {
    button : {
      characteristics: Characteristic.On,
      // simulate a button press
      set: async (value, { device, service, characteristic }) => {
        if (! value) return false;
        // turn the switch on
        await device.setCapabilityValue('button', true);
        // turn the switch off again after 300ms
        setTimeout(() => {
          device.setCapabilityValue('button', false);
          service.getCharacteristic(characteristic).updateValue(false);
        }, 300);
        return true;
      },
      // a button is stateless, so we will always have it turned off
      get: Mapper.Fixed.False,
    }
  },
});
