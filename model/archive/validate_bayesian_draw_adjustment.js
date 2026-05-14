/**
 * Test: Bayesian Draw Adjustment
 *
 * Hypothesis: Individual teams have draw tendencies
 * Some teams draw more (defensive), some less (aggressive)
 *
 * Approach: Calculate each team's historical draw rate,
 * then blend with base 0.27 rate using Bayesian update
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
  if (!teamName) return null;
  if (nameToCodeMap[teamName]) return nameToCodeMap[teamName];
  for (const [name, code] of Object.entries(nameToCodeMap)) {
    if (name.toLowerCase() === teamName.toLowerCase()) return code;
  }
  return null;
}

// Calculate team draw tendencies from historical data
const teamDrawRates = {};
for (const match of historicalMatches) {
  const homeCode = getTeamCode(match.home_team);
  const awayCode = getTeamCode(match.away_team);

  if (!homeCode || !awayCode) continue;

  const homeGoals = parseInt(match.home_score);
  const awayGoals = parseInt(match.away_score);
  const isDraw = homeGoals === awayGoals;

  if (!teamDrawRates[homeCode]) teamDrawRates[homeCode] = { draws: 0, total: 0 };
  if (!teamDrawRates[awayCode]) teamDrawRates[awayCode] = { draws: 0, total: 0 };

  teamDrawRates[homeCode].total++;
  teamDrawRates[awayCode].total++;

  if (isDraw) {
    teamDrawRates[homeCode].draws++;
    teamDrawRates[awayCode].draws++;
  }
}

// Calculate draw probability for each team
const teamDrawProbs = {};
for (const [code, stats] of Object.entries(teamDrawRates)) {
  if (stats.total < 10) {
    teamDrawProbs[code] = 0.27;
  } else {
    const observed = stats.draws / stats.total;
    const prior = 0.27;
    const confidence = Math.min(stats.total / 50, 1);
    teamDrawProbs[code] = prior * (1 - confidence) + observed * confidence;
  }
}

function ratingProbabilitiesFixed(homeRating, awayRating) {
  const eloDiff = homeRating - awayRating;
  const homeEloExp = 1 / (1 + Math.pow(10, -eloDiff / 400));
  const awayEloExp = 1 - homeEloExp;
  const drawProb = 0.27;
  const remainingProb = 1 - drawProb;

  return {
    home: homeEloExp * remainingProb,
    draw: drawProb,
    away: awayEloExp * remainingProb,
  };
}

function ratingProbabilitiesBayesian(homeCode, awayCode, homeRating, awayRating) {
  const eloDiff = homeRating - awayRating;
  const homeEloExp = 1 / (1 + Math.pow(10, -eloDiff / 400));
  const awayEloExp = 1 - homeEloExp;

  const homeDrawTendency = teamDrawProbs[homeCode] || 0.27;
  const awayDrawTendency = teamDrawProbs[awayCode] || 0.27;
  const drawProb = (homeDrawTendency + awayDrawTendency) / 2;

  const remainingProb = 1 - drawProb;

  return {
    home: homeEloExp * remainingProb,
    draw: drawProb,
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
console.log('║   TESTING: Bayesian Team Draw Adjustment                  ║');
console.log('║                                                            ║');
console.log('║   Hypothesis: Teams have individual draw tendencies       ║');
console.log('║   - Defensive teams draw more (e.g., 35%+)                 ║');
console.log('║   - Aggressive teams draw less (e.g., 20%-)                ║');
console.log('║   - Blend both teams\' tendencies for each match            ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

const testMatches = getRecentMatches();
const baseSeed = 20260512;

const fixedResults = [];
const bayesianResults = [];

for (let i = 0; i < testMatches.length; i++) {
  const match = testMatches[i];
  const homeTeam = simData.teams[match.homeCode];
  const awayTeam = simData.teams[match.awayCode];

  if (!homeTeam || !awayTeam) continue;

  const probsFixed = ratingProbabilitiesFixed(homeTeam.elo, awayTeam.elo);
  const randomFixed = mulberry32(baseSeed + i * 10007);
  const scoreFixed = getMostProbableResult(probsFixed, randomFixed);
  const outcomeFixed = scoreFixed.split('-')[0] > scoreFixed.split('-')[1] ? 'home' : scoreFixed.split('-')[0] < scoreFixed.split('-')[1] ? 'away' : 'draw';

  const probsBayesian = ratingProbabilitiesBayesian(match.homeCode, match.awayCode, homeTeam.elo, awayTeam.elo);
  const randomBayesian = mulberry32(baseSeed + i * 10007);
  const scoreBayesian = getMostProbableResult(probsBayesian, randomBayesian);
  const outcomeBayesian = scoreBayesian.split('-')[0] > scoreBayesian.split('-')[1] ? 'home' : scoreBayesian.split('-')[0] < scoreBayesian.split('-')[1] ? 'away' : 'draw';

  const actualOutcome = match.actualHome > match.actualAway ? 'home' : match.actualHome < match.actualAway ? 'away' : 'draw';

  fixedResults.push({
    match: `${match.homeCode} vs ${match.awayCode}`,
    outcome: outcomeFixed,
    score: scoreFixed,
    correct: outcomeFixed === actualOutcome,
    drawProb: probsFixed.draw,
    actual: match.actualScore
  });

  bayesianResults.push({
    match: `${match.homeCode} vs ${match.awayCode}`,
    outcome: outcomeBayesian,
    score: scoreBayesian,
    correct: outcomeBayesian === actualOutcome,
    drawProb: probsBayesian.draw,
    actual: match.actualScore
  });
}

const fixedCorrect = fixedResults.filter(r => r.correct).length;
const fixedAccuracy = fixedCorrect / fixedResults.length;

const bayesianCorrect = bayesianResults.filter(r => r.correct).length;
const bayesianAccuracy = bayesianCorrect / bayesianResults.length;

const fixedDraws = fixedResults.filter(r => r.outcome === 'draw').length;
const bayesianDraws = bayesianResults.filter(r => r.outcome === 'draw').length;

console.log(`Test set: ${fixedResults.length} matches\n`);

console.log('═══════════════════════════════════════════════════════════\n');
console.log('OVERALL ACCURACY\n');
console.log('═══════════════════════════════════════════════════════════\n');

console.log(`Fixed Model:    ${fixedCorrect}/${fixedResults.length} = ${(fixedAccuracy * 100).toFixed(1)}%`);
console.log(`Bayesian Model: ${bayesianCorrect}/${bayesianResults.length} = ${(bayesianAccuracy * 100).toFixed(1)}%`);
console.log(`Difference:     ${((bayesianAccuracy - fixedAccuracy) * 100).toFixed(1)}pp\n`);

console.log('═══════════════════════════════════════════════════════════\n');
console.log('DRAW PREDICTIONS\n');
console.log('═══════════════════════════════════════════════════════════\n');

console.log(`Fixed Model predicts:    ${fixedDraws} draws (${(fixedDraws / fixedResults.length * 100).toFixed(1)}%)`);
console.log(`Bayesian Model predicts: ${bayesianDraws} draws (${(bayesianDraws / bayesianResults.length * 100).toFixed(1)}%)\n`);

const bayesianByOutcome = { home: { correct: 0, total: 0 }, draw: { correct: 0, total: 0 }, away: { correct: 0, total: 0 } };
for (const r of bayesianResults) {
  bayesianByOutcome[r.outcome].total++;
  if (r.correct) bayesianByOutcome[r.outcome].correct++;
}

console.log('Bayesian Model - Breakdown by Outcome:\n');
console.log(`Home: ${bayesianByOutcome.home.correct}/${bayesianByOutcome.home.total} (${(bayesianByOutcome.home.correct / bayesianByOutcome.home.total * 100).toFixed(1)}%)`);
console.log(`Draw: ${bayesianByOutcome.draw.correct}/${bayesianByOutcome.draw.total} (${(bayesianByOutcome.draw.correct / bayesianByOutcome.draw.total * 100).toFixed(1)}%)`);
console.log(`Away: ${bayesianByOutcome.away.correct}/${bayesianByOutcome.away.total} (${(bayesianByOutcome.away.correct / bayesianByOutcome.away.total * 100).toFixed(1)}%)\n`);

console.log('═══════════════════════════════════════════════════════════\n');
console.log('TEAMS WITH HIGHEST DRAW TENDENCY (>35%)\n');
console.log('═══════════════════════════════════════════════════════════\n');

const highDrawTeams = Object.entries(teamDrawProbs)
  .filter(([code, prob]) => prob > 0.35)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10);

if (highDrawTeams.length === 0) {
  console.log('(No teams with >35% draw rate)');
} else {
  for (const [code, prob] of highDrawTeams) {
    const stats = teamDrawRates[code];
    console.log(`${code}: ${(prob * 100).toFixed(1)}% (${stats.draws}/${stats.total} draws)`);
  }
}

console.log('\n═══════════════════════════════════════════════════════════\n');
console.log('TEAMS WITH LOWEST DRAW TENDENCY (<20%)\n');
console.log('═══════════════════════════════════════════════════════════\n');

const lowDrawTeams = Object.entries(teamDrawProbs)
  .filter(([code, prob]) => prob < 0.20)
  .sort((a, b) => a[1] - b[1])
  .slice(0, 10);

if (lowDrawTeams.length === 0) {
  console.log('(No teams with <20% draw rate)');
} else {
  for (const [code, prob] of lowDrawTeams) {
    const stats = teamDrawRates[code];
    console.log(`${code}: ${(prob * 100).toFixed(1)}% (${stats.draws}/${stats.total} draws)`);
  }
}

console.log('\n═══════════════════════════════════════════════════════════\n');
console.log('VERDICT\n');
console.log('═══════════════════════════════════════════════════════════\n');

if (bayesianAccuracy > fixedAccuracy + 0.01) {
  console.log('✅ BAYESIAN MODEL WINS!\n');
  console.log(`Improvement: +${((bayesianAccuracy - fixedAccuracy) * 100).toFixed(1)}pp`);
  console.log(`More appropriate draws: ${bayesianDraws - fixedDraws} adjustment\n`);
} else if (bayesianAccuracy > fixedAccuracy) {
  console.log('⚠️ MARGINAL\n');
  console.log(`Improvement: +${((bayesianAccuracy - fixedAccuracy) * 100).toFixed(1)}pp\n`);
} else {
  console.log('❌ BAYESIAN MODEL UNDERPERFORMS\n');
  console.log(`Regression: ${((bayesianAccuracy - fixedAccuracy) * 100).toFixed(1)}pp\n`);
}

console.log('═══════════════════════════════════════════════════════════');
