/**
 * Validate empirical model against recent match results
 * Tests the model's predictive power on actual outcomes
 */

const fs = require('fs');

// Seeded random (same as in empirical model)
function mulberry32(a) {
  return function() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// CSV parser
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

// Load data
const simData = JSON.parse(fs.readFileSync('/Users/j.schlosser/Documents/New project/wm_2026_simulation_data.json', 'utf8'));
const historicalMatches = parseCSV(fs.readFileSync('/Users/j.schlosser/Documents/New project/international_results.csv', 'utf8'));

// Team mapping
const nameToCodeMap = {
  'United States': 'USA',
  'Türkiye': 'TUR',
  'Turkey': 'TUR',
  'Korea Republic': 'KOR',
  'South Korea': 'KOR',
  'Czech Republic': 'CZE',
  'Czechia': 'CZE',
  'China PR': 'CHN',
  'Northern Ireland': 'NIR',
  'Wales': 'WAL',
  'Scotland': 'SCO',
  'England': 'ENG',
};

for (const [code, team] of Object.entries(simData.teams)) {
  if (!nameToCodeMap[team.name]) {
    nameToCodeMap[team.name] = code;
  }
}

function getTeamCode(teamName) {
  if (nameToCodeMap[teamName]) {
    return nameToCodeMap[teamName];
  }
  for (const [name, code] of Object.entries(nameToCodeMap)) {
    if (name.toLowerCase() === teamName.toLowerCase()) {
      return code;
    }
  }
  return null;
}

// Build ELO map
const eloMap = {};
for (const [code, team] of Object.entries(simData.teams)) {
  eloMap[code] = team.elo;
}

/**
 * Find similar matches for prediction
 */
function findSimilarMatches(homeCode, awayCode, eloThreshold = 300) {
  const homeElo = eloMap[homeCode];
  const awayElo = eloMap[awayCode];

  if (!homeElo || !awayElo) {
    return [];
  }

  const similar = [];

  for (const match of historicalMatches) {
    const homeMapCode = getTeamCode(match.home_team);
    const awayMapCode = getTeamCode(match.away_team);

    if (!homeMapCode || !awayMapCode) continue;

    const histHomeElo = eloMap[homeMapCode];
    const histAwayElo = eloMap[awayMapCode];

    if (!histHomeElo || !histAwayElo) continue;

    const homeMatch = Math.abs(histHomeElo - homeElo) <= eloThreshold;
    const awayMatch = Math.abs(histAwayElo - awayElo) <= eloThreshold;

    if (homeMatch && awayMatch) {
      similar.push({
        homeScore: parseInt(match.home_score),
        awayScore: parseInt(match.away_score)
      });
    }
  }

  return similar;
}

/**
 * Get distribution from similar matches
 */
function getScoreDistribution(similarMatches) {
  const distribution = {};

  for (const match of similarMatches) {
    const score = `${match.homeScore}-${match.awayScore}`;
    distribution[score] = (distribution[score] || 0) + 1;
  }

  return distribution;
}

/**
 * Predict a match (same logic as empirical model)
 */
function predictMatch(homeCode, awayCode, matchIndex) {
  const baseSeed = 20260512;
  const random = mulberry32(baseSeed + matchIndex * 10007);

  let similar = findSimilarMatches(homeCode, awayCode, 300);

  if (similar.length === 0) {
    similar = findSimilarMatches(homeCode, awayCode, 500);
  }

  if (similar.length === 0) {
    return {
      homeGoals: 1,
      awayGoals: 1,
      method: 'fallback'
    };
  }

  const distribution = getScoreDistribution(similar);
  const entries = Object.entries(distribution);
  const totalCount = similar.length;

  let accumulated = 0;
  const roll = random();

  let selectedScore = '1-1';

  for (const [score, count] of entries) {
    accumulated += count;
    if (roll < accumulated / totalCount) {
      selectedScore = score;
      break;
    }
  }

  const [homeGoals, awayGoals] = selectedScore.split('-').map(Number);

  return {
    homeGoals,
    awayGoals,
    method: 'empirical'
  };
}

/**
 * Get recent test matches
 */
function getRecentMatches() {
  const lines = fs.readFileSync('/Users/j.schlosser/Documents/New project/international_results.csv', 'utf8').split('\n').slice(1);

  const targetDate = new Date(2026, 4, 12); // May 12, 2026
  const sixtyDaysAgo = new Date(targetDate.getTime() - 60 * 24 * 60 * 60 * 1000);

  const matches = [];
  let idx = 0;

  for (const line of lines) {
    const parts = line.split(',');
    if (!parts[0]) continue;

    const matchDate = new Date(parts[0]);
    if (matchDate >= sixtyDaysAgo && matchDate <= targetDate) {
      const homeCode = getTeamCode(parts[1]);
      const awayCode = getTeamCode(parts[2]);

      if (homeCode && awayCode) {
        matches.push({
          date: parts[0],
          homeCode,
          awayCode,
          actualHome: parseInt(parts[3]),
          actualAway: parseInt(parts[4]),
          index: idx
        });
      }
    }

    idx++;
  }

  return matches;
}

/**
 * Calculate R² score
 */
function calculateR2(predictions, actuals) {
  if (predictions.length === actuals.length && predictions.length === 0) return 0;

  // Mean of actuals
  const mean = actuals.reduce((a, b) => a + b, 0) / actuals.length;

  // SS_tot = sum of squared differences from mean
  const SStot = actuals.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0);

  // SS_res = sum of squared residuals
  const SSres = predictions.reduce((sum, pred, i) => {
    return sum + Math.pow(actuals[i] - pred, 2);
  }, 0);

  // R² = 1 - (SS_res / SS_tot)
  if (SStot === 0) return 0;
  return 1 - (SSres / SStot);
}

