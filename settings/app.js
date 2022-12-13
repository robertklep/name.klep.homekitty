function onHomeyReady(Homey) {
  console.log('HomeKitty Settings Ready');
  Homey.ready();
  // eslint-disable-next-line
  PetiteVue.createApp({
    // data
    devices:                    {},
    search:                     '',
    currentPage:                'main',
    bridgeIdentifier:           null,
    newBridgeIdentifier:        null,
    hasBridgeIdentifierChanged: false,
    filters:                    { exposed : true, unexposed : true },
    // methods
    onKeyUp(ev) {
      if (ev.key === 'Escape') {
        this.search = '';
      }
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
    request(method, endpoint, data) {
      return new Promise((resolve, reject) => {
        Homey.api(method, endpoint, data, (err, result) => {
          if (err) {
            console.error(err);
            Homey.alert(Homey.__('errors.apirequest') + ': ' + err.message);
            reject(err);
          } else {
            resolve(result);
          }
        });
      });
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
    // called from @vue:mounted event handler on #app
    async mounted() {
      this.bridgeIdentifier    = await this.getSetting('Bridge.Identifier');
      this.filters             = await this.getSetting('Settings.Filters') || this.filters;
      this.newBridgeIdentifier = this.bridgeIdentifier;
      const devices            = await this.getDevices();
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
