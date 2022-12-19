function onHomeyReady(Homey) {
  console.log('HomeKitty Settings Ready');
  Homey.ready();

  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

  // eslint-disable-next-line
  PetiteVue.createApp({
    // data
    isLoading:                  true,
    isRestarting:               false,
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
    alert(msg, icon = null) {
      return new Promise(resolve => {
        Homey.alert(msg, icon, resolve);
      });
    },
    confirm(msg, icon = null) {
      return new Promise(resolve => {
        Homey.confirm(msg, icon, (_, response) => resolve(response));
      });
    },
    _request(method, endpoint, data = {}) {
      return new Promise((resolve, reject) => {
        Homey.api(method, endpoint, data, (err, result) => {
          if (err) {
            reject(String(err).replace(/^Error:\s*/, ''));
          } else {
            resolve(result);
          }
        });
      });
    },
    async request(method, endpoint, data) {
      try {
        return await this._request(method, endpoint, data);
      } catch(err) {
        console.error('API request error:', err);
        await this.alert(Homey.__(`errors.${ err }`) || Homey.__('errors.API_REQUEST_FAILED'), 'error');
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
    async changeExposureStateForDevice(id, target) {
      const state     = target.checked;
      let updateState = true;
      console.log(`changing exposure state for device ${ id } to ${ state }`);
      try {
        await this.request(state ? 'PUT' : 'DELETE', '/devices/' + id);
      } catch(e) {
        if (e !== 'API_DEVICE_UNAVAILABLE') {
          updateState = false;
          target.checked = ! state;
        }
      }
      if (updateState) {
        this.devices.find(d => d.id === id).homekitty.exposed = state;
      }
    },
    async setExposureState(state) {
      this.isRestarting = true;
      await this.alert(Homey.__('settings.expose-all.restart-app'), 'info');
      await this.setSetting('Settings.SetExposureState', state);
    },
    isValidIdentifier() {
      const ident = this.newBridgeIdentifier;
      return ident && ident !== this.bridgeIdentifier && ident.match(/^\S{2,}.*\S$/);
    },
    async setBridgeIdentifier() {
      const response = await this.confirm(Homey.__('settings.identifier.confirmation'), 'warning');
      if (response !== true) return;
      try {
        this.isRestarting = true;
        await this.alert(Homey.__('settings.identifier.restart-app'), 'info');
        await this.setSetting('Bridge.Identifier', this.newBridgeIdentifier);
        this.bridgeIdentifier = this.newBridgeIdentifier;
      } catch(e) {
        console.error(e);
        await this.alert('Error: ' + e.message, 'error');
      }
    },
    async resetHomeKitty() {
      const response = await Homey.confirm(Homey.__('settings.reset.confirmation'), 'warning');
      if (response !== true) return;
      this.isRestarting = true;
      await this.request('POST', '/reset', { value : response });
      await this.alert(Homey.__('settings.reset.restart-app'), 'info');
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
    // called from @vue:mounted event handler on #app
    async mounted() {
      // wait for app to become ready
      await this.onAppReady();

      // load settings
      this.bridgeIdentifier    = await this.getSetting('Bridge.Identifier');
      this.filters             = await this.getSetting('Settings.Filters') || this.filters;
      this.newDevicePublish    = await this.getSetting('Settings.NewDevicePublish') ?? true;
      this.newBridgeIdentifier = this.bridgeIdentifier;
      this.currentPage         = 'main';

      // load devices
      await this.getDevices();

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
        if (device.homekitty.supported) {
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
