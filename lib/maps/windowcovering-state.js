module.exports = (Mapper, Service, Characteristic) => ({
  class:     [ 'curtain', 'blinds', 'sunshade', 'windowcoverings' ],
  service:   Service.WindowCovering,
  onService: service => {
    service.getCharacteristic(Characteristic.TargetPosition).setProps({ minStep : 50 });
  },
  required: {
    windowcoverings_state : {
      characteristics: [ Characteristic.CurrentPosition, Characteristic.TargetPosition, Characteristic.PositionState ],
      get : (value, { device, service, characteristic, capability }) => {
        if (characteristic === 'PositionState') {
          return Characteristic.PositionState[value === 'up' ? 'INCREASING' : value === 'down' ? 'DECREASING' : 'STOPPED' ];
        } else {
          return value === 'up' ? 100 : value === 'down' ? 0 : 50;
        }
      },
      set : (value, { characteristic }) => {
        return value === 100 ? 'up' : value === 0 ? 'down' : 'idle';
      }
    }
  },
  forbidden : [ 'dim', 'windowcoverings_set' ]
});
