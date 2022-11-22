/* global Homey */
void function() {
  if (! Homey.isMock) return;

  Homey.setSettings({
    pairedDevices : { 1 : true, 2 : false, 3 : true }
  });

  Homey.addRoutes([
    {
      method: 'GET',
      path:   '/devices',
      fn:     function(args, cb) {
        cb(null, HomeyMock.Devices);
      }
    },
    {
      method: 'GET',
      path:   '/reset',
      fn:     function(args, cb) {
        console.log('reset', args);
        cb();
      }
    }
  ]);

  Homey.registerOnHandler('log.new', function(ev, cb) {
    cb([
      { time : '10:12', type : 'info',    string : 'This is an info line' },
      { time : '10:13', type : 'success', string : 'This is a success line' },
      { time : '10:19', type : 'error',   string : 'This is an error line' },
      { time : '10:32', type : 'success', string : 'This is another success line' },
      { time : '10:19',                   string : 'This is an undefined line' },
    ]);
  });
}();
