'use strict';
/**
 * lib/state.js — Kicktipp Tipp-State (persistiert in JSON)
 *
 * Zustandslos: alle Funktionen nehmen den Pfad als Parameter.
 */
const fs   = require('fs');
const path = require('path');

const DEFAULT_PATH = path.resolve(__dirname, '..', 'data', 'kicktipp_tips_state.json');

function loadState(statePath = DEFAULT_PATH) {
  try {
    return JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch {
    return { tips: {} };
  }
}

function saveState(state, statePath = DEFAULT_PATH) {
  state.lastUpdated = new Date().toISOString();
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

module.exports = { loadState, saveState, DEFAULT_PATH };
