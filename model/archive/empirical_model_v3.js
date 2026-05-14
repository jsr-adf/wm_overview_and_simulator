/**
 * Empirical Match Prediction Model v3
 * Uses similar historical matches to predict outcomes instead of parametric formulas
 *
 * Improvements from v2:
 * - Proper team name to code mapping (handles variations like "United States" vs "USA")
 * - More relaxed ELO thresholds (±300, then ±500)
 * - Better fallback handling
 */

const fs = require('fs');

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

// Load simulation data
const simulationDataPath = '/Users/j.schlosser/Documents/New project/wm_2026_simulation_data.json';
const simulationData = JSON.parse(fs.readFileSync(simulationDataPath, 'utf8'));

// Load historical results
const csvPath = '/Users/j.schlosser/Documents/New project/international_results.csv';
const csvContent = fs.readFileSync(csvPath, 'utf8');
const historicalMatches = parseCSV(csvContent);

console.log(`Loaded ${historicalMatches.length} historical matches`);
console.log(`Loaded ${Object.keys(simulationData.teams).length} teams with ELO ratings`);

// Build team name mappings with manual overrides for known variations
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

// Auto-generate mappings from team data
for (const [code, team] of Object.entries(simulationData.teams)) {
  if (!nameToCodeMap[team.name]) {
    nameToCodeMap[team.name] = code;
  }
}

function getTeamCode(teamName) {
  // Try exact match first
  if (nameToCodeMap[teamName]) {
    return nameToCodeMap[teamName];
  }

  // Try case-insensitive match
  for (const [name, code] of Object.entries(nameToCodeMap)) {
    if (name.toLowerCase() === teamName.toLowerCase()) {
      return code;
    }
  }

  return null;
}

// Build ELO lookup map from simulation data
const eloMap = {};
for (const [code, team] of Object.entries(simulationData.teams)) {
  eloMap[code] = team.elo;
}

// Test mapping on historical data
const unmappedTeams = new Set();
for (const match of historicalMatches) {
  if (!getTeamCode(match.home_team)) {
    unmappedTeams.add(match.home_team);
  }
  if (!getTeamCode(match.away_team)) {
    unmappedTeams.add(match.away_team);
  }
}

console.log(`Unmapped historical teams: ${unmappedTeams.size}`);
if (unmappedTeams.size < 20) {
  console.log('Examples:', Array.from(unmappedTeams).slice(0, 10).join(', '));
}

// Get WC 2026 matches
const wcMatches = simulationData.matches;
console.log(`WC 2026 matches to predict: ${wcMatches.length}\n`);

/**
 * Find historical matches similar to a given match based on team ELO ratings
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

    // Both teams must be similarly matched (ELO within threshold)
    const homeMatch = Math.abs(histHomeElo - homeElo) <= eloThreshold;
    const awayMatch = Math.abs(histAwayElo - awayElo) <= eloThreshold;

    if (homeMatch && awayMatch) {
      similar.push({
        homeScore: parseInt(match.home_score),
        awayScore: parseInt(match.away_score),
        homeTeam: match.home_team,
        awayTeam: match.away_team,
        homeElo: histHomeElo,
        awayElo: histAwayElo,
        date: match.date
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
 */
function predictMatch(homeCode, awayCode, threshold = 300) {
  const similar = findSimilarMatches(homeCode, awayCode, threshold);

  if (similar.length === 0) {
    // If no similar matches, try relaxed threshold
    if (threshold < 500) {
      return predictMatch(homeCode, awayCode, 500);
    }

    // Ultimate fallback: use calibration targets
    // Based on global stats: 2.725 goals/match, 0.2315 draw rate
    return {
      homeGoals: 1,
      awayGoals: 1,
      probability: 0.1,
      method: 'fallback',
      similarCount: 0
    };
  }

  const distribution = getScoreDistribution(similar);

  // Pick most common outcome from distribution
  const scores = Object.entries(distribution)
    .sort((a, b) => b[1] - a[1]);

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
console.log('=== WC 2026 Match Predictions (Empirical Model v3) ===\n');

const predictions = [];
let totalGoals = 0;
let matchCount = 0;
let fallbackCount = 0;

for (const match of wcMatches) {
  const homeCode = match.home.code;
  const awayCode = match.away.code;
  const prediction = predictMatch(homeCode, awayCode);

  predictions.push({
    ...match,
    prediction
  });

  const totalMatch = prediction.homeGoals + prediction.awayGoals;
  totalGoals += totalMatch;
  matchCount++;

  if (prediction.method === 'fallback') {
    fallbackCount++;
  }

  const distInfo = prediction.similarCount > 0
    ? `${prediction.similarCount} similar`
    : 'fallback';

  console.log(
    `${homeCode} vs ${awayCode}: ` +
    `${prediction.homeGoals}-${prediction.awayGoals} ` +
    `(${(prediction.probability * 100).toFixed(1)}% | ${distInfo})`
  );
}

console.log(`\n=== Statistics ===`);
console.log(`Total matches: ${matchCount}`);
console.log(`Average goals per match: ${(totalGoals / matchCount).toFixed(3)}`);
console.log(`Calibration target: 2.725 goals/match`);
console.log(`Matches using fallback: ${fallbackCount}/${matchCount}`);
console.log(`Matches with empirical data: ${matchCount - fallbackCount}/${matchCount}`);

// Count results
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

// Analyze threshold efficiency
const thresh300 = predictions.filter(p => p.prediction.method === 'empirical' && p.prediction.similarCount > 0).length;
console.log(`\nThreshold efficiency:`);
console.log(`Matches found with ±300 ELO threshold: ${thresh300}`);
console.log(`Matches needing ±500 threshold or fallback: ${matchCount - thresh300}`);

// Save predictions
fs.writeFileSync(
  '/Users/j.schlosser/Documents/New project/empirical_predictions_v3.json',
  JSON.stringify(predictions, null, 2)
);

console.log(`\nPredictions saved to empirical_predictions_v3.json`);
