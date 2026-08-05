'use strict';
// TEMPORARY: records the stream negotiation into an app setting.
const SETTING = 'Camera.Stream';
const MAX = 40;
let homeyRef = null; const events = []; let pending = null;
function install(homey) { homeyRef = homey; record('--- started ---'); }
function record(message) {
  events.push(`${ new Date().toISOString().slice(11,19) } ${ message }`);
  while (events.length > MAX) events.shift();
  if (! homeyRef || pending) return;
  pending = setTimeout(() => {
    pending = null;
    try { homeyRef.settings.set(SETTING, events.join(' | ')); } catch (e) {}
  }, 700);
  if (pending.unref) pending.unref();
}
module.exports = { install, record, SETTING };
