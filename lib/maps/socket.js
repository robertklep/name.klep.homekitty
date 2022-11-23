module.exports = (Mapper, Service, Characteristic) => ({
  class:    'socket',
  group:    true,
  service:  Service.Outlet,
  required: { onoff : Mapper.Characteristics.OnOff }
});
