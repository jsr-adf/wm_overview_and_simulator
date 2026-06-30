#!/usr/bin/env node
/**
 * scripts/kicktipp_http.js — Kicktipp Autofill CLI
 *
 * Iteriert alle Spieltage, berechnet Tipps und trägt sie auf Kicktipp ein.
 *
 * Usage:
 *   node scripts/kicktipp_http.js          # interaktiv
 *   node scripts/kicktipp_http.js --yes    # ohne Bestätigung (Cron/launchd)
 *
 * Konfiguration: SESSION + LOGIN Constants unten aktualisieren wenn Cookie abläuft.
 * Für neue Turniere: GROUP, SAISONID und KO_SPIELTAG_START anpassen.
 */
'use strict';

const fs       = require('fs');
const path     = require('path');
const readline = require('readline');

const { KickTippClient }  = require('../lib/kicktipp');
const { createModel }     = require('../lib/model');
const { buildNameMap }    = require('../lib/nameMap');
const { loadState, saveState } = require('../lib/state');

// ─── Konfiguration ────────────────────────────────────────────────────────────
const ROOT    = path.resolve(__dirname, '..');
const GROUP   = 'buli06-tipp';
const SAISONID = '4729275';
const SESSION  = 'YWIyM2EzMmQtODFlYS00ODM1LTkzMjItZWNiMzE4YTNjYzJi';
const LOGIN    = 'dHNjaGFrJTQwd2ViLmRlOjE4MTQzNDA5MTE3NzI6U0hBMjU2Ojk0NTg4NjkxZDRhODFhYWIxNmZlMTBkZTkxZjQwNzc2NWZkNzJmZWI1MGNlOTM4MDY2NWI1Yzc0MWVjNGMxYmQ';

// Ab welchem Spieltag-Index beginnt die KO-Runde? (WM 2026: 11, EM: anpassen)
const KO_SPIELTAG_START = 11;
// Wie viele leere Spieltage in Folge bis Abbruch?
const MAX_CONSECUTIVE_EMPTY = 13;

// ─── Daten laden ─────────────────────────────────────────────────────────────
const simData = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/wm_2026_simulation_data.json'), 'utf8'));
const odds    = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/wm_2026_odds_snapshot.json'), 'utf8'));

const oddsMap = {};
odds.matches.forEach(o => { if (o.market1x2) oddsMap[o.matchNumber] = o.market1x2.noVigProbability; });

const koOddsMap = {};
try {
  const koData = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/ko_odds.json'), 'utf8'));
  Object.assign(koOddsMap, koData.matches || {});
  console.log(`  📊 KO-Quoten: ${Object.keys(koOddsMap).length} Spiele (${koData.fetchedAt?.slice(0, 16) || 'n/a'})`);
} catch { /* kein ko_odds.json vorhanden */ }

const model              = createModel(simData, oddsMap, koOddsMap);
const { resolveCode }    = buildNameMap(simData.teams);
const client             = new KickTippClient({ session: SESSION, login: LOGIN, group: GROUP, saisonId: SAISONID });

// Gruppenphase-Tipps vorberechnen
const TIPS = {};
const MATCH_BY_CODE = {};
simData.matches.forEach(m => {
  TIPS[`${m.home.code}|${m.away.code}`] = model.bestScore(m.home.code, m.away.code, { matchNumber: m.number });
  MATCH_BY_CODE[`${m.home.code}|${m.away.code}`] = m;
});

