#!/usr/bin/env node
/**
 * scripts/kicktipp_swing_check.js — Kicktipp Swing-Check CLI
 *
 * Läuft täglich nach dem Odds-Update:
 *   1. Lädt gespeicherte Tipps (kicktipp_tips_state.json)
 *   2. Vergleicht mit aktuellen Quoten (wm_2026_odds_snapshot.json)
 *   3. Zeigt "Swings" — Spiele, bei denen sich der beste Tipp geändert hat
 *      oder die Wahrscheinlichkeit signifikant verschoben hat
 *   4. Fragt pro Swing: updaten? (j/n/alle)
 *   5. Postet Änderungen an Kicktipp und aktualisiert den State
 *
 * Usage: node scripts/kicktipp_swing_check.js [--threshold 0.08]
 */
'use strict';

const fs       = require('fs');
const path     = require('path');
const readline = require('readline');

const { KickTippClient }       = require('../lib/kicktipp');
const { createModel }          = require('../lib/model');
const { loadState, saveState } = require('../lib/state');

// ─── Konfiguration ────────────────────────────────────────────────────────────
const ROOT      = path.resolve(__dirname, '..');
const GROUP     = 'buli06-tipp';
const SAISONID  = '4729275';
const SESSION   = 'YWIyM2EzMmQtODFlYS00ODM1LTkzMjItZWNiMzE4YTNjYzJi';
const LOGIN     = 'dHNjaGFrJTQwd2ViLmRlOjE4MTQzNDA5MTE3NzI6U0hBMjU2Ojk0NTg4NjkxZDRhODFhYWIxNmZlMTBkZTkxZjQwNzc2NWZkNzJmZWI1MGNlOTM4MDY2NWI1Yzc0MWVjNGMxYmQ';

const args = process.argv.slice(2);
const SWING_THRESHOLD = (() => {
  const i = args.indexOf('--threshold');
  return i >= 0 ? parseFloat(args[i + 1]) || 0.08 : 0.08;
})();

// ─── Daten laden ─────────────────────────────────────────────────────────────
const simData = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/wm_2026_simulation_data.json'), 'utf8'));
const odds    = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/wm_2026_odds_snapshot.json'), 'utf8'));

const oddsMap = {};
odds.matches.forEach(o => { if (o.market1x2) oddsMap[o.matchNumber] = o.market1x2.noVigProbability; });

const koOddsMap = {};
try {
  const koData = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/ko_odds.json'), 'utf8'));
  Object.assign(koOddsMap, koData.matches || {});
} catch { /* kein ko_odds.json */ }

const model  = createModel(simData, oddsMap, koOddsMap);
const client = new KickTippClient({ session: SESSION, login: LOGIN, group: GROUP, saisonId: SAISONID });

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────
function outcome(h, a) { return h > a ? 'home' : h < a ? 'away' : 'draw'; }
function pct(p)        { return (p * 100).toFixed(1) + '%'; }
function arrow(delta) {
  if (delta >  0.04) return '↑↑';
  if (delta >  0.01) return '↑ ';
  if (delta < -0.04) return '↓↓';
  if (delta < -0.01) return '↓ ';
  return '  ';
}

