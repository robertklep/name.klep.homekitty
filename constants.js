module.exports = {
  // DON'T CHANGE THESE UNLESS YOU KNOW WHAT YOU'RE DOING
  BRIDGE_FIRMWARE_REVISION:     '3.0',
  PERSISTENCE_DIRECTORY_PREFIX: '/userdata/homekitty-persist',
  // defaults
  DEFAULT_BRIDGE_IDENTIFIER:    'HomeKitty',
  DEFAULT_USERNAME:             'FA:CE:13:37:CA:75',
  DEFAULT_PORT:                 31337,
  DEFAULT_SETUP_ID:             '1337',
  DEFAULT_PIN_CODE:             '133-71-337', // XXX: needs this formatting
  // settings keys
  SETTINGS_BRIDGE_IDENTIFIER:   'Bridge.Identifier',
  SETTINGS_BRIDGE_USERNAME:     'Bridge.Username',
  SETTINGS_BRIDGE_PORT:         'Bridge.Port',
  SETTINGS_BRIDGE_SETUP_ID:     'Bridge.SetupID',
  SETTINGS_BRIDGE_PINCODE:      'Bridge.Pincode',
  SETTINGS_EXPOSE_MAP:          'HomeKit.Exposed',
};
