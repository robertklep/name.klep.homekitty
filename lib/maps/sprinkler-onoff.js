module.exports = (Mapper, Service, Characteristic) => ({
  class:    'sprinkler',
  service:  Service.IrrigationSystem,
  onService: service => {
    service.getCharacteristic(Characteristic.ProgramMode).updateValue(
      Characteristic.ProgramMode.NO_PROGRAM_SCHEDULED
    );
    service.getCharacteristic(Characteristic.Active).updateValue(
      Characteristic.Active.ACTIVE
    );
  },
  required: {
    onoff: Mapper.Characteristics.InUse
  }
});
