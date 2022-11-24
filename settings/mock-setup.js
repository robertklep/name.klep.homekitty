/* global Homey */
void function() {
  if (! Homey.isMock) return;

  Homey.addRoutes([{
    method: 'GET',
    path:   '/devices',
    fn:     (args, cb) => {
      cb(null, HomeyMock.Devices);
    }
  }, {
    method: 'PUT',
    path:   '/devices/:id',
    fn:     (args, cb) => {
      console.log('should expose device', args);
      cb();
    }
  }, {
    method: 'DELETE',
    path:   '/devices/:id',
    fn:     (args, cb) => {
      console.log('should unexpose device', args);
      cb();
    }
  },{
    method: 'GET',
    path:   '/reset',
    fn:     function(args, cb) {
      console.log('should reset', args);
      cb();
    }
  }]);
}();
