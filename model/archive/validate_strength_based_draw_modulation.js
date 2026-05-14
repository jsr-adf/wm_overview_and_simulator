/**
 * Test: Strength-Based Draw Modulation
 *
 * Hypothesis: Draw rate should vary by team strength difference
 * - Close matches (small ELO diff) → higher draw probability
 * - Mismatched teams (large ELO diff) → lower draw probability
 *
 * Approach: Instead of fixed 0.27 draw rate, use Gaussian adjustment
 * centered at evenly-matched games
 */

const fs = require('fs');

function mulberry32(seed) {
  return function random() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function parseCSV(content) {
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',');
  const records = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    const record = {};
    for (let j = 0; j < headers.length; j++) {
      record[headers[j]] = values[j];
    }
    records.push(record);
  }
  return records;
}

const simData = JSON.parse(fs.readFileSync('/Users/j.schlosser/Documents/New project/wm_2026_simulation_data.json', 'utf8'));
const historicalMatches = parseCSV(fs.readFileSync('/Users/j.schlosser/Documents/New project/international_results.csv', 'utf8'));

const nameToCodeMap = {
  'United States': 'USA', 'Türkiye': 'TUR', 'Turkey': 'TUR',
  'Korea Republic': 'KOR', 'South Korea': 'KOR',
  'Czech Republic': 'CZE', 'Czechia': 'CZE',
  'China PR': 'CHN', 'Northern Ireland': 'NIR', 'Wales': 'WAL',
  'Scotland': 'SCO', 'England': 'ENG',
};

for (const [code, team] of Object.entries(simData.teams)) {
  if (!nameToCodeMap[team.name]) {
    nameToCodeMap[team.name] = code;
  }
}

function getTeamCode(teamName) {
  if (nameToCodeMap[teamName]) return nameToCodeMap[teamName];
  for (const [name, code] of Object.entries(nameToCodeMap)) {
    if (name.toLowerCase() === teamName.toLowerCase()) return code;
  }
  return null;
}

function ratingProbabilitiesFixed(homeRating, awayRating) {
  const eloDiff = homeRating - awayRating;
  const homeEloExp = 1 / (1 + Math.pow(10, -eloDiff / 400));
  const awayEloExp = 1 - homeEloExp;
  const drawProb = 0.27; // Fixed
  const remainingProb = 1 - drawProb;

  return {
    home: homeEloExp * remainingProb,
    draw: drawProb,
    away: awayEloExp * remainingProb,
  };
}

function ratingProbabilitiesAdaptive(homeRating, awayRating) {
  const eloDiff = homeRating - awayRating;
  const homeEloExp = 1 / (1 + Math.pow(10, -eloDiff / 400));
  const awayEloExp = 1 - homeEloExp;

  // Adaptive draw rate based on ELO difference
  // Peak at 0 diff (evenly matched), decline as teams diverge
  const eloDiffAbs = Math.abs(eloDiff);
  const baseDrawRate = 0.27;
  const maxBoost = 0.08; // Can boost up to 35% at perfect match
  const sigma = 150; // Width of the Gaussian curve

  const adaptiveDrawRate = baseDrawRate + (maxBoost * Math.exp(-(eloDiffAbs * eloDiffAbs) / (2 * sigma * sigma)));

  const remainingProb = 1 - adaptiveDrawRate;

  return {
    home: homeEloExp * remainingProb,
    draw: adaptiveDrawRate,
    away: awayEloExp * remainingProb,
  };
}

function getMostProbableResult(probs, random) {
  const roll = random();
  let selectedOutcome;

  if (roll < probs.home) {
    selectedOutcome = 'home';
  } else if (roll < probs.home + probs.draw) {
    selectedOutcome = 'draw';
  } else {
    selectedOutcome = 'away';
  }

  if (selectedOutcome === 'home') {
    const scores = ['1-0', '2-0', '2-1', '3-0', '3-1'];
    return scores[Math.floor(random() * scores.length)];
  } else if (selectedOutcome === 'draw') {
    const scores = ['0-0', '1-1', '2-2'];
    return scores[Math.floor(random() * scores.length)];
  } else {
    const scores = ['0-1', '0-2', '1-2'];
    return scores[Math.floor(random() * scores.length)];
  }
}

