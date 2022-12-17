module.exports = {
  async ping({ homey }) {
    await homey.app.getBridge();
    return 'pong';
  },

  async getDevices({ homey }) {
    return homey.app.api.getDevices();
  },

  async exposeDevice({ homey, params, body }) {
    return homey.app.api.exposeDevice(params.id);
  },

  async unexposeDevice({ homey, params }) {
    return homey.app.api.unexposeDevice(params.id);
  },

  async reset({ homey, body }) {
    if (body?.value !== true) return 'ok';
    return homey.app.api.reset();
  },
};