// ─── Einen einzelnen Tipp updaten ────────────────────────────────────────────
async function updateOneTip(entry, newH, newA) {
  const parsed = await client.fetchSpieltag(entry.spieltagIndex);
  if (!parsed) return false;

  const { hidden, games } = parsed;
  const postData = { ...hidden };

  for (const g of games) {
    const heimField = `spieltippForms[${g.id}].heimTipp`;
    const gastField = `spieltippForms[${g.id}].gastTipp`;
    if (g.id === entry.id) {
      postData[heimField] = String(newH);
      postData[gastField] = String(newA);
    } else {
      postData[heimField] = g.existHeim;
      postData[gastField] = g.existGast;
    }
  }

  return client.submitTips(postData);
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n📡  Kicktipp Swing-Check — WM 2026');
  console.log(`    Odds: ${odds.createdAt?.slice(0, 16).replace('T', ' ')} UTC`);
  console.log(`    Schwelle: Δ≥${(SWING_THRESHOLD * 100).toFixed(0)}pp oder neues Tipp-Ergebnis`);
  console.log('═'.repeat(52));

  const state = loadState();
  const allEntries = Object.values(state.tips).flat();

  if (allEntries.length === 0) {
    console.log('\n⚠️  Keine Tipps im State. Bitte zuerst kicktipp_http.js ausführen.\n');
    process.exit(0);
  }

  // ── Swings berechnen ──────────────────────────────────────────────────────
  const swings    = [];
  const unchanged = [];

  for (const entry of allEntries) {
    const { heimCode: hc, gastCode: gc, matchNumber: num } = entry;
    const oldProbs = entry.oddsAtTip;
    const oldTip   = entry.tip;
    const isKO     = entry.spieltagIndex >= 11;

    const newTipData = model.bestScore(hc, gc, { matchNumber: num, noDraws: isKO });
    const newProbs   = newTipData.probs;
    const newTip     = { h: newTipData.h, a: newTipData.a };

    const oldOutcome      = outcome(oldTip.h, oldTip.a);
    const deltaOldOutcome = (newProbs[oldOutcome] || 0) - (oldProbs[oldOutcome] || 0);

    const tipChanged = (newTip.h !== oldTip.h || newTip.a !== oldTip.a);
    const bigSwing   = Math.abs(deltaOldOutcome) >= SWING_THRESHOLD;

    if (tipChanged || bigSwing) {
      swings.push({ entry, oldTip, newTip, oldProbs, newProbs, deltaOldOutcome, tipChanged, bigSwing });
    } else {
      unchanged.push(entry);
    }
  }

  console.log(`\n  ${allEntries.length} Tipps geladen  •  ${swings.length} Swings  •  ${unchanged.length} unverändert\n`);

  if (swings.length === 0) {
    console.log('✅  Keine signifikanten Verschiebungen — alle Tipps bleiben wie gehabt.\n');
    process.exit(0);
  }

  // ── Swings anzeigen ───────────────────────────────────────────────────────
  console.log('  Spieltag  Partie                 Alter Tipp  Neuer Tipp  Δ(Outcome)  Grund');
  console.log('  ' + '─'.repeat(78));

  swings.forEach(s => {
    const { entry, oldTip, newTip, oldProbs, newProbs, deltaOldOutcome, tipChanged } = s;
    const oldO  = outcome(oldTip.h, oldTip.a);
    const newO  = outcome(newTip.h, newTip.a);
    const match = `${entry.heimCode.padEnd(4)} vs ${entry.gastCode}`;
    const delta = `${deltaOldOutcome >= 0 ? '+' : ''}${(deltaOldOutcome * 100).toFixed(1)}pp`;
    const grund = tipChanged ? `Tipp ändert sich (${oldO}→${newO})` : 'Starke Drift';
    const flag  = tipChanged ? '🔄' : '📉';

    console.log(`  ${flag} ST${String(entry.spieltagIndex).padStart(2)}  ${match.padEnd(18)} ${String(oldTip.h+':'+oldTip.a).padStart(3)} → ${String(newTip.h+':'+newTip.a).padEnd(3)}  ${arrow(deltaOldOutcome)} ${delta.padStart(8)}  ${grund}`);
    const fmtP = p => `H ${pct(p.home)} X ${pct(p.draw)} A ${pct(p.away)}`;
    console.log(`           alt: ${fmtP(oldProbs)}   neu: ${fmtP(newProbs)}`);
  });

  console.log('');

  // ── Session-Check ────────────────────────────────────────────────────────
  const user = await client.checkLogin();
  if (!user) {
    console.error('❌  Session abgelaufen — bitte neuen SESSION-Cookie eintragen.');
    process.exit(1);
  }

  // ── Interaktive Bestätigung ───────────────────────────────────────────────
  const rl  = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = q => new Promise(r => rl.question(q, r));

  console.log('  Optionen: j=diesen updaten  n=überspringen  a=alle updaten  q=abbrechen\n');

  let updateAll    = false;
  let updatedCount = 0;

  for (const s of swings) {
    const { entry, newTip } = s;
    const match = `${entry.heimCode} vs ${entry.gastCode}`;

    let ans;
    if (updateAll) {
      ans = 'j';
      console.log(`  Auto-Update: ${match}  →  ${newTip.h}:${newTip.a}`);
    } else {
      ans = (await ask(`  Update ${match}  ${s.oldTip.h}:${s.oldTip.a} → ${newTip.h}:${newTip.a} ?  [j/n/a/q]  `)).toLowerCase().trim();
    }

    if (ans === 'q') { console.log('  Abgebrochen.'); break; }
    if (ans === 'a') { updateAll = true; ans = 'j'; }
    if (ans !== 'j') { console.log('  ⏭  Übersprungen'); continue; }

    process.stdout.write('  Sende... ');
    const ok = await updateOneTip(entry, newTip.h, newTip.a);
    if (ok) {
      entry.tip        = { h: newTip.h, a: newTip.a };
      entry.oddsAtTip  = s.newProbs;
      entry.tippedAt   = new Date().toISOString();
      entry.swingHistory = [...(entry.swingHistory || []), {
        at:    new Date().toISOString(),
        old:   { ...s.oldTip },
        new:   { ...newTip },
        delta: s.deltaOldOutcome,
      }];
      updatedCount++;
      console.log('✅');
    } else {
      console.log('❌  HTTP-Fehler');
    }

    await new Promise(r => setTimeout(r, 300));
  }

  rl.close();

  if (updatedCount > 0) {
    saveState(state);
    console.log(`\n✅  ${updatedCount} Tipp(s) aktualisiert und State gespeichert.\n`);
  } else {
    console.log('\n  Keine Änderungen vorgenommen.\n');
  }
}

main().catch(err => { console.error('Fehler:', err.message); process.exit(1); });