// ─── Spieltag verarbeiten ────────────────────────────────────────────────────
async function processSpieltag(index, state, seenGameIds) {
  const parsed = await client.fetchSpieltag(index);
  if (!parsed) return { index, count: 0 };

  const { hidden, games } = parsed;
  if (games.length === 0) return { index, count: 0 };

  // Loop-Erkennung
  if (seenGameIds && games.every(g => seenGameIds.has(g.id))) {
    return { index, count: games.length, loopDetected: true };
  }
  if (seenGameIds) games.forEach(g => seenGameIds.add(g.id));

  const postData  = { ...hidden };
  const isKO      = index >= KO_SPIELTAG_START;
  let filled = 0, kept = 0;
  const unknown      = [];
  const stateEntries = [];

  for (const g of games) {
    const hCode = resolveCode(g.heimName);
    const gCode = resolveCode(g.gastName);
    const heimField = `spieltippForms[${g.id}].heimTipp`;
    const gastField = `spieltippForms[${g.id}].gastTipp`;

    if (!hCode || !gCode) {
      postData[heimField] = g.existHeim;
      postData[gastField] = g.existGast;
      unknown.push(`${g.heimName} vs ${g.gastName}`);
      kept++;
      continue;
    }

    const match = MATCH_BY_CODE[`${hCode}|${gCode}`];
    const tip   = TIPS[`${hCode}|${gCode}`]
               || model.bestScore(hCode, gCode, { noDraws: isKO });

    postData[heimField] = String(tip.h);
    postData[gastField] = String(tip.a);

    stateEntries.push({
      id:           g.id,
      spieltagIndex: index,
      matchNumber:  match?.number ?? null,
      heimName:     g.heimName,
      gastName:     g.gastName,
      heimCode:     hCode,
      gastCode:     gCode,
      tip:          { h: tip.h, a: tip.a },
      oddsAtTip:    model.blendedProbs(hCode, gCode, match?.number ?? null),
      tippedAt:     new Date().toISOString(),
    });

    const prev = g.existHeim !== '' ? ` (war ${g.existHeim}:${g.existGast})` : '';
    console.log(`    ${hCode.padEnd(4)} ${tip.h}–${tip.a}  ${gCode.padEnd(4)}${prev}`);
    filled++;
  }

  if (filled === 0) return { index, count: games.length, filled: 0, kept, unknown };

  const ok = await client.submitTips(postData);

  if (ok) {
    state.tips[`spieltag${index}`] = stateEntries;
    saveState(state);

    const verified = await client.verifySpieltag(index);
    if (verified.length) {
      console.log(`    ✅ Kicktipp bestätigt: ${verified.map(v => `${v.heim} ${v.hv}:${v.gv} ${v.gast}`).join(', ')}`);
    }
  }

  return { index, count: games.length, filled, kept, unknown, saved: ok };
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🏆  Kicktipp HTTP-Autofill');
  console.log('═'.repeat(44));

  const user = await client.checkLogin();
  if (!user) {
    console.error('❌ Session abgelaufen — bitte neuen SESSION-Cookie eintragen.');
    process.exit(1);
  }
  console.log(`✅ Eingeloggt\n`);

  const autoYes = process.argv.includes('--yes');
  if (!autoYes) {
    const rl  = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ans = await new Promise(r => rl.question('Alle Spieltage tippen? (j/n)  ', r));
    rl.close();
    if (ans.toLowerCase() !== 'j') { console.log('Abgebrochen.'); return; }
  } else {
    console.log('--yes: automatisch bestätigt\n');
  }

  const state        = loadState();
  const seenGameIds  = new Set();
  let totalFilled    = 0, totalGames = 0, consecutiveEmpty = 0;

  for (let i = 1; i <= 30; i++) {
    process.stdout.write(`Spieltag ${String(i).padStart(2)}  `);
    const res = await processSpieltag(i, state, seenGameIds);

    if (res.count === 0) {
      consecutiveEmpty++;
      if (consecutiveEmpty >= MAX_CONSECUTIVE_EMPTY) { console.log('— Ende (keine Spiele mehr)'); break; }
      console.log('— leer / Deadline abgelaufen, weiter...');
      continue;
    }
    consecutiveEmpty = 0;

    if (res.loopDetected) { console.log('— Ende (Kicktipp-Loop erkannt)'); break; }

    if      (res.filled === 0) console.log(`${res.count} Spiele — alle unbekannt oder bereits getippt`);
    else if (res.saved)        console.log(`✅ ${res.filled}/${res.count} Spiele gespeichert`);
    else                       console.log(`⚠️  nicht gespeichert`);

    if (res.unknown?.length) console.log(`    ⚠️  Unbekannt: ${res.unknown.join(', ')}`);

    totalFilled += res.filled || 0;
    totalGames  += res.count  || 0;
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\n${'─'.repeat(44)}`);
  console.log(`✅  ${totalFilled} Tipps eingetragen (von ${totalGames} Spielen gesamt)\n`);
}

main().catch(err => { console.error('Fehler:', err.message); process.exit(1); });
