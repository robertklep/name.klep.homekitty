'use strict';

const { createHash } = require('node:crypto');
const { Accessory }  = require('../../modules/hap-nodejs');

// HomeKit will not use a camera that sits behind a bridge. A bridge is a single
// HAP endpoint, and a camera has to *be* the endpoint — iOS simply ignores the
// camera services on a bridged accessory and never requests a snapshot.
// Verified on hardware: with one camera bridged, and with five, no snapshot
// request ever arrived. This is the same constraint that gives Homebridge its
// `publishExternalAccessories` API.
//
// So camera accessories are published standalone: their own HAP server, their
// own port and username, paired individually in the Home app.

const PORT_MIN = 41000;
const PORT_MAX = 41999;

// Derived from the device id rather than random, so a camera keeps its identity
// — and therefore its HomeKit pairing — across app restarts and reinstalls.
function credentialsFor(deviceId) {
  const hash  = createHash('sha256').update(String(deviceId)).digest();
  // First octet must be locally administered (bit 1 set) and unicast (bit 0
  // clear), or the accessory is not a valid HAP endpoint.
  const first = (hash[0] & 0xfe) | 0x02;
  const bytes = [ first, hash[1], hash[2], hash[3], hash[4], hash[5] ];

  return {
    username : bytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(':'),
    port     : PORT_MIN + (hash.readUInt16BE(6) % (PORT_MAX - PORT_MIN + 1)),
  };
}

// Publish `accessory` as its own HAP endpoint. Returns the pairing details so
// the caller can surface them — the user has to pair each camera by hand.
async function publishStandalone({ accessory, deviceId, category, pincode, setupID, resetPairing = false, log = () => {} }) {
  const { username, port } = credentialsFor(deviceId);

  // A standalone accessory keeps its own pairing record. If it restarts while
  // the Home app removes it, the two sides disagree for good: the accessory
  // keeps advertising sf=0, so it refuses new pairings AND stays invisible in
  // "Add Accessory", while iOS reports it unreachable. Nothing in the Home app
  // can recover that -- clearing the stored pairing is the only way out.
  if (resetPairing) {
    try {
      Accessory.cleanupAccessoryData(username);
      log('cleared stored pairing; accessory is pairable again');
    } catch (e) {
      log(`could not clear stored pairing: ${ e.message }`);
    }
  }

  // Must be set before publish: for a standalone accessory this is what tells
  // iOS it is a camera. (Bridged accessories never carry a category at all.)
  accessory.category = category;

  await accessory.publish({
    username,
    port,
    pincode,
    category,
    setupID,
    addIdentifyingMaterial : true,
  });

  log(`published standalone on port ${ port } as ${ username } — pair with ${ pincode }`);
  return { username, port, pincode };
}

module.exports = { credentialsFor, publishStandalone, PORT_MIN, PORT_MAX };
