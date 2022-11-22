module.exports = {
  async getDevices({ homey }) {
    return homey.app.api.getDevices();
  },

  async exposeDevice({ homey, params, body }) {
    return homey.app.api.exposeDevice(params.id, false);
  },

  async unexposeDevice({ homey, params }) {
    return homey.app.api.unexposeDevice(params.id, false);
  },

  async reset({ homey }) {
    homey.app.log('reset');
    return 'ok';
  },
};
