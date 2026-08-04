'use strict';

const { readFileSync } = require('node:fs');
const { join }         = require('node:path');

// NOTE: `app.js` chdir()s into the persistence directory during onInit, so this
// path must be resolved from __dirname. A relative path would resolve there.
const PLACEHOLDER_PATH = join(__dirname, '..', '..', 'assets', 'camera', 'placeholder.jpg');

let cached = null;

// Served when a real snapshot cannot be fetched. Returning nothing instead
// makes HomeKit mark the whole accessory unresponsive.
function getPlaceholder() {
  if (! cached) {
    cached = readFileSync(PLACEHOLDER_PATH);
  }
  return cached;
}

module.exports = { getPlaceholder, PLACEHOLDER_PATH };
