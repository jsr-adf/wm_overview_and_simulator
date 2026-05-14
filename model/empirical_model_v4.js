/**
 * Empirical Match Prediction Model v4
 * Uses similar historical matches to predict outcomes with WEIGHTED RANDOM SELECTION
 *
 * Key improvements:
 * - Weighted random selection from score distribution (not just peak)
 * - Proper seeded random number generator for reproducibility
 * - Better statistics tracking
 */

const fs = require('fs');

// Seeded random number generator (mulberry32)
function mulberry32(a) {
  return function() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Simple CSV parser
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
const simulationDataPath = '/Users/j.schlosser/Documents/New project/wm_2026_simulation_data.json';
const simulationData = JSON.parse(fs.readFileSync(simulationDataPath, 'utf8'));

const csvPath = '/Users/j.schlosser/Documents/New project/international_results.csv';
const csvContent = fs.readFileSync(csvPath, 'utf8');
const historicalMatches = parseCSV(csvContent);

console.log(`Loaded ${historicalMatches.length} historical matches`);
console.log(`Loaded ${Object.keys(simulationData.teams).length} teams\n`);

// Team name mapping
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

for (const [code, team] of Object.entries(simulationData.teams)) {
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
for (const [code, team] of Object.entries(simulationData.teams)) {
  eloMap[code] = team.elo;
}

const wcMatches = simulationData.matches;

/**
 * Find similar historical matches
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
 * Get score distribution from similar matches
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
 * Predict match using WEIGHTED RANDOM SELECTION from distribution
 */
function predictMatch(homeCode, awayCode, matchIndex) {
  // Create unique seeded random for this match
  const baseSeed = 20260512; // May 12, 2026 (current date)
  const random = mulberry32(baseSeed + matchIndex * 10007);

  let similar = findSimilarMatches(homeCode, awayCode, 300);

  if (similar.length === 0) {
    similar = findSimilarMatches(homeCode, awayCode, 500);
  }

  if (similar.length === 0) {
    return {
      homeGoals: 1,
      awayGoals: 1,
      probability: 0.1,
      method: 'fallback',
      similarCount: 0,
      scoreDist: {}
    };
  }

  const distribution = getScoreDistribution(similar);

  // WEIGHTED RANDOM SELECTION from distribution
  const entries = Object.entries(distribution);
  const totalCount = similar.length;

  let accumulated = 0;
  const roll = random();

  let selectedScore = '1-1'; // fallback

  for (const [score, count] of entries) {
    accumulated += count;
    if (roll < accumulated / totalCount) {
      selectedScore = score;
      break;
    }
  }

  const [homeGoals, awayGoals] = selectedScore.split('-').map(Number);
  const count = distribution[selectedScore];
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
 * Run predictions
 */
console.log('=== WC 2026 Match Predictions (Empirical Model v4) ===');
console.log('Using weighted random selection from historical score distributions\n');

const predictions = [];
let totalGoals = 0;
let matchCount = 0;

for (let i = 0; i < wcMatches.length; i++) {
  const match = wcMatches[i];
  const homeCode = match.home.code;
  const awayCode = match.away.code;
  const prediction = predictMatch(homeCode, awayCode, i);

  predictions.push({
    ...match,
    prediction
  });

  const totalMatch = prediction.homeGoals + prediction.awayGoals;
  totalGoals += totalMatch;
  matchCount++;

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

// Save predictions
fs.writeFileSync(
  '/Users/j.schlosser/Documents/New project/empirical_predictions_v4.json',
  JSON.stringify(predictions, null, 2)
);

console.log(`\nPredictions saved to empirical_predictions_v4.json`);

// Verify distribution averages
let distTotalGoals = 0;
let distTotalMatches = 0;
for (const p of predictions) {
  if (p.prediction.scoreDist) {
    for (const [score, count] of Object.entries(p.prediction.scoreDist)) {
      const [h, a] = score.split('-').map(Number);
      distTotalGoals += (h + a) * count;
      distTotalMatches += count;
    }
  }
}

console.log(`\nDistribution verification:`);
console.log(`Average goals in historical data: ${(distTotalGoals / distTotalMatches).toFixed(3)}`);
console.log(`Average goals in predictions: ${(totalGoals / matchCount).toFixed(3)}`);