/**
 * Run validation
 */
console.log('=== Empirical Model Validation ===\n');

const testMatches = getRecentMatches();
console.log(`Test set: ${testMatches.length} recent matches (March 15-31, 2026)\n`);

if (testMatches.length === 0) {
  console.log('No test matches found!');
  process.exit(1);
}

let totalPredictedGoals = 0;
let totalActualGoals = 0;
let correctResults = 0;
const predictions = [];
const actuals = [];

for (let i = 0; i < testMatches.length; i++) {
  const match = testMatches[i];
  const pred = predictMatch(match.homeCode, match.awayCode, match.index);

  const predictedGoals = pred.homeGoals + pred.awayGoals;
  const actualGoals = match.actualHome + match.actualAway;

  totalPredictedGoals += predictedGoals;
  totalActualGoals += actualGoals;

  predictions.push(predictedGoals);
  actuals.push(actualGoals);

  // Check if result is correct (home win, draw, away win)
  const predResult = pred.homeGoals === pred.awayGoals ? 'draw' :
                    pred.homeGoals > pred.awayGoals ? 'home_win' : 'away_win';
  const actualResult = match.actualHome === match.actualAway ? 'draw' :
                      match.actualHome > match.actualAway ? 'home_win' : 'away_win';

  if (predResult === actualResult) {
    correctResults++;
  }
}

const r2 = calculateR2(predictions, actuals);

console.log(`Prediction accuracy:`);
console.log(`Average predicted goals: ${(totalPredictedGoals / testMatches.length).toFixed(3)}`);
console.log(`Average actual goals: ${(totalActualGoals / testMatches.length).toFixed(3)}`);
console.log(`Correct result predictions: ${correctResults}/${testMatches.length} (${(correctResults/testMatches.length*100).toFixed(1)}%)`);
console.log(`\nR² Score: ${r2.toFixed(4)}`);

// Compare with baseline (predicting always 1-1)
const baselinePredictions = Array(testMatches.length).fill(2);
const baselineR2 = calculateR2(baselinePredictions, actuals);

console.log(`Baseline R² (always predicting 1-1): ${baselineR2.toFixed(4)}`);
console.log(`\nImprovement over baseline: ${((r2 - baselineR2).toFixed(4))}`);

// Performance assessment
console.log(`\n=== Assessment ===`);
if (r2 > 0.3) {
  console.log('✓ GOOD: R² > 0.3 - Empirical model is performing better than before!');
} else if (r2 > 0) {
  console.log('◐ MODERATE: R² > 0 - Model is better than random but could improve');
} else {
  console.log('✗ POOR: R² ≤ 0 - Model is worse than baseline');
}

// Save results
const results = {
  testSize: testMatches.length,
  avgPredictedGoals: totalPredictedGoals / testMatches.length,
  avgActualGoals: totalActualGoals / testMatches.length,
  correctResults,
  accuracy: (correctResults / testMatches.length).toFixed(4),
  r2Score: r2.toFixed(4),
  baselineR2: baselineR2.toFixed(4),
  model: 'empirical_v4'
};

fs.writeFileSync(
  '/Users/j.schlosser/Documents/New project/empirical_validation_results.json',
  JSON.stringify(results, null, 2)
);

console.log(`\nResults saved to empirical_validation_results.json`);
