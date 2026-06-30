#!/usr/bin/env node
/**
 * Smoke Tests for WM 2026 Simulation
 *
 * Tests core model logic without a browser/server.
 * Run: node tests/test_simulation.js
 *
 * Exit 0 = all passed, Exit 1 = failures
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label}`);
    failed++;
  }
}

function assertClose(a, b, tol, label) {
  assert(Math.abs(a - b) <= tol, `${label} (got ${a.toFixed(4)}, expected ~${b.toFixed(4)})`);
}

// ─── Load data files ────────────────────────────────────────────────────────
console.log('\n📦 Test: Data files exist and are valid JSON');
const DATA = path.join(ROOT, 'data');

const dataFiles = [
  'wm_2026_simulation_data.json',
  'wm_2026_matches_fifa.json',
  'fifa_mens_ranking_latest.json',
  'wm_2026_odds_snapshot.json',
];

let simData, matches, rankings, oddsSnapshot;
for (const f of dataFiles) {
  const fullPath = path.join(DATA, f);
  assert(fs.existsSync(fullPath), `${f} exists`);
  try {
    const parsed = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    assert(typeof parsed === 'object', `${f} is valid JSON`);
    if (f === 'wm_2026_simulation_data.json') simData = parsed;
    if (f === 'wm_2026_matches_fifa.json') matches = parsed;
    if (f === 'fifa_mens_ranking_latest.json') rankings = parsed;
    if (f === 'wm_2026_odds_snapshot.json') oddsSnapshot = parsed;
  } catch (e) {
    assert(false, `${f} parses without error: ${e.message}`);
  }
}

// ─── Test: Simulation data structure ────────────────────────────────────────
console.log('\n📦 Test: Simulation data structure');
assert(simData && Array.isArray(simData.matches), 'simData has matches array');
assert(simData.matches.length === 72, `72 WC matches (got ${simData.matches?.length})`);
assert(typeof simData.teams === 'object', 'simData has teams');
assert(typeof simData.offensiveRatings === 'object', 'simData has offensiveRatings');
assert(typeof simData.defensiveRatings === 'object', 'simData has defensiveRatings');
assert(typeof simData.calibration === 'object', 'simData has calibration');
assert(typeof simData.calibration.avgGoals === 'number', `calibration.avgGoals is a number (${simData.calibration?.avgGoals})`);

// ─── Test: ELO formula (mirrors ratingProbabilities in simulation.js) ────────
console.log('\n📦 Test: ELO logistic model (core probability logic)');
const HOSTS_TEST = new Set(['USA', 'MEX', 'CAN']);
function ratingProbabilities(homeCode, awayCode) {
  const ht = simData.teams[homeCode], at = simData.teams[awayCode];
  if (!ht || !at) return { home: 0.38, draw: 0.24, away: 0.38 };
  const homeAdv = HOSTS_TEST.has(homeCode) ? (simData.settings.hostBonusRatingPoints || 55) : 0;
  const diff = (ht.elo - at.elo) + homeAdv;
  const ph = 1 / (1 + Math.pow(10, -diff / 400));
  const rawDiff = Math.abs(ht.elo - at.elo);
  const pd = Math.max(0.16, Math.min(0.32, 0.30 - rawDiff / 2000));
  const pa = Math.max(0.02, 1 - ph - pd);
  const tot = ph + pd + pa;
  return { home: ph / tot, draw: pd / tot, away: pa / tot };
}

// Strong favourite (GER vs CUW: ~+370 ELO) should give >75% to stronger team
const gerCuw = ratingProbabilities('GER', 'CUW');
assert(gerCuw.home > 0.75, `GER vs CUW P(GER)=${gerCuw.home.toFixed(3)} > 0.75`);
assert(gerCuw.draw >= 0.12, `GER vs CUW draw=${gerCuw.draw.toFixed(3)} >= 0.12 (floor after normalisation)`);

// Even match: probs should be roughly symmetric, draw > 0.20
const braArg = ratingProbabilities('BRA', 'ARG');
assert(Math.abs(braArg.home - braArg.away) < 0.15, `BRA vs ARG is close: H=${braArg.home.toFixed(3)} A=${braArg.away.toFixed(3)}`);
assert(braArg.draw > 0.20, `BRA vs ARG draw=${braArg.draw.toFixed(3)} > 0.20`);

// Host (USA) gets home bonus vs equal opponent
const usaVsX = ratingProbabilities('USA', 'MEX');
const mexVsUsa = ratingProbabilities('MEX', 'USA');
assert(usaVsX.home !== mexVsUsa.home, 'Host bonus breaks symmetry for USA vs MEX');

// Probabilities always sum to 1
assertClose(gerCuw.home + gerCuw.draw + gerCuw.away, 1.0, 0.01, 'Probs sum to 1 (GER vs CUW)');
assertClose(braArg.home + braArg.draw + braArg.away, 1.0, 0.01, 'Probs sum to 1 (BRA vs ARG)');

// ─── Test: Odds snapshot integrity ──────────────────────────────────────────
console.log('\n📦 Test: Odds snapshot integrity');
assert(oddsSnapshot && typeof oddsSnapshot === 'object', 'Odds snapshot loaded');
assert(Array.isArray(oddsSnapshot.matches), 'Odds snapshot has matches array');
assert(typeof oddsSnapshot.blendWeight === 'number', `blendWeight present (${oddsSnapshot.blendWeight})`);
assert(oddsSnapshot.blendWeight >= 0 && oddsSnapshot.blendWeight <= 1, 'blendWeight between 0–1');

const oddsWithMarket = oddsSnapshot.matches.filter(m => m.market1x2 !== null);
assert(oddsWithMarket.length > 0, `${oddsWithMarket.length} matches have odds`);

// Check each odds entry sums to reasonable implied probability (with vig, >1)
let badOdds = 0;
for (const m of oddsWithMarket) {
  if (!m.market1x2?.noVigProbability) continue;
  const { home, draw, away } = m.market1x2.noVigProbability;
  const sum = home + draw + away;
  if (Math.abs(sum - 1.0) > 0.02) badOdds++;
}
assert(badOdds === 0, `All no-vig probabilities sum to ~1.0 (${badOdds} bad entries)`);

// ─── Test: Blend logic ──────────────────────────────────────────────────────
console.log('\n📦 Test: Blend weight logic');
function blendProbs(model, market, weight) {
  return {
    home: model.home * (1 - weight) + market.home * weight,
    draw: model.draw * (1 - weight) + market.draw * weight,
    away: model.away * (1 - weight) + market.away * weight,
  };
}

const modelProb = { home: 0.5, draw: 0.25, away: 0.25 };
const marketProb = { home: 0.4, draw: 0.35, away: 0.25 };
const blended = blendProbs(modelProb, marketProb, 0.65);

assertClose(blended.home, 0.5 * 0.35 + 0.4 * 0.65, 0.001, 'Blend home prob correct');
assertClose(blended.home + blended.draw + blended.away, 1.0, 0.001, 'Blended probs sum to 1');

// ─── Test: All 72 matches have required fields ───────────────────────────────
console.log('\n📦 Test: All 72 matches have required fields');
let badMatches = 0;
for (const m of simData.matches) {
  if (!m.number || !m.home?.code || !m.away?.code || !m.date) badMatches++;
}
assert(badMatches === 0, `All 72 matches have number, home, away, date (${badMatches} missing)`);

// ─── Test: App files exist ──────────────────────────────────────────────────
console.log('\n📦 Test: App files exist in /app/');
const APP = path.join(ROOT, 'app');
for (const f of ['index.html', 'simulation.html', 'app.js', 'simulation.js', 'styles.css']) {
  assert(fs.existsSync(path.join(APP, f)), `app/${f} exists`);
}

// ─── Test: App path references are correct ──────────────────────────────────
console.log('\n📦 Test: App JS uses correct data paths');
const simJs = fs.readFileSync(path.join(APP, 'simulation.js'), 'utf8');
const appJs = fs.readFileSync(path.join(APP, 'app.js'), 'utf8');
assert(simJs.includes('../data/wm_2026_simulation_data.json'), 'simulation.js → ../data/wm_2026_simulation_data.json');
assert(simJs.includes('../data/wm_2026_odds_snapshot.json'), 'simulation.js → ../data/wm_2026_odds_snapshot.json');
assert(simJs.includes('../assets/flags/'), 'simulation.js → ../assets/flags/');
assert(appJs.includes('../data/wm_2026_matches_fifa.json'), 'app.js → ../data/wm_2026_matches_fifa.json');
assert(appJs.includes('../data/fifa_mens_ranking_latest.json'), 'app.js → ../data/fifa_mens_ranking_latest.json');
assert(appJs.includes('../assets/flags/'), 'app.js → ../assets/flags/');
assert(!simJs.includes('"../wm_2026_'), 'simulation.js has no stale root-level data paths');
assert(!appJs.includes('"../wm_2026_'), 'app.js has no stale root-level data paths');

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log('🎉 All tests passed!\n');
  process.exit(0);
} else {
  console.error(`💥 ${failed} test(s) failed\n`);
  process.exit(1);
}
