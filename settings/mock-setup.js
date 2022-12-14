/* global Homey */
void function() {
  if (! Homey.isMock) return;
  const mockDevices = {"fc365e31-3dc3-4e3f-a9e4-2e02a5fab8c6":{"id":"fc365e31-3dc3-4e3f-a9e4-2e02a5fab8c6","name":"Homey","zoneName":"Thuis","available":true,"homekitty":{"exposed":false,"supported":true}},"d6d96a99-4d6c-4b79-a9a8-a96a458adba0":{"id":"d6d96a99-4d6c-4b79-a9a8-a96a458adba0","name":"Nefit Easy","zoneName":null,"available":null,"homekitty":{"exposed":true,"supported":true}},"ccafde03-6c28-44b8-8ace-78d867c19f48":{"id":"ccafde03-6c28-44b8-8ace-78d867c19f48","name":"HK Light","zoneName":"Thuis","available":true,"homekitty":{"exposed":true,"supported":true}},"4af95bb0-58d2-4b84-a8ad-ba17db87b599":{"id":"4af95bb0-58d2-4b84-a8ad-ba17db87b599","name":"HK Lock","zoneName":"Thuis","available":true,"homekitty":{"exposed":true,"supported":true}},"55a6875e-b1a6-4efb-86f9-06eb084dbfb1":{"id":"55a6875e-b1a6-4efb-86f9-06eb084dbfb1","name":"HK Curtains Set","zoneName":"Thuis","available":true,"homekitty":{"exposed":true,"supported":true}},"50ba3e26-c2b7-455c-8f10-b84642506c07":{"id":"50ba3e26-c2b7-455c-8f10-b84642506c07","name":"HK Blinds State","zoneName":"Thuis","available":true,"homekitty":{"exposed":true,"supported":true}},"cb65416e-34f2-4fbe-98b5-b029e77983c9":{"id":"cb65416e-34f2-4fbe-98b5-b029e77983c9","name":"HK Socket","zoneName":"Thuis","available":true,"homekitty":{"exposed":true,"supported":true}},"a9bdf1a0-57d0-4560-93a1-ca6d560bdf46":{"id":"a9bdf1a0-57d0-4560-93a1-ca6d560bdf46","name":"HK Fan","zoneName":"Thuis","available":true,"homekitty":{"exposed":true,"supported":true}},"f4d88961-ef5a-4600-ab8b-b2217f4c3656":{"id":"f4d88961-ef5a-4600-ab8b-b2217f4c3656","name":"HK Coffeemachine","zoneName":"Thuis","available":true,"homekitty":{"exposed":true,"supported":true}},"0f48db22-2d51-4e38-b758-ce677eaed53c":{"id":"0f48db22-2d51-4e38-b758-ce677eaed53c","name":"HK Remote","zoneName":"Thuis","available":true,"homekitty":{"exposed":true,"supported":true}},"8427bded-23e3-4c80-9620-b245944a2ba7":{"id":"8427bded-23e3-4c80-9620-b245944a2ba7","name":"HK Thermostat","zoneName":"Thuis","available":true,"homekitty":{"exposed":true,"supported":true}},"39384188-ef89-46ba-bed8-1891dfa5f3ed":{"id":"39384188-ef89-46ba-bed8-1891dfa5f3ed","name":"HK Doorbell","zoneName":"Thuis","available":true,"homekitty":{"exposed":true,"supported":true}},"dd498619-6745-4aa2-9381-2d531e7f4208":{"id":"dd498619-6745-4aa2-9381-2d531e7f4208","name":"HK Home Alarm","zoneName":"Thuis","available":true,"homekitty":{"exposed":true,"supported":true}},"c2d45499-1937-49f3-962b-e3063a86fa41":{"id":"c2d45499-1937-49f3-962b-e3063a86fa41","name":"HK Speaker","zoneName":"Thuis","available":true,"homekitty":{"exposed":true,"supported":true}},"0e387765-588d-492f-b6f8-539114586636":{"id":"0e387765-588d-492f-b6f8-539114586636","name":"HK Button","zoneName":"Thuis","available":true,"homekitty":{"exposed":true,"supported":true}},"3c2a9409-83cd-45d5-9741-56d4ba17fd06":{"id":"3c2a9409-83cd-45d5-9741-56d4ba17fd06","name":"HK Environmental Sensor","zoneName":"Thuis","available":true,"homekitty":{"exposed":true,"supported":true}},"87f85d32-eb24-4366-bc13-e2d78db157b0":{"id":"87f85d32-eb24-4366-bc13-e2d78db157b0","name":"HK Air Quality Sensor","zoneName":"Thuis","available":true,"homekitty":{"exposed":true,"supported":true}},"726f6151-ebb0-4576-869e-df864d9e6d09":{"id":"726f6151-ebb0-4576-869e-df864d9e6d09","name":"HK Motion Sensor","zoneName":"Thuis","available":true,"homekitty":{"exposed":true,"supported":true}},"10ae6823-7b7b-424e-a756-a0c475906479":{"id":"10ae6823-7b7b-424e-a756-a0c475906479","name":"HK Contact Sensor","zoneName":"Thuis","available":true,"homekitty":{"exposed":true,"supported":true}},"ca580e6d-007d-4908-bbaf-a7751fc29034":{"id":"ca580e6d-007d-4908-bbaf-a7751fc29034","name":"HK Garage Door","zoneName":"Thuis","available":true,"homekitty":{"exposed":true,"supported":true}},"c28c7bfe-5767-4862-933d-341cc1b5e481":{"id":"c28c7bfe-5767-4862-933d-341cc1b5e481","name":"HK Water Leak Sensor","zoneName":"Thuis","available":true,"homekitty":{"exposed":true,"supported":true}},"b3fd684c-53ac-4eaa-93ef-44a02c30a30a":{"id":"b3fd684c-53ac-4eaa-93ef-44a02c30a30a","name":"HK Sunshade Dim","zoneName":"Thuis","available":true,"homekitty":{"exposed":true,"supported":true}},"a6260d0a-fe08-4a4a-8cf8-1cab6bf8aa74":{"id":"a6260d0a-fe08-4a4a-8cf8-1cab6bf8aa74","name":"HK Heater","zoneName":"Thuis","available":true,"homekitty":{"exposed":true,"supported":true}},"d2b613a4-a407-467d-8fdb-5e15a48b9f57":{"id":"d2b613a4-a407-467d-8fdb-5e15a48b9f57","name":"HK Smoke Sensor","zoneName":"Thuis","available":true,"homekitty":{"exposed":true,"supported":true}},"351f0542-bbc0-41ff-a76c-0299a06b7bf5":{"id":"351f0542-bbc0-41ff-a76c-0299a06b7bf5","name":"HK Other Onoff","zoneName":"Thuis","available":true,"homekitty":{"exposed":true,"supported":true}}};

  Homey.loadStyleLibrary('http://192.168.23.8');
  Homey.setSettings({ 'Bridge.Identifier' : 'Homey' });
  Homey.addRoutes([{
    method: 'GET',
    path:   '/ping',
    fn:     (args, cb) => {
      setTimeout(() => {
        cb(null, 'pong');
      }, 0);
    }
  }, {
    method: 'GET',
    path:   '/devices',
    fn:     (args, cb) => {
      cb(null, mockDevices);
    }
  }, {
    method: 'PUT',
    path:   '/devices/:id',
    fn:     (args, cb) => {
      return cb('API_DEVICE_LIMIT_REACHED');
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
