function onHomeyReady(Homey) {
  console.log('HomeKitty Settings Ready');
  Homey.ready();
  // eslint-disable-next-line
  PetiteVue.createApp({
    // data
    isLoading:                  true,
    devices:                    {},
    search:                     '',
    currentPage:                'main',
    bridgeIdentifier:           null,
    newBridgeIdentifier:        null,
    hasBridgeIdentifierChanged: false,
    newDevicePublish:           true,
    filters:                    { exposed : true, unexposed : true },
    // methods
    onKeyUp(ev) {
      if (ev.key === 'Escape') {
        this.search = '';
      }
    },
    async onChangeNewDevicePublish(ev) {
      await this.setSetting('Settings.NewDevicePublish', this.newDevicePublish);
    },
    async onChangeFilter(ev) {
      await this.setSetting('Settings.Filters', this.filters);
    },
    getSetting(name) {
      return new Promise((resolve, reject) => {
        Homey.get(name, (err, result) => {
          err ? reject(err) : resolve(result);
        });
      });
    },
    setSetting(name, value) {
      return new Promise((resolve, reject) => {
        Homey.set(name, value, err => {
          err ? reject(err) : resolve(value);
        });
      });
    },
    _request(method, endpoint, data) {
      return new Promise((resolve, reject) => {
        Homey.api(method, endpoint, data, (err, result) => {
          if (err) {
            reject(err);
          } else {
            resolve(result);
          }
        });
      });
    },
    async request(method, endpoint, data) {
      try {
        return this._request(method, endpoint, data);
      } catch(err) {
        console.error(err);
        Homey.alert(Homey.__('errors.apirequest') + ': ' + err.message);
        throw err;
      }
    },
    async getDevices() {
      console.log('getting devices');
      let devices  = await this.request('GET', '/devices');
      this.devices = Object.values(devices);
      console.log(`loaded ${ this.devices.length } devices`);
    },
    setPage(page) {
      this.currentPage = page;
    },
    isActive(page) {
      if (this.currentPage == page) {
        return 'is-active';
      } else {
        return;
      }
    },
    async exposeDevice(device) {
      console.log('exposing device', device.id, device.name, device.class)
      try {
        await this.request('PUT', '/devices/' + device.id, device);
        this.devices.find(d => d.id === device.id).homekitty.exposed = true;
      } catch(e) {}
    },
    async unexposeDevice(device) {
      console.log('unexposing device', device.id, device.name, device.class)
      try {
        await this.request('DELETE', '/devices/' + device.id, device);
        this.devices.find(d => d.id === device.id).homekitty.exposed = false;
      } catch(e) {}
    },
    async setExposureState(state) {
      await this.setSetting('Settings.SetExposureState', state);
      Homey.alert(Homey.__('settings.expose-all.restart-app'));
      await this.loadSettings();
    },
    isValidIdentifier() {
      const ident = this.newBridgeIdentifier;
      return ident && ident !== this.bridgeIdentifier && ident.match(/^\S{2,}.*\S$/);
    },
    async setBridgeIdentifier() {
      Homey.confirm(Homey.__('settings.identifier.confirmation'), 'warning', async (err, response) => {
        if (response !== true) return;
        try {
          await this.setSetting('Bridge.Identifier', this.newBridgeIdentifier);
          Homey.alert(Homey.__('settings.identifier.restart-app'));
          this.bridgeIdentifier = this.newBridgeIdentifier;
          await this.loadSettings();
        } catch(e) {
          console.error(e);
          Homey.alert('Error', e.message);
        }
      });
    },
    async resetHomeKitty() {
      Homey.confirm(Homey.__('settings.reset.confirmation'), 'warning', async (err, response) => {
        if (response === true) {
          await this.request('POST', '/reset', { value : response });
          Homey.alert(Homey.__('settings.reset.restart-app'));
          await this.loadSettings();
        }
      });
    },
    getSetting(key) {
      return new Promise((resolve, reject) => {
        Homey.get(key, (err, result) => err ? reject(err) : resolve(result ?? null));
      });
    },
    setSetting(key, value) {
      return new Promise((resolve, reject) => {
        Homey.set(key, value, err => err ? reject(err) : resolve(value));
      });
    },
    async onAppReady() {
      const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

      this.isLoading = true;
      while (true) {
        try {
          await this._request('GET', '/ping');
          break;
        } catch(e) {
          await delay(1000);
        }
      }
      this.isLoading = false;
    },
    // load settings
    async loadSettings() {
      // wait for app to become ready
      await this.onAppReady();

      // load settings
      this.bridgeIdentifier    = await this.getSetting('Bridge.Identifier');
      this.filters             = await this.getSetting('Settings.Filters') || this.filters;
      this.newDevicePublish    = await this.getSetting('Settings.NewDevicePublish') ?? true;
      this.newBridgeIdentifier = this.bridgeIdentifier;
      this.currentPage         = 'main';
      await this.getDevices();
    },
    // called from @vue:mounted event handler on #app
    async mounted() {
      await this.loadSettings();

      // swiping right returns to main page
      document.addEventListener('swiped-right', e => {
        this.setPage('main');
      });
      // watch for changes in exposed state, then reload devices
      Homey.on('settings.set', async (key) => {
        if (key === 'HomeKit.Exposed') {
          // XXX: disabled for now to prevent excessive loading of device data
          // await this.getDevices();
        }
      });
    },
    get filteredItems() {
      const filter = device => {
        if (device.available && device.homekitty.supported) {
          if (this.filters.exposed   &&   device.homekitty.exposed) return true;
          if (this.filters.unexposed && ! device.homekitty.exposed) return true;
          return false;
        }
        return this.filters.unsupported;
      };
      const options = {
        keys:               [ 'name', 'zoneName', 'class' ],
        shouldSort:         true,
        findAllMatches:     true,
        threshold:          0.6,
        location:           0,
        distance:           100,
        maxPatternLength:   32,
        minMatchCharLength: 2
      };
      // eslint-disable-next-line
      const fuse = new Fuse(this.devices, options);
      if (this.search.length > 2) {
        return fuse.search(this.search).filter(filter);
      } else {
        return this.devices.filter ? this.devices.filter(filter) : this.devices;
      }
    },
  }).mount('#homekitty');
}
