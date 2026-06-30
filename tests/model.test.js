'use strict';
/**
 * tests/model.test.js — Unit-Tests für lib/model.js
 * Run: node tests/model.test.js
 */

const assert = require('assert');
const { createModel, pmf } = require('../lib/model');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch(e) { console.log(`  ❌ ${name}: ${e.message}`); failed++; }
}

// ─── Mock-Daten ───────────────────────────────────────────────────────────────
const mockData = {
  teams: {
    GER: { elo: 1900, name: 'Germany' },
    FRA: { elo: 1950, name: 'France'  },
    CPV: { elo: 1300, name: 'Cape Verde' },
    USA: { elo: 1800, name: 'United States' },
  },
  offensiveRatings:  { GER: 1.2, FRA: 1.3, CPV: 0.7, USA: 1.0 },
  defensiveRatings:  { GER: 0.9, FRA: 0.85, CPV: 1.3, USA: 1.0 },
  calibration: { avgGoals: 2.75 },
};

// ─── pmf ─────────────────────────────────────────────────────────────────────
console.log('\nPMF:');
test('pmf(2,0) ≈ 0.135', () => assert(Math.abs(pmf(2,0) - Math.exp(-2)) < 0.001));
test('pmf(0,0) = 1',     () => assert.strictEqual(pmf(0, 0), 1));
test('pmf(0,1) = 0',     () => assert.strictEqual(pmf(0, 1), 0));
test('pmf(2.75,2) > 0',  () => assert(pmf(2.75, 2) > 0));

// ─── eloProbs ────────────────────────────────────────────────────────────────
console.log('\neloProbs:');
const model = createModel(mockData);
test('Summe = 1', () => {
  const p = model.eloProbs('GER', 'FRA');
  assert(Math.abs(p.home + p.draw + p.away - 1) < 0.0001);
});
test('Stärker = höhere home-Wahrscheinlichkeit', () => {
  const p1 = model.eloProbs('FRA', 'GER'); // FRA stärker (1950 > 1900)
  const p2 = model.eloProbs('GER', 'FRA');
  assert(p1.home > p2.home, `FRA home: ${p1.home.toFixed(3)} > GER home: ${p2.home.toFixed(3)}`);
});
test('Klarer Favorit vs Außenseiter: home > 80%', () => {
  const p = model.eloProbs('FRA', 'CPV');
  assert(p.home > 0.80, `home = ${p.home.toFixed(3)}`);
});
test('Heimvorteil USA', () => {
  const pHome = model.eloProbs('USA', 'GER'); // USA ist Gastgeber
  const pAway = model.eloProbs('GER', 'USA');
  assert(pHome.home > pAway.away, 'USA home > GER home');
});
test('Unbekannte Teams → Fallback 38/24/38', () => {
  const p = model.eloProbs('XXX', 'YYY');
  assert.strictEqual(p.home, 0.38);
});

// ─── blendedProbs ────────────────────────────────────────────────────────────
console.log('\nblendedProbs:');
const oddsMap  = { 1: { home: 0.70, draw: 0.15, away: 0.15 } };
const modelWithOdds = createModel(mockData, oddsMap);
test('Ohne Quoten = ELO', () => {
  const pb = model.blendedProbs('GER', 'FRA');
  const pe = model.eloProbs('GER', 'FRA');
  assert(Math.abs(pb.home - pe.home) < 0.001);
});
test('Mit Quoten: Blend zieht Richtung Markt', () => {
  const pb = modelWithOdds.blendedProbs('GER', 'FRA', 1);
  assert(pb.home > 0.60, `Markt sagt 70% home, blend sollte > 60%: ${pb.home.toFixed(3)}`);
});
test('KO-Quoten via koOddsMap', () => {
  const koMap  = { 'GER|FRA': { noVigProbability: { home: 0.60, draw: 0.20, away: 0.20 } } };
  const m2     = createModel(mockData, {}, koMap);
  const pb     = m2.blendedProbs('GER', 'FRA');
  assert(pb.home > 0.50, `KO blend: ${pb.home.toFixed(3)}`);
});

// ─── bestScore ────────────────────────────────────────────────────────────────
console.log('\nbestScore:');
test('Klarer Favorit gewinnt', () => {
  const tip = model.bestScore('FRA', 'CPV');
  assert(tip.h > tip.a, `FRA ${tip.h}:${tip.a} CPV`);
});
test('noDraws: kein Unentschieden', () => {
  // Teste mehrere Paarungen auf Draw-Freiheit
  for (const [h, a] of [['GER','FRA'],['FRA','GER'],['USA','GER'],['GER','CPV']]) {
    const tip = model.bestScore(h, a, { noDraws: true });
    assert(tip.h !== tip.a, `${h} vs ${a}: ${tip.h}:${tip.a} ist Unentschieden`);
  }
});
test('Ergebnis hat h und a als Integer >= 0', () => {
  const tip = model.bestScore('GER', 'FRA');
  assert(Number.isInteger(tip.h) && tip.h >= 0);
  assert(Number.isInteger(tip.a) && tip.a >= 0);
});
test('probs ist im Return-Wert enthalten', () => {
  const tip = model.bestScore('GER', 'FRA');
  assert(tip.probs && tip.probs.home > 0);
});

// ─── Ergebnis ────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(40)}`);
console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