function getRecentMatches() {
  const lines = fs.readFileSync('/Users/j.schlosser/Documents/New project/international_results.csv', 'utf8').split('\n').slice(1);
  const targetDate = new Date(2026, 4, 12);
  const sixtyDaysAgo = new Date(targetDate.getTime() - 60 * 24 * 60 * 60 * 1000);

  const matches = [];
  for (const line of lines) {
    const parts = line.split(',');
    if (!parts[0]) continue;

    const matchDate = new Date(parts[0]);
    if (matchDate >= sixtyDaysAgo && matchDate <= targetDate) {
      const homeCode = getTeamCode(parts[1]);
      const awayCode = getTeamCode(parts[2]);

      if (homeCode && awayCode) {
        matches.push({
          homeCode,
          awayCode,
          homeName: parts[1],
          awayName: parts[2],
          actualHome: parseInt(parts[3]),
          actualAway: parseInt(parts[4]),
          actualScore: `${parts[3]}-${parts[4]}`
        });
      }
    }
  }
  return matches;
}

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║   TESTING: Strength-Based Draw Modulation                 ║');
console.log('║                                                            ║');
console.log('║   Hypothesis: Draw rate should vary by ELO difference      ║');
console.log('║   - Close matches (0-50 ELO diff): 32-35% draw rate        ║');
console.log('║   - Moderate (50-150 ELO diff): 27-30% draw rate           ║');
console.log('║   - Large (150-300 ELO diff): 15-20% draw rate             ║');
console.log('║   - Huge (300+ ELO diff): ~10% draw rate                   ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

const testMatches = getRecentMatches();
const baseSeed = 20260512;

// Run both models
const fixedResults = [];
const adaptiveResults = [];

for (let i = 0; i < testMatches.length; i++) {
  const match = testMatches[i];
  const homeTeam = simData.teams[match.homeCode];
  const awayTeam = simData.teams[match.awayCode];

  if (!homeTeam || !awayTeam) continue;

  const eloDiff = homeTeam.elo - awayTeam.elo;

  // Fixed model
  const probsFixed = ratingProbabilitiesFixed(homeTeam.elo, awayTeam.elo);
  const randomFixed = mulberry32(baseSeed + i * 10007);
  const scoreFixed = getMostProbableResult(probsFixed, randomFixed);
  const [homeFixed, awayFixed] = scoreFixed.split('-').map(Number);
  const outcomeFixed = homeFixed > awayFixed ? 'home' : homeFixed < awayFixed ? 'away' : 'draw';

  // Adaptive model
  const probsAdaptive = ratingProbabilitiesAdaptive(homeTeam.elo, awayTeam.elo);
  const randomAdaptive = mulberry32(baseSeed + i * 10007);
  const scoreAdaptive = getMostProbableResult(probsAdaptive, randomAdaptive);
  const [homeAdaptive, awayAdaptive] = scoreAdaptive.split('-').map(Number);
  const outcomeAdaptive = homeAdaptive > awayAdaptive ? 'home' : homeAdaptive < awayAdaptive ? 'away' : 'draw';

  // Actual outcome
  const actualOutcome = match.actualHome > match.actualAway ? 'home' : match.actualHome < match.actualAway ? 'away' : 'draw';
  const actualScore = match.actualScore;

  fixedResults.push({
    match: `${match.homeCode} vs ${match.awayCode}`,
    eloDiff,
    outcome: outcomeFixed,
    score: scoreFixed,
    correct: outcomeFixed === actualOutcome,
    drawProb: probsFixed.draw,
    actual: actualScore
  });

  adaptiveResults.push({
    match: `${match.homeCode} vs ${match.awayCode}`,
    eloDiff,
    outcome: outcomeAdaptive,
    score: scoreAdaptive,
    correct: outcomeAdaptive === actualOutcome,
    drawProb: probsAdaptive.draw,
    actual: actualScore
  });
}

const fixedCorrect = fixedResults.filter(r => r.correct).length;
const fixedAccuracy = fixedCorrect / fixedResults.length;

const adaptiveCorrect = adaptiveResults.filter(r => r.correct).length;
const adaptiveAccuracy = adaptiveCorrect / adaptiveResults.length;

// Count draws predicted
const fixedDraws = fixedResults.filter(r => r.outcome === 'draw').length;
const adaptiveDraws = adaptiveResults.filter(r => r.outcome === 'draw').length;

// Count actual draws
const actualDraws = fixedResults.filter(r => r.actual === r.actual.split('-')[0] + '-' + r.actual.split('-')[1] && r.actual.split('-')[0] === r.actual.split('-')[1]).length;

console.log(`Test set: ${fixedResults.length} matches\n`);

console.log('═══════════════════════════════════════════════════════════\n');
console.log('OVERALL ACCURACY COMPARISON\n');
console.log('═══════════════════════════════════════════════════════════\n');

console.log(`Fixed Model (0.27 draw rate):      ${fixedCorrect}/${fixedResults.length} = ${(fixedAccuracy * 100).toFixed(1)}%`);
console.log(`Adaptive Model (strength-based):   ${adaptiveCorrect}/${adaptiveResults.length} = ${(adaptiveAccuracy * 100).toFixed(1)}%`);
console.log(`Difference:                        ${((adaptiveAccuracy - fixedAccuracy) * 100).toFixed(1)}pp\n`);

console.log('═══════════════════════════════════════════════════════════\n');
console.log('DRAW PREDICTION COMPARISON\n');
console.log('═══════════════════════════════════════════════════════════\n');

console.log(`Fixed Model predicts:     ${fixedDraws} draws (${(fixedDraws / fixedResults.length * 100).toFixed(1)}%)`);
console.log(`Adaptive Model predicts:  ${adaptiveDraws} draws (${(adaptiveDraws / adaptiveResults.length * 100).toFixed(1)}%)`);
console.log(`Actual draws in test:     ${actualDraws} (${(actualDraws / fixedResults.length * 100).toFixed(1)}%)\n`);

// Breakdown by outcome type for adaptive
const adaptiveByOutcome = { home: { correct: 0, total: 0 }, draw: { correct: 0, total: 0 }, away: { correct: 0, total: 0 } };
for (const r of adaptiveResults) {
  adaptiveByOutcome[r.outcome].total++;
  if (r.correct) adaptiveByOutcome[r.outcome].correct++;
}

console.log('Adaptive Model - Breakdown by Predicted Outcome:\n');
console.log(`Home Win: ${adaptiveByOutcome.home.correct}/${adaptiveByOutcome.home.total} (${(adaptiveByOutcome.home.correct / adaptiveByOutcome.home.total * 100).toFixed(1)}%)`);
console.log(`Draw:     ${adaptiveByOutcome.draw.correct}/${adaptiveByOutcome.draw.total} (${(adaptiveByOutcome.draw.correct / adaptiveByOutcome.draw.total * 100).toFixed(1)}%)`);
console.log(`Away Win: ${adaptiveByOutcome.away.correct}/${adaptiveByOutcome.away.total} (${(adaptiveByOutcome.away.correct / adaptiveByOutcome.away.total * 100).toFixed(1)}%)\n`);

console.log('═══════════════════════════════════════════════════════════\n');
console.log('ANALYSIS BY MATCH COMPETITIVENESS\n');
console.log('═══════════════════════════════════════════════════════════\n');

// Bucket matches by ELO difference
const buckets = {
  veryClose: { diff: '0-50', adaptive: 0, fixed: 0, both: 0, count: 0 },
  close: { diff: '50-100', adaptive: 0, fixed: 0, both: 0, count: 0 },
  moderate: { diff: '100-200', adaptive: 0, fixed: 0, both: 0, count: 0 },
  large: { diff: '200-300', adaptive: 0, fixed: 0, both: 0, count: 0 },
  huge: { diff: '300+', adaptive: 0, fixed: 0, both: 0, count: 0 }
};

for (let i = 0; i < fixedResults.length; i++) {
  const eloDiffAbs = Math.abs(fixedResults[i].eloDiff);
  let bucket;

  if (eloDiffAbs <= 50) bucket = buckets.veryClose;
  else if (eloDiffAbs <= 100) bucket = buckets.close;
  else if (eloDiffAbs <= 200) bucket = buckets.moderate;
  else if (eloDiffAbs <= 300) bucket = buckets.large;
  else bucket = buckets.huge;

  bucket.count++;
  if (fixedResults[i].correct) bucket.fixed++;
  if (adaptiveResults[i].correct) bucket.adaptive++;
  if (fixedResults[i].correct && adaptiveResults[i].correct) bucket.both++;
}

for (const [key, data] of Object.entries(buckets)) {
  if (data.count === 0) continue;
  const fixedPct = (data.fixed / data.count * 100).toFixed(1);
  const adaptivePct = (data.adaptive / data.count * 100).toFixed(1);
  const diff = (parseFloat(adaptivePct) - parseFloat(fixedPct)).toFixed(1);
  console.log(`${data.diff.padEnd(8)} ELO diff (${data.count} matches):`);
  console.log(`  Fixed:    ${data.fixed}/${data.count} (${fixedPct}%)`);
  console.log(`  Adaptive: ${data.adaptive}/${data.count} (${adaptivePct}%) ${diff > 0 ? '✅ +' + diff : '❌ ' + diff}pp\n`);
}

console.log('═══════════════════════════════════════════════════════════\n');
console.log('VERDICT\n');
console.log('═══════════════════════════════════════════════════════════\n');

if (adaptiveAccuracy > fixedAccuracy + 0.01) {
  console.log('✅ ADAPTIVE MODEL WINS!\n');
  console.log(`Improvement: +${((adaptiveAccuracy - fixedAccuracy) * 100).toFixed(1)}pp`);
  console.log(`More draws predicted: ${adaptiveDraws - fixedDraws} additional\n`);
  console.log('Recommendation: Integrate strength-based draw modulation into simulation.js\n');
} else if (adaptiveAccuracy > fixedAccuracy) {
  console.log('⚠️ MARGINAL IMPROVEMENT\n');
  console.log(`Improvement: +${((adaptiveAccuracy - fixedAccuracy) * 100).toFixed(1)}pp (very small)`);
  console.log('Recommendation: Test on larger dataset before integration\n');
} else {
  console.log('❌ ADAPTIVE MODEL UNDERPERFORMS\n');
  console.log(`Regression: ${((adaptiveAccuracy - fixedAccuracy) * 100).toFixed(1)}pp`);
  console.log('Recommendation: Keep fixed 0.27 model\n');
}

console.log('═══════════════════════════════════════════════════════════\n');
console.log('SAMPLE PREDICTIONS\n');
console.log('═══════════════════════════════════════════════════════════\n');

const samples = fixedResults.slice(0, 6);
for (let i = 0; i < samples.length; i++) {
  const f = samples[i];
  const a = adaptiveResults[i];
  const result = f.correct ? '✓' : '✗';
  const improvement = a.correct && !f.correct ? ' ← FIXED' : f.correct && !a.correct ? ' ← BROKE' : '';

  console.log(`${f.match} (ELO diff: ${f.eloDiff})`);
  console.log(`  Fixed:    ${f.score} (draw prob: ${(f.drawProb * 100).toFixed(1)}%) ${result}`);
  console.log(`  Adaptive: ${a.score} (draw prob: ${(a.drawProb * 100).toFixed(1)}%) ${a.correct ? '✓' : '✗'}${improvement}`);
  console.log(`  Actual:   ${f.actual}\n`);
}

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║  Strength-based modulation adjusts draw probability based  ║');
console.log('║  on team match-up competitiveness. This targets the core  ║');
console.log('║  problem: underpredicting draws without changing the      ║');
console.log('║  winning formula for Home +1 / Away +1 predictions.       ║');
console.log('╚════════════════════════════════════════════════════════════╝');
