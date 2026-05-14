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
assert(typeof simData.learnedModel === 'object', 'simData has learnedModel');
assert(typeof simData.learnedModel.eloDiffBuckets === 'object', 'learnedModel has eloDiffBuckets');

const buckets = Object.keys(simData.learnedModel.eloDiffBuckets);
assert(buckets.length >= 10, `learnedModel has ${buckets.length} ELO buckets (≥10 expected)`);

// ─── Test: Learned model probability sums ───────────────────────────────────
console.log('\n📦 Test: Learned model probabilities sum to 1.0');
let badBuckets = 0;
for (const [key, b] of Object.entries(simData.learnedModel.eloDiffBuckets)) {
  const sum = b.home + b.draw + b.away;
  if (Math.abs(sum - 1.0) > 0.01) badBuckets++;
}
assert(badBuckets === 0, `All ELO buckets sum to ~1.0 (${badBuckets} bad buckets)`);

// ─── Test: ELO bucket lookup logic (mirrors simulation.js) ──────────────────
console.log('\n📦 Test: ELO bucket lookup (core model logic)');
function ratingProbabilities(homeRating, awayRating) {
  const eloDiff = homeRating - awayRating;
  const bucketDiff = Math.round(eloDiff / 10) * 10;
  let bucket = simData.learnedModel.eloDiffBuckets[bucketDiff];
  if (!bucket) {
    const bucketKeys = Object.keys(simData.learnedModel.eloDiffBuckets).map(Number);
    const nearestKey = bucketKeys.reduce((a, b) =>
      Math.abs(a - bucketDiff) < Math.abs(b - bucketDiff) ? a : b);
    bucket = simData.learnedModel.eloDiffBuckets[nearestKey];
  }
  return { home: bucket.home, draw: bucket.draw, away: bucket.away };
}

// Strong home team (+200 ELO) should heavily favour home
const strongHome = ratingProbabilities(2000, 1800);
assert(strongHome.home > 0.5, `Strong home (+200 ELO) P(home)=${strongHome.home.toFixed(3)} > 0.5`);
assert(strongHome.away < strongHome.home, 'Strong home: P(home) > P(away)');

// Even ELO → home advantage still applies (empirical), home >= away expected
const even = ratingProbabilities(1900, 1900);
assert(even.home >= even.away, `Even ELO: P(home)=${even.home.toFixed(3)} ≥ P(away)=${even.away.toFixed(3)} (home advantage in data)`);
assert(even.draw > 0.2, `Even match draw rate=${even.draw.toFixed(3)} > 0.2`);

// Probabilities sum to 1
assertClose(strongHome.home + strongHome.draw + strongHome.away, 1.0, 0.01, 'Probs sum to 1 (strong home)');
assertClose(even.home + even.draw + even.away, 1.0, 0.01, 'Probs sum to 1 (even match)');

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
