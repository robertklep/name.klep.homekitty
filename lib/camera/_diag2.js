'use strict';

// TEMPORARY DIAGNOSTIC -- records snapshot activity into an app setting,
// because app logs are not readable from the CLI. Delete when done.

const SETTING = 'Camera.Delegate';
const MAX     = 30;

let homeyRef = null;
const events = [];
let pending  = null;

function install(homey) {
  homeyRef = homey;
  record('installed');
}

function record(message) {
  events.push(`${ new Date().toISOString().slice(11, 19) } ${ message }`);
  while (events.length > MAX) events.shift();

  if (! homeyRef || pending) return;
  pending = setTimeout(() => {
    pending = null;
    try {
      homeyRef.settings.set(SETTING, events.join(' | '));
    } catch (e) {
      // nothing useful to do here
    }
  }, 1000);
  if (pending.unref) pending.unref();
}

module.exports = { install, record, SETTING };
