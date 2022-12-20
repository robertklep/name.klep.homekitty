module.exports = (Mapper, Service, Characteristic) => ({
  class:    [ 'curtain', 'blinds', 'sunshade', 'windowcoverings' ],
  service:  Service.WindowCovering,
  onService : (service, { device }) => {
    // if device doesn't have `windowcoverings_set` or `dim`, fake the target position
    if (Mapper.Utils.hasCapability(device, 'windowcoverings_set') || Mapper.Utils.hasCapability(device, 'dim')) return;

    service.getCharacteristic(Characteristic.TargetPosition).setProps({ minStep : 50 }).on('change', async ({ oldValue, newValue }) => {
      await device.setCapabilityValue('windowcoverings_state', newValue > 75 ? 'up' : newValue < 25 ? 'down' : 'idle');
    });
  },
  required: {
    windowcoverings_state : {
      characteristics: Characteristic.PositionState,
      get : (value, { device, service, capability }) => {
        // if device doesn't have a capability that sets its position, fake it
        if (! Mapper.Utils.hasCapability(device, 'windowcoverings_set') && ! Mapper.Utils.hasCapability(device, 'dim')) {
          for (const position of [ 'CurrentPosition', 'TargetPosition' ]) {
            service.getCharacteristic(Characteristic[position]).updateValue(value === 'up' ? 100 : value === 'down' ? 0 : 50);
          }
        }
        // XXX: we can map the state ('up', 'down', 'idle') to the matching
        // position state ('INCREASING', 'DECREASING', 'STOPPED') but this
        // seems to put iOS in a loop of continuously opening/closing/stopping
        return Characteristic.PositionState.STOPPED;
      },
      set : value => 'idle'
    }
  }
});
