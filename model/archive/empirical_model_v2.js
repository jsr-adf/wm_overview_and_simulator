/**
 * Empirical Match Prediction Model v2
 * Uses similar historical matches to predict outcomes instead of parametric formulas
 *
 * Approach:
 * 1. Load team ELO ratings from simulation data
 * 2. For each WC 2026 match, find historical matches with similar team strengths
 * 3. Use actual score distributions from those similar matches
 * 4. Validate against test data
 */

const fs = require('fs');
const path = require('path');

// Simple CSV parser (native Node.js)
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

// Load simulation data (team ELO ratings)
const simulationDataPath = '/Users/j.schlosser/Documents/New project/wm_2026_simulation_data.json';
const simulationData = JSON.parse(fs.readFileSync(simulationDataPath, 'utf8'));

// Load historical results
const csvPath = '/Users/j.schlosser/Documents/New project/international_results.csv';
const csvContent = fs.readFileSync(csvPath, 'utf8');
const historicalMatches = parseCSV(csvContent);

console.log(`Loaded ${historicalMatches.length} historical matches`);
console.log(`Loaded ${Object.keys(simulationData.teams).length} teams with ELO ratings`);

// Build ELO lookup map
const eloMap = {};
for (const [code, team] of Object.entries(simulationData.teams)) {
  eloMap[code] = team.elo;
}

// Get WC 2026 matches
const wcMatches = simulationData.matches;
console.log(`WC 2026 matches to predict: ${wcMatches.length}`);

/**
 * Find historical matches similar to a given match based on team ELO ratings
 * ELO threshold: ±150 points allows for some variance while staying "similar"
 */
function findSimilarMatches(homeCode, awayCode, eloThreshold = 150) {
  const homeElo = eloMap[homeCode];
  const awayElo = eloMap[awayCode];

  if (!homeElo || !awayElo) {
    return [];
  }

  const similar = [];

  for (const match of historicalMatches) {
    const histHomeElo = eloMap[match.home_team];
    const histAwayElo = eloMap[match.away_team];

    if (!histHomeElo || !histAwayElo) continue;

    // Both teams must be similarly matched
    const homeMatch = Math.abs(histHomeElo - homeElo) <= eloThreshold;
    const awayMatch = Math.abs(histAwayElo - awayElo) <= eloThreshold;

    if (homeMatch && awayMatch) {
      similar.push({
        ...match,
        homeElo: histHomeElo,
        awayElo: histAwayElo,
        homeScore: parseInt(match.home_score),
        awayScore: parseInt(match.away_score)
      });
    }
  }

  return similar;
}

/**
 * Build score distribution from similar matches
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
 * Predict match outcome using empirical distribution
 * Returns: { homeGoals, awayGoals, probability }
 */
function predictMatch(homeCode, awayCode, threshold = 150) {
  const similar = findSimilarMatches(homeCode, awayCode, threshold);

  if (similar.length === 0) {
    // If no similar matches with threshold 150, try 200
    if (threshold < 200) {
      return predictMatch(homeCode, awayCode, 200);
    }

    // Ultimate fallback: use calibration average (2.72 goals per match)
    return {
      homeGoals: 1,
      awayGoals: 1,
      probability: 0.1,
      method: 'fallback',
      similarCount: 0
    };
  }

  const distribution = getScoreDistribution(similar);

  // Pick weighted random outcome from distribution
  // Sort by frequency for deterministic selection
  const scores = Object.entries(distribution)
    .sort((a, b) => b[1] - a[1]);

  // Use the most common outcome for now (can be randomized later)
  const [score, count] = scores[0];
  const [homeGoals, awayGoals] = score.split('-').map(Number);

  const probability = count / similar.length;

  return {
    homeGoals,
    awayGoals,
    probability,
    method: 'empirical',
    similarCount: similar.length,
    scoreDist: distribution
  };
}

/**
 * Generate predictions for all WC 2026 matches
 */
console.log('\n=== WC 2026 Match Predictions (Empirical Model) ===\n');

const predictions = [];
let totalGoals = 0;
let matchCount = 0;
let noDataMatches = 0;

for (const match of wcMatches) {
  const prediction = predictMatch(match.home.code, match.away.code);

  predictions.push({
    ...match,
    prediction
  });

  const totalMatch = prediction.homeGoals + prediction.awayGoals;
  totalGoals += totalMatch;
  matchCount++;

  if (prediction.method === 'fallback') {
    noDataMatches++;
  }

  console.log(
    `${match.home.code} vs ${match.away.code}: ` +
    `${prediction.homeGoals}-${prediction.awayGoals} ` +
    `(${(prediction.probability * 100).toFixed(1)}% | ${prediction.similarCount} similar matches)`
  );
}

console.log(`\n=== Statistics ===`);
console.log(`Total matches: ${matchCount}`);
console.log(`Average goals per match: ${(totalGoals / matchCount).toFixed(3)}`);
console.log(`Calibration target: 2.725`);
console.log(`Matches with no data (using fallback): ${noDataMatches}`);

// Count draws, home wins, away wins
let draws = 0, homeWins = 0, awayWins = 0;
for (const p of predictions) {
  if (p.prediction.homeGoals === p.prediction.awayGoals) draws++;
  else if (p.prediction.homeGoals > p.prediction.awayGoals) homeWins++;
  else awayWins++;
}

console.log(`\nResult distribution:`);
console.log(`Home wins: ${homeWins} (${(homeWins/matchCount*100).toFixed(1)}%)`);
console.log(`Draws: ${draws} (${(draws/matchCount*100).toFixed(1)}%)`);
console.log(`Away wins: ${awayWins} (${(awayWins/matchCount*100).toFixed(1)}%)`);
console.log(`Calibration target draw rate: 23.15%`);

// Find matches with no historical similar matches
const problematicMatches = predictions.filter(p => p.prediction.method === 'fallback');
if (problematicMatches.length > 0) {
  console.log(`\n=== Matches with insufficient similar historical matches ===`);
  for (const p of problematicMatches) {
    const homeElo = eloMap[p.home.code];
    const awayElo = eloMap[p.away.code];
    console.log(`${p.home.name} (${homeElo}) vs ${p.away.name} (${awayElo})`);
  }
}

// Save predictions to file for inspection
fs.writeFileSync(
  '/Users/j.schlosser/Documents/New project/empirical_predictions_v2.json',
  JSON.stringify(predictions, null, 2)
);

console.log(`\nPredictions saved to empirical_predictions_v2.json`);

// Analyze score distribution quality
console.log('\n=== Score Distribution Analysis ===');
let maxScoreDist = 0;
for (const p of predictions) {
  if (p.prediction.scoreDist) {
    maxScoreDist = Math.max(maxScoreDist, Object.keys(p.prediction.scoreDist).length);
  }
}
console.log(`Max different scores in a prediction: ${maxScoreDist}`);
console.log(`Model is using empirical distribution of similar historical matches`);
