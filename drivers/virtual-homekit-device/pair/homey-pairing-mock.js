if (! window.Homey) {
  window.Homey = new (class Homey {
    constructor() {
      this.isMock         = true;
      this.zone           = null;
      this.currentView    = null;
      this._nextView      = null;
      this._prevView      = null;
      this.viewOptions    = {};
      this.viewStores     = {};
      this.emitHandlers   = {};
      this.onHandlers     = {};
      this.loadingOverlay = null;
    }

    // Mock API
    loadStyleLibrary(homeyUrl) {
      const link = document.createElement('link');
      link.type  = 'text/css';
      link.rel   = 'stylesheet';
      link.href  = new URL('/manager/webserver/assets/css/homey.css', homeyUrl).toString();
      document.querySelector('head').appendChild(link);
    }

    registerEmitHandler(event, fn) {
      this.emitHandlers[event] = fn;
    }

    registerOnHandler(event, fn) {
      this.onHandlers[event] = fn;
    }

    setZone(zone) {
      this.zone = zone;
    }

    setNextView(view) {
      this._nextView = view;
    }

    setPrevView(view) {
      this._prevView = view;
    }

    setOptions(viewId, opts) {
      this.viewOptions[viewId] = opts;
    }

    setViewStore(viewId, store) {
      this.viewStores[viewId] = store;
    }

    // Regular API.
    async emit(event, ...data) {
      let handler = this.emitHandlers[event];
      if (handler) {
        return handler(event, data);
      }
      return undefined;
    }

    async on(event, fn) {
      let handler = this.onHandlers[event];
      if (! handler) return;
      return await handler(event, fn);
    }

    setTitle(title) {
    }

    setSubtitle(title) {
    }

    showView(view) {
      if (! view) {
        return this.alert('View not set', 'error');
      }
      this.currentView = view;
      location = view + '.html';
    }

    prevView() {
      return this.showView(this._prevView);
    }

    nextView() {
      return this.showView(this._nextView);
    }

    getCurrentView() {
      return this.currentView;
    }

    async createDevice(device) {
      console.log('should add device', device);
      return true; // not documented what result should be
    }

    async getZone() {
      return this.zone;
    }

    async getOptions(viewId) {
      return this.viewOptions[viewId];
    }

    setNavigationClose() {
      return this.done();
    }

    done() {
      return this.alert('Done', 'info');
    }

    async alert(msg, icon) {
      if (typeof icon === 'function') cb = icon, icon = null;
      alert(msg);
    }

    async confirm(msg, icon) {
      if (typeof icon === 'function') cb = icon, icon = null;
      return confirm(msg);
    }

    popup(url, { width = 400, height = 400 } = {}) {
      window.open(url, '', `width=${ width },height=${ height }`);
    }

    __(key, tokens) {
      return key;
    }

    showLoadingOverlay() {
      if (this.loadingOverlay) return;
      this.loadingOverlay = document.createElement('div');
      this.loadingOverlay.innerHTML = `
<div style='position:fixed;top:0;right:0;bottom:0;left:0;z-index:1000;background:rgba(0,0,0,0.7)'>
  <div style='position:absolute;top:50%;left:50%;border:1px solid black;transform:translate(-50%);color:white;font-size:200%;padding:0.5em 1em;border-radius:0.5em'>
    LOADING
  </div>
</div>
      `;
      document.body.appendChild(this.loadingOverlay);
    }

    hideLoadingOverlay() {
      if (! this.loadingOverlay) return;
      document.body.removeChild(this.loadingOverlay);
      this.loadingOverlay = null;
    }

    async getViewStoreValue(viewId, key) {
      return this.viewStores[viewId]?.[key];
    }

    async setViewStoreValue(viewId, key, value) {
      if (! this.viewStores[viewId]) {
        this.viewStores[viewId] = {};
      }
      this.viewStores[viewId][key] = value;
    }
  })();
}
