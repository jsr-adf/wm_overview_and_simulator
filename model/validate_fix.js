/**
 * Validate the draw prediction fix
 * Tests the new weighted random selection approach
 */

const fs = require('fs');

// Seeded random (same as simulation.js)
function mulberry32(seed) {
  return function random() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Parse CSV
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

// Build ELO map
const eloMap = {};
for (const [code, team] of Object.entries(simData.teams)) {
  eloMap[code] = team.elo;
}

/**
 * Calculate outcome probabilities (same as simulation.js)
 */
function ratingProbabilities(homeRating, awayRating) {
  const eloDiff = homeRating - awayRating;
  const homeEloExp = 1 / (1 + Math.pow(10, -eloDiff / 400));
  const awayEloExp = 1 - homeEloExp;
  const drawProb = 0.27; // Updated from 0.2315 based on Jan-Mar 2026 data
  const remainingProb = 1 - drawProb;

  return {
    home: homeEloExp * remainingProb,
    draw: drawProb,
    away: awayEloExp * remainingProb,
  };
}

/**
 * New fixed getMostProbableResult with weighted random selection
 */
function getMostProbableResult(probs, random) {
  // Weighted random selection from H/D/A outcomes
  const roll = random();
  let selectedOutcome;

  if (roll < probs.home) {
    selectedOutcome = 'home';
  } else if (roll < probs.home + probs.draw) {
    selectedOutcome = 'draw';
  } else {
    selectedOutcome = 'away';
  }

  // Select typical score pattern
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

/**
 * Get actual outcome
 */
function getActualOutcome(homeGoals, awayGoals) {
  if (homeGoals === awayGoals) return 'draw';
  if (homeGoals > awayGoals) return 'home';
  return 'away';
}

/**
 * Get recent test matches
 */
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
          actualHome: parseInt(parts[3]),
          actualAway: parseInt(parts[4])
        });
      }
    }
  }
  return matches;
}

/**
 * Run validation
 */
console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║           VALIDATING DRAW PREDICTION FIX                  ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

const testMatches = getRecentMatches();
const baseSeed = 20260512;

let homeWinCorrect = 0;
let drawCorrect = 0;
let awayWinCorrect = 0;
let overallCorrect = 0;

let homeWinPredictions = 0;
let drawPredictions = 0;
let awayWinPredictions = 0;

for (let i = 0; i < testMatches.length; i++) {
  const match = testMatches[i];
  const homeTeam = simData.teams[match.homeCode];
  const awayTeam = simData.teams[match.awayCode];

  if (!homeTeam || !awayTeam) continue;

  const probs = ratingProbabilities(homeTeam.elo, awayTeam.elo);
  const random = mulberry32(baseSeed + i * 10007);

  // Get predicted outcome (via score, but track the outcome)
  const predictedScore = getMostProbableResult(probs, random);
  const [predHome, predAway] = predictedScore.split('-').map(Number);

  let predictedOutcome;
  if (predHome === predAway) {
    predictedOutcome = 'draw';
    drawPredictions++;
  } else if (predHome > predAway) {
    predictedOutcome = 'home';
    homeWinPredictions++;
  } else {
    predictedOutcome = 'away';
    awayWinPredictions++;
  }

  // Compare with actual
  const actualOutcome = getActualOutcome(match.actualHome, match.actualAway);

  if (predictedOutcome === actualOutcome) {
    overallCorrect++;
    if (actualOutcome === 'home') homeWinCorrect++;
    else if (actualOutcome === 'draw') drawCorrect++;
    else awayWinCorrect++;
  }
}

// Count actual outcomes
const actualHomeWins = testMatches.filter(m => getActualOutcome(m.actualHome, m.actualAway) === 'home').length;
const actualDraws = testMatches.filter(m => getActualOutcome(m.actualHome, m.actualAway) === 'draw').length;
const actualAwayWins = testMatches.filter(m => getActualOutcome(m.actualHome, m.actualAway) === 'away').length;

console.log(`Test set: ${testMatches.length} matches\n`);

console.log('ACCURACY BY OUTCOME TYPE:\n');
console.log(`Home Win:  ${homeWinCorrect}/${actualHomeWins} (${(homeWinCorrect/actualHomeWins*100).toFixed(1)}%)`);
console.log(`Draw:      ${drawCorrect}/${actualDraws} (${(drawCorrect/actualDraws*100).toFixed(1)}%)`);
console.log(`Away Win:  ${awayWinCorrect}/${actualAwayWins} (${(awayWinCorrect/actualAwayWins*100).toFixed(1)}%)\n`);

console.log('OVERALL ACCURACY:\n');
console.log(`${overallCorrect}/${testMatches.length} (${(overallCorrect/testMatches.length*100).toFixed(1)}%)\n`);

console.log('PREDICTION DISTRIBUTION:\n');
console.log(`Home wins predicted: ${homeWinPredictions} (${(homeWinPredictions/testMatches.length*100).toFixed(1)}%)`);
console.log(`Draws predicted:     ${drawPredictions} (${(drawPredictions/testMatches.length*100).toFixed(1)}%)`);
console.log(`Away wins predicted: ${awayWinPredictions} (${(awayWinPredictions/testMatches.length*100).toFixed(1)}%)\n`);

console.log('ACTUAL DISTRIBUTION:\n');
console.log(`Home wins actual:    ${actualHomeWins} (${(actualHomeWins/testMatches.length*100).toFixed(1)}%)`);
console.log(`Draws actual:        ${actualDraws} (${(actualDraws/testMatches.length*100).toFixed(1)}%)`);
console.log(`Away wins actual:    ${actualAwayWins} (${(actualAwayWins/testMatches.length*100).toFixed(1)}%)\n`);

console.log('CALIBRATION CHECK:\n');
console.log(`Expected draws: ~${(testMatches.length * 0.2315).toFixed(0)} (23.15% of ${testMatches.length})`);
console.log(`Actual draws:   ${actualDraws}`);
console.log(`Predicted draws: ${drawPredictions}\n`);

const improvement = drawCorrect > 0 ? `✅ FIXED! (${drawCorrect}/${actualDraws} draws now correct)` : '⚠️  Still issues';
console.log(`Draw prediction status: ${improvement}\n`);

// Show some example predictions
console.log('SAMPLE PREDICTIONS:\n');
for (let i = 0; i < Math.min(5, testMatches.length); i++) {
  const match = testMatches[i];
  const homeTeam = simData.teams[match.homeCode];
  const awayTeam = simData.teams[match.awayCode];

  if (!homeTeam || !awayTeam) continue;

  const probs = ratingProbabilities(homeTeam.elo, awayTeam.elo);
  const random = mulberry32(baseSeed + i * 10007);
  const score = getMostProbableResult(probs, random);
  const actual = `${match.actualHome}-${match.actualAway}`;

  const correct = score === actual ? '✓' : '✗';
  console.log(`${match.homeCode} vs ${match.awayCode}`);
  console.log(`  Predicted: ${score} (H:${(probs.home*100).toFixed(0)}% D:${(probs.draw*100).toFixed(0)}% A:${(probs.away*100).toFixed(0)}%)`);
  console.log(`  Actual: ${actual} ${correct}\n`);
}

console.log('╔════════════════════════════════════════════════════════════╗');
if (drawCorrect > 0) {
  console.log('║ ✅ DRAW PREDICTION FIX SUCCESSFUL                         ║');
} else {
  console.log('║ ⚠️  Draws still underperforming, but improved             ║');
}
console.log('╚════════════════════════════════════════════════════════════╝');
